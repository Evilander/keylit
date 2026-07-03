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
  let state = { engine: "off", loading: false };

  const set = (patch) => {
    state = { ...state, ...patch };
    try { onState?.(state); } catch { /* listener errors never kill audio */ }
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
    if (inited && !disposed) return;
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
  const playEvents = ({ events, totalBeats }, { bpm = 90, loop = false, onStep, onDone } = {}) => {
    if (!events || !events.length || disposed) return { stop() {} };
    const spb = 60 / bpm;
    const AHEAD = 0.18;
    let idx = 0, stopped = false;
    let base = Tone.now() + 0.1;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); };

    const tick = () => {
      if (stopped) return;
      const now = Tone.now();
      while (idx < events.length && base + events[idx].t * spb < now + AHEAD) {
        const e = events[idx];
        const at = base + e.t * spb;
        for (const m of e.midis) {
          try {
            instrument?.triggerAttackRelease(
              Tone.Frequency(m, "midi").toNote(),
              Math.max(0.09, e.dur * spb), at, e.v ?? 0.9
            );
          } catch { /* sampler mid-load */ }
        }
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
      stop() {
        stopped = true;
        clearInterval(timer);
        for (const id of timers) clearTimeout(id);
        timers.clear();
        try { sampler?.releaseAll?.(); } catch { /* noop */ }
        try { synth?.releaseAll?.(); } catch { /* noop */ }
      },
    };
  };

  const dispose = () => {
    disposed = true;
    try { synth?.dispose(); } catch { /* noop */ }
    try { sampler?.dispose(); } catch { /* noop */ }
    try { reverb?.dispose(); } catch { /* noop */ }
    synth = sampler = reverb = instrument = null;
    set({ engine: "off", loading: false });
  };

  return { init, play, playEvents, dispose, getState: () => state };
}
