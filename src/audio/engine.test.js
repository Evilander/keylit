import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ nodes: [], samplers: [], polys: [], start: null, context: null }));
vi.mock("tone", () => {
  const now = () => Date.now() / 1000 + 0.1;
  // Tone Context timeouts use now() including lookAhead. PolySynth allocates
  // a voice only when that callback runs, so releaseAll cannot cancel it early.
  const context = {
    state: "running", pending: new Set(),
    setTimeout(fn, seconds) {
      const id = setTimeout(() => { this.pending.delete(id); fn(); }, Math.max(0, seconds * 1000));
      this.pending.add(id); return id;
    },
    clearTimeout(id) { clearTimeout(id); this.pending.delete(id); },
  };
  audio.context = context;
  class Node {
    constructor(options = {}) {
      this.options = options;
      this.volume = { value: 0 };
      this.gain = { value: typeof options === "number" ? options : 1 };
      this.connect = vi.fn(() => this);
      this.Q = { value: 0 };
      this.envelope = {};
      this.triggerAttackRelease = vi.fn();
      this.triggerAttack = vi.fn();
      this.triggerRelease = vi.fn();
      this.releaseAll = vi.fn();
      this.dispose = vi.fn();
      audio.nodes.push(this);
    }
    connect() { return this; }
    toDestination() { return this; }
  }
  class Sampler extends Node {
    constructor(options) {
      super(options); this.active = new Map(); this.sources = [];
      this.triggerAttack = vi.fn((note, at = now()) => {
        const source = { note, attackAt: at, stopAt: null };
        this.sources.push(source);
        this.active.set(note, [...(this.active.get(note) || []), source]);
      });
      this.triggerRelease = vi.fn((note, at = now()) => {
        for (const source of this.active.get(note) || []) source.stopAt = at;
        this.active.set(note, []);
      });
      // Installed Sampler schedules source.stop(time), then immediately clears
      // the pitch's source list even when time is in the future.
      this.triggerAttackRelease = vi.fn((note, dur, at = now()) => {
        this.triggerAttack(note, at); this.triggerRelease(note, at + dur);
      });
      this.releaseAll = vi.fn(() => {
        for (const sources of this.active.values()) for (const source of sources) source.stopAt = now();
        this.active.clear();
      });
      audio.samplers.push(this);
    }
  }
  class PolySynth extends Node {
    constructor(...args) {
      super(...args); this.active = []; this.attacks = []; this.releases = [];
      const schedule = (fn, at) => {
        if (this.disposed) return;
        if (at <= now()) fn();
        else context.setTimeout(() => schedule(fn, at), at - now());
      };
      const release = (voice, at) => {
        this.releases.push({ note: voice.note, at });
        // Approximate the configured envelope's onsilence cleanup. Allocation
        // and first-unreleased-note matching follow installed PolySynth.js.
        setTimeout(() => { this.active = this.active.filter((v) => v !== voice); }, 1300);
      };
      this.triggerAttack = vi.fn((note, at = now()) => schedule(() => {
        this.active.push({ note, released: false }); this.attacks.push({ note, at });
      }, at));
      this.triggerRelease = vi.fn((note, at = now()) => schedule(() => {
        const voice = this.active.find((v) => v.note === note && !v.released);
        if (voice) { release(voice, at); voice.released = true; }
      }, at));
      this.triggerAttackRelease = vi.fn((note, dur, at = now()) => {
        this.triggerAttack(note, at); this.triggerRelease(note, at + dur);
      });
      this.releaseAll = vi.fn(() => { for (const voice of this.active) release(voice, now()); });
      this.dispose = vi.fn(() => { this.disposed = true; this.active = []; });
      audio.polys.push(this);
    }
  }
  return {
    start: () => audio.start(), getContext: () => context, now,
    Frequency: (midi) => ({ toNote: () => midi }),
    Gain: Node, Reverb: Node, PolySynth, Synth: Node, MonoSynth: Node, MembraneSynth: Node,
    NoiseSynth: Node, Filter: Node, MetalSynth: Node, Sampler,
  };
});

import { createEngine } from "./engine.js";

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

