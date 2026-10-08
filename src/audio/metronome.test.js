import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ start: null }));
vi.mock("tone", () => {
  class Node {
    constructor() { this.volume = { value: 0 }; this.gain = { rampTo: vi.fn() }; }
    connect() { return this; }
    toDestination() { return this; }
    triggerAttackRelease() {}
    dispose() {}
  }
  return { start: () => audio.start(), now: () => Date.now() / 1000, Gain: Node, PolySynth: Node, Synth: Node };
});

import { createMetronome } from "./metronome.js";
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe("metronome lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); audio.start = () => Promise.resolve(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("a stop/restart during context unlock arms only the current transport", async () => {
    const click = createMetronome();
    await click.start(); click.stop(); // preload Tone
    const unlocks = [];
    audio.start = () => new Promise((resolve) => { unlocks.push(resolve); });
    const first = click.start();
    await settle(); click.stop();
    const second = click.start();
    await settle();
    expect(unlocks).toHaveLength(2);
    unlocks[0](); await first;
    expect(vi.getTimerCount()).toBe(0);
    unlocks[1](); await second;
    expect(vi.getTimerCount()).toBe(1);
    click.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an unlock failure returns the transport to stopped so the next gesture can retry", async () => {
    const click = createMetronome();
    audio.start = () => Promise.reject(new Error("blocked"));
    await click.start();
    expect(click.getState().running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    audio.start = () => Promise.resolve();
    await click.start();
    expect(click.getState().running).toBe(true);
    click.dispose();
  });
});

it("accepts meter changes while the first Tone import is pending", async () => {
  vi.resetModules();
  const { createMetronome: fresh } = await import("./metronome.js");
  const click = fresh();
  audio.start = () => Promise.resolve();
  const ready = click.start();
  expect(() => click.set({ meterId: "3/4", subdivision: 2 })).not.toThrow();
  await ready;
  expect(click.getState()).toMatchObject({ running: true, meterId: "3/4", subdivision: 2 });
  click.dispose();
});
