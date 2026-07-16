// engine.js — the Bench's sound, extracted from App.jsx (Phase 0 / Step 0).
// Owns the whole Tone.js lifecycle: reverb bus, instant synth fallback, the
// Salamander grand swapping in over it when samples land, and a lookahead
// scheduler for timed arrangements. Deliberately NOT in lib/ (touches audio).
//
// Gotchas preserved from the inline era:
//  - Tone.start() must run inside a user gesture → init() is called from
//    click/keydown handlers, never on mount.
//  - The instrument changes identity at runtime (synth → sampler); everything
//    reads the live `instrument` binding at play time, never a captured ref.
//  - dispose()/init() may cycle (StrictMode remounts): init() revives a
//    disposed engine by rebuilding the node graph from scratch.
import * as Tone from "tone";

const SALAMANDER = {
  A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
  A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
  A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
  A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
  A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
  A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
  A6: "A6.mp3", C7: "C7.mp3",
};
const SALAMANDER_BASE = "https://tonejs.github.io/audio/salamander/";

export function createEngine({ onState } = {}) {
  let inited = false;
  let disposed = false;
  let instrument = null, synth = null, sampler = null, reverb = null;
  let bassSynth = null, kit = null, kitNodes = [];
  let state = { engine: "off", loading: false };

  const set = (patch) => {
    state = { ...state, ...patch };
    try { onState?.(state); } catch { /* listener errors never kill audio */ }
  };

  // The rhythm section: an upright-ish mono bass and a synthesized kit.
  // No samples — the band is ready the instant the engine is, offline included.
  const buildBand = () => {
    const nodes = [];
    const keep = (n) => { nodes.push(n); return n; };

    bassSynth = keep(new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 1, rolloff: -24 },
      filterEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.3, release: 0.5, baseFrequency: 80, octaves: 3.2 },
      envelope: { attack: 0.008, decay: 0.25, sustain: 0.8, release: 0.3 },
    })).toDestination();
    bassSynth.volume.value = -5;

    const kick = keep(new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 7,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0.005, release: 0.6 },
    })).toDestination();
    kick.volume.value = -6;

    const snareFilter = keep(new Tone.Filter(1800, "bandpass")).toDestination();
    const snare = keep(new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    })).connect(snareFilter);
    snare.volume.value = -8;

    const stickFilter = keep(new Tone.Filter(2600, "bandpass")).toDestination();
    stickFilter.Q.value = 3;
    const stick = keep(new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
    })).connect(stickFilter);
    stick.volume.value = -10;

    const hatFilter = keep(new Tone.Filter(9000, "highpass")).toDestination();
    const hat = keep(new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    })).connect(hatFilter);
    hat.volume.value = -14;

    const shakerFilter = keep(new Tone.Filter(6000, "bandpass")).toDestination();
    shakerFilter.Q.value = 2;
    const shaker = keep(new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.004, decay: 0.05, sustain: 0 },
    })).connect(shakerFilter);
    shaker.volume.value = -14;

    const ride = keep(new Tone.MetalSynth({
      envelope: { attack: 0.002, decay: 0.7, release: 0.5 },
      harmonicity: 5.1, modulationIndex: 18, resonance: 4200, octaves: 1.2,
    })).toDestination();
    ride.volume.value = -20;

    const crash = keep(new Tone.MetalSynth({
      envelope: { attack: 0.002, decay: 1.6, release: 1.2 },
      harmonicity: 4.1, modulationIndex: 24, resonance: 3600, octaves: 1.6,
    })).toDestination();
    crash.volume.value = -18;

    // GM percussion number -> how to strike it. Noise voices re-shape their
    // envelope per piece (open vs pedal hat share one synth).
    kit = {
      36: (at, vel) => kick.triggerAttackRelease(48, 0.4, at, vel),               // kick: ~G1 drop
      37: (at, vel) => stick.triggerAttackRelease(0.03, at, vel),                 // side stick
      38: (at, vel) => snare.triggerAttackRelease(0.18, at, vel),                 // snare
      42: (at, vel) => { hat.envelope.decay = 0.05; hat.triggerAttackRelease(0.05, at, vel); },   // closed hat
      44: (at, vel) => { hat.envelope.decay = 0.07; hat.triggerAttackRelease(0.07, at, vel * 0.8); }, // pedal hat
      46: (at, vel) => { hat.envelope.decay = 0.3; hat.triggerAttackRelease(0.3, at, vel); },     // open hat
      49: (at, vel) => crash.triggerAttackRelease(300, 1.6, at, vel),             // crash
      51: (at, vel) => ride.triggerAttackRelease(200, 0.7, at, vel),              // ride
      53: (at, vel) => ride.triggerAttackRelease(320, 0.4, at, vel),              // ride bell
      70: (at, vel) => shaker.triggerAttackRelease(0.05, at, vel),                // shaker
    };
    kitNodes = nodes;
  };

  const build = () => {
    reverb = new Tone.Reverb({ decay: 2.4, wet: 0.22 }).toDestination();
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.006, decay: 0.9, sustain: 0.12, release: 1.3 },
    });
    synth.volume.value = -7;
    synth.connect(reverb);
    instrument = synth;
    try { buildBand(); } catch { bassSynth = null; kit = null; } // band is optional; piano must survive
    set({ engine: "synth", loading: true });
    try {
      const s = new Tone.Sampler({
        urls: SALAMANDER, baseUrl: SALAMANDER_BASE, release: 1,
        onload: () => {
          if (disposed) { try { s.dispose(); } catch { /* noop */ } return; }
          sampler = s; instrument = s;
          set({ engine: "piano", loading: false });
        },
      });
      s.connect(reverb);
      setTimeout(() => { if (instrument !== s) set({ loading: false }); }, 12000);
    } catch { set({ loading: false }); }
  };

  const init = async () => {
    if (inited && !disposed) {
      // the first gesture's Tone.start() can fail under autoplay policy;
      // `inited` used to latch that failure forever — honor the comment
      // below and retry the unlock on every later gesture until it takes
      if (Tone.getContext().state !== "running") {
        try { await Tone.start(); } catch { /* still locked; next gesture */ }
      }
      return;
    }
    inited = true; disposed = false;
    try { await Tone.start(); } catch { /* autoplay policy; retried next gesture */ }
    build();
  };

  // A chord/notes hit: slight per-note stagger keeps it human.
  const play = (midis, dur = 1.4, { stagger = 0.013, velocity } = {}) => {
    if (!midis || !midis.length || !instrument || disposed) return;
    const t0 = Tone.now();
    midis.forEach((m, i) => {
      const n = Tone.Frequency(m, "midi").toNote();
      try {
        if (velocity != null) instrument.triggerAttackRelease(n, dur, t0 + i * stagger, velocity);
        else instrument.triggerAttackRelease(n, dur, t0 + i * stagger);
      } catch { /* sampler mid-load */ }
    });
  };

  // Timed-event scheduler for arrangements. Events are in BEATS:
  // [{ t, dur, midis, v, ... }] plus totalBeats for looping. A 40ms tick
  // schedules everything inside a 180ms horizon into Tone's clock, so timing
  // is sample-accurate while start/stop stay instant.
  const playEvents = ({ events, totalBeats }, { bpm = 90, loop = false, onStep, onDone, startAt } = {}) => {
    if (!events || !events.length || disposed) return { stop() {} };
    const spb = 60 / bpm;
    const AHEAD = 0.18;
    let idx = 0, stopped = false;
    // startAt lets a caller chain windows seamlessly (The Session schedules
    // two bars at a time and butts each window against the last, drift-free).
    let base = startAt && startAt > Tone.now() ? startAt : Tone.now() + 0.1;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); };

    // One event, one player: drums hit the kit, bass takes the mono synth,
    // everything else is the piano. Unknown kit pieces stay silent rather
    // than guessing (a wrong drum is worse than a missing one).
    const strike = (e, at) => {
      if (e.ch === "drums") {
        if (!kit) return;
        for (const m of e.midis) {
          try { kit[m]?.(at, e.v ?? 0.7); } catch { /* voice busy */ }
        }
        return;
      }
      const target = e.ch === "bass" ? bassSynth : instrument;
      if (!target) return;
      for (const m of e.midis) {
        try {
          target.triggerAttackRelease(
            Tone.Frequency(m, "midi").toNote(),
            Math.max(0.09, e.dur * spb), at, e.v ?? 0.9
          );
        } catch { /* sampler mid-load */ }
      }
    };

    const tick = () => {
      if (stopped) return;
      const now = Tone.now();
      while (idx < events.length && base + events[idx].t * spb < now + AHEAD) {
        const e = events[idx];
        const at = base + e.t * spb;
        strike(e, at);
        if (onStep) later(() => { if (!stopped) onStep(e); }, (at - Tone.now()) * 1000);
        idx++;
      }
      if (idx >= events.length) {
        if (loop) { base += (totalBeats || events[events.length - 1].t + 4) * spb; idx = 0; }
        else {
          const endAt = base + (totalBeats || events[events.length - 1].t + 4) * spb;
          later(() => { if (!stopped) { stopped = true; clearInterval(timer); onDone?.(); } }, (endAt - Tone.now()) * 1000);
          clearInterval(timer);
        }
      }
    };
    const timer = setInterval(tick, 40);
    tick();
    return {
      // startTime is on Tone's clock — pair it with engine.now() to score
      // taps (the Meter Feel Trainer) against the same clock the audio uses.
      startTime: base,
      secondsPerBeat: spb,
      stop() {
        stopped = true;
        clearInterval(timer);
        for (const id of timers) clearTimeout(id);
        timers.clear();
        try { sampler?.releaseAll?.(); } catch { /* noop */ }
        try { synth?.releaseAll?.(); } catch { /* noop */ }
        // The bass holds long notes (a pedal drone runs a whole bar) — cut it
        // too, or it rings for seconds after the stop button.
        try { bassSynth?.triggerRelease?.(); } catch { /* noop */ }
      },
    };
  };

  const dispose = () => {
    disposed = true;
    try { synth?.dispose(); } catch { /* noop */ }
    try { sampler?.dispose(); } catch { /* noop */ }
    try { reverb?.dispose(); } catch { /* noop */ }
    for (const n of kitNodes) { try { n.dispose(); } catch { /* noop */ } }
    kitNodes = [];
    synth = sampler = reverb = instrument = bassSynth = kit = null;
    set({ engine: "off", loading: false });
  };

  return { init, play, playEvents, dispose, getState: () => state, now: () => Tone.now() };
}