describe("audio engine lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    audio.nodes = []; audio.samplers = []; audio.polys = []; audio.start = () => Promise.resolve();
    audio.context?.pending.clear();
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("does not build an audio graph after disposal while unlocking", async () => {
    const unlock = pending();
    audio.start = () => unlock.promise;
    const engine = createEngine();
    const ready = engine.init();
    await settle();
    engine.dispose();
    unlock.resolve();
    await ready;
    expect(audio.nodes).toHaveLength(0);
    expect(engine.getState()).toEqual({ engine: "off", loading: false });
  });

  it("concurrent callers wait for the same graph to become ready", async () => {
    const engine = createEngine();
    await engine.init(); // import Tone before exercising the unlock race
    engine.dispose(); audio.nodes = []; audio.samplers = [];
    const unlock = pending();
    audio.start = () => unlock.promise;
    const first = engine.init();
    await settle();
    let secondReady = false;
    const second = engine.init().then(() => { secondReady = true; });
    await settle();
    expect(secondReady).toBe(false);
    unlock.resolve();
    await Promise.all([first, second]);
    expect(audio.samplers).toHaveLength(1);
    engine.play([60]);
    expect(audio.nodes.some((node) => node.triggerAttackRelease.mock.calls.length)).toBe(true);
    engine.dispose();
  });

  it("disposes a loading sampler and ignores its late completion after revival", async () => {
    const engine = createEngine();
    await engine.init();
    const old = audio.samplers[0];
    engine.dispose();
    expect(old.dispose).toHaveBeenCalled();
    await engine.init();
    old.options.onload();
    engine.play([60]);
    expect(old.triggerAttackRelease).not.toHaveBeenCalled();
    expect(engine.getState().engine).toBe("synth");
    const current = audio.samplers[1];
    current.options.onload();
    engine.play([64]);
    expect(current.triggerAttackRelease).toHaveBeenCalled();
    engine.dispose();
  });

  it("disposal cancels arrangement callbacks, intervals, and sample loading timers", async () => {
    const engine = createEngine();
    await engine.init();
    const onStep = vi.fn();
    engine.playEvents({ events: [{ t: 0, dur: 1, midis: [60] }], totalBeats: 1 }, { loop: true, onStep });
    engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("stopping before a queued synth attack prevents it from starting later", async () => {
    const engine = createEngine();
    await engine.init();
    const handle = engine.playEvents({ events: [{ t: 0, dur: 1, midis: [60] }], totalBeats: 1 });
    handle.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(audio.polys[0].attacks).toEqual([]);
    engine.dispose();
  });

  it("a stopped arrangement's queued note-off cannot cut a later same-pitch note", async () => {
    const engine = createEngine();
    await engine.init();
    const first = engine.playEvents({ events: [{ t: 0, dur: 8, midis: [60] }], totalBeats: 8 }, { bpm: 60 });
    await vi.advanceTimersByTimeAsync(250);
    first.stop();
    await vi.advanceTimersByTimeAsync(1500); // first voice has finished its release tail
    const synth = audio.polys[0];
    const second = engine.playEvents({ events: [{ t: 0, dur: 10, midis: [60] }], totalBeats: 10 }, { bpm: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const releases = synth.releases.length;
    await vi.advanceTimersByTimeAsync(7000); // crosses the cancelled first note's old off time
    expect(synth.releases).toHaveLength(releases);
    second.stop(); engine.dispose();
  });

  it("stopping a sampled note releases it now instead of waiting for its scheduled off", async () => {
    const engine = createEngine();
    await engine.init();
    const sampler = audio.samplers[0]; sampler.options.onload();
    const handle = engine.playEvents({ events: [{ t: 0, dur: 4, midis: [60] }], totalBeats: 4 }, { bpm: 60 });
    await vi.advanceTimersByTimeAsync(250);
    handle.stop();
    expect(sampler.sources[0].stopAt).toBeCloseTo(engine.now(), 6);
    expect(sampler.options.release).toBe(1); // preserve the piano's natural release tail
    engine.dispose();
  });

  it("same-pitch sampler re-strikes across windows cancel old offs without cutting the new note", async () => {
    const engine = createEngine();
    await engine.init();
    const sampler = audio.samplers[0]; sampler.options.onload();
    const first = engine.playEvents({ events: [{ t: 0, dur: 4, midis: [60] }], totalBeats: 1 }, { bpm: 60 });
    await vi.advanceTimersByTimeAsync(1500); // first window completes while its note still holds
    const second = engine.playEvents({ events: [{ t: 0, dur: 6, midis: [60, 64] }], totalBeats: 6 }, { bpm: 60 });
    await vi.advanceTimersByTimeAsync(100);
    expect(sampler.sources[0].stopAt).toBeCloseTo(sampler.sources[1].attackAt, 6);
    first.stop(); // this old window must not release the new window's voices
    await vi.advanceTimersByTimeAsync(3000); // crosses the first note's obsolete off time
    expect(sampler.sources.slice(1).every((source) => source.stopAt === null || source.stopAt > engine.now())).toBe(true);
    second.stop(); engine.dispose();
  });

  it("natural completion preserves long sampled holds until their own note-offs", async () => {
    const engine = createEngine();
    await engine.init();
    const sampler = audio.samplers[0]; sampler.options.onload();
    const onDone = vi.fn();
    engine.playEvents({ events: [{ t: 0, dur: 2, midis: [60] }], totalBeats: 0.25 }, { bpm: 60, onDone });
    await vi.advanceTimersByTimeAsync(400);
    expect(onDone).toHaveBeenCalledOnce();
    expect(sampler.sources[0].stopAt === null || sampler.sources[0].stopAt > engine.now()).toBe(true);
    await vi.advanceTimersByTimeAsync(1800);
    expect(sampler.sources[0].stopAt).toBeCloseTo(sampler.sources[0].attackAt + 2, 6);
    expect(audio.context.pending.size).toBe(0);
    engine.dispose();
  });

  it("stopping a piano window does not release another window's bass note", async () => {
    const engine = createEngine();
    await engine.init();
    const piano = engine.playEvents({ events: [{ t: 0, dur: 4, midis: [60] }], totalBeats: 4 });
    const band = engine.playEvents({ events: [{ t: 0, dur: 4, midis: [36], ch: "bass" }], totalBeats: 4 });
    await vi.advanceTimersByTimeAsync(250);
    const bass = audio.nodes.find((node) => node.options.filterEnvelope);
    piano.stop();
    expect(bass.triggerRelease).not.toHaveBeenCalled();
    band.stop();
    expect(bass.triggerRelease).toHaveBeenCalledOnce();
    engine.dispose();
  });
 it("mutes the shared piano and band output before init and during a take", async () => {
  const engine = createEngine();
  engine.setMuted(true);
  await engine.init();
  const output = audio.nodes.find((node) => node.options === 0);
  expect(output.gain.value).toBe(0);
  expect(audio.nodes.filter((node) => node.connect.mock.calls.some(([target]) => target === output)).length).toBeGreaterThan(4);
  engine.setMuted(false);
  expect(output.gain.value).toBe(1);
  engine.setMuted(true);
  expect(output.gain.value).toBe(0);
  engine.dispose();
 });

});
