// metronome.js — the hardware. A singleton click engine that keeps ticking
// no matter which room you wander into (a metronome you have to babysit is
// a timer). Deliberately independent of the arrangement stage in engine.js:
// the click can run UNDER anything — pads, the Arranger, a drill — without
// the "one act on stage" rule silencing it.
//
// Pure math lives in lib/click.js; this file owns Tone nodes + scheduling.
// Same lookahead discipline as engine.playEvents: a 40ms JS tick schedules
// everything inside a 180ms horizon onto Tone's sample-accurate clock.
// Tone is a 250 KB chunk. A static import had the browser modulepreloading it
// on first paint, which is exactly what directive 5 asks us not to do — and
// the gesture gate makes deferring it free, because the click cannot
// start without start(), and start() is called from a transport button. The
// synchronous now() below answers 0 until then.
let Tone = null;
const loadTone = async () => {
  if (!Tone) Tone = await import("tone");
  return Tone;
};
import { clickPattern, secondsPerPulse } from "../lib/click.js";

const FREQ = { accent: 1568, beat: 1046, sub: 784 }; // G6 / C6 / G5 pings
const VEL = { accent: 1.0, beat: 0.72, sub: 0.4 };

export function createMetronome() {
  let synth = null;
  let gain = null;
  let state = { running: false, bpm: 96, meterId: "4/4", subdivision: 1, volume: 80 };
  const stateSubs = new Set();
  const pulseSubs = new Set();
  let timer = null;
  const uiTimers = new Set();
  let pattern = clickPattern(state.meterId, state.subdivision);
  let stepIdx = 0;
  let bar = 0;
  let nextTime = 0;
  let generation = 0;

  const volFor = (v) => Math.pow(Math.max(0, Math.min(100, v)) / 100, 2);

  const emit = () => {
    const snap = { ...state };
    for (const cb of stateSubs) { try { cb(snap); } catch { /* a broken listener never stops time */ } }
  };

  const ensureNodes = () => {
    if (synth) return;
    // Dry, straight to the output — a click through reverb is a dripping tap.
    gain = new Tone.Gain(volFor(state.volume)).toDestination();
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.055, sustain: 0, release: 0.02 },
    }).connect(gain);
    synth.volume.value = -6;
  };

  const later = (fn, ms) => {
    const id = setTimeout(() => { uiTimers.delete(id); fn(); }, Math.max(0, ms));
    uiTimers.add(id);
  };
  const clearLater = () => { for (const id of uiTimers) clearTimeout(id); uiTimers.clear(); };

  const tick = () => {
    if (!state.running) return;
    const AHEAD = 0.18;
    while (nextTime < Tone.now() + AHEAD) {
      const step = pattern.steps[stepIdx];
      const at = nextTime;
      try { synth.triggerAttackRelease(FREQ[step.kind], 0.05, at, VEL[step.kind] * (state.volume > 0 ? 1 : 0)); } catch { /* node mid-rebuild */ }
      const info = { kind: step.kind, step: stepIdx, bar, at };
      for (const cb of pulseSubs) later(() => { if (state.running) { try { cb(info); } catch { /* noop */ } } }, (at - Tone.now()) * 1000);
      // distance to the NEXT step, in pulse units — bpm reads live, so a
      // tempo change lands on the very next tick instead of the next bar
      const spp = secondsPerPulse(state.meterId, state.bpm);
      const nextT = stepIdx + 1 < pattern.steps.length ? pattern.steps[stepIdx + 1].t : pattern.totalPulses;
      nextTime += (nextT - step.t) * spp;
      stepIdx++;
      if (stepIdx >= pattern.steps.length) { stepIdx = 0; bar++; }
    }
  };

  return {
    async start() {
      if (state.running) return;
      const request = ++generation;
      // Flip BEFORE the await: two overlapping start() calls both passed the
      // guard and each armed its own setInterval on the one shared `timer`.
      state = { ...state, running: true };
      emit();
      try {
        await loadTone();
        if (request !== generation || !state.running) return;
        await Tone.start();
      } catch {
        if (request === generation) { state = { ...state, running: false }; emit(); }
        return; // a later gesture can retry a blocked context
      }
      if (request !== generation || !state.running) return;
      ensureNodes();
      pattern = clickPattern(state.meterId, state.subdivision);
      stepIdx = 0; bar = 0;
      nextTime = Tone.now() + 0.08;
      timer = setInterval(tick, 40);
      tick();
      emit();
    },
    stop() {
      generation++;
      if (!state.running) return;
      state = { ...state, running: false };
      clearInterval(timer); timer = null;
      clearLater();
      emit();
    },
    toggle() { return state.running ? this.stop() : this.start(); },
    /** Live-set any of { bpm, meterId, subdivision, volume }. Meter or
     * subdivision changes restart the bar (the count must stay honest). */
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      if (patch.meterId !== undefined || patch.subdivision !== undefined) {
        pattern = clickPattern(state.meterId, state.subdivision);
        if (state.running && Tone && timer != null && (patch.meterId !== prev.meterId || patch.subdivision !== prev.subdivision)) {
          stepIdx = 0; bar = 0; nextTime = Tone.now() + 0.08;
        }
      }
      if (patch.volume !== undefined && gain) {
        try { gain.gain.rampTo(volFor(state.volume), 0.05); } catch { /* noop */ }
      }
      emit();
    },
    getState: () => ({ ...state }),
    subscribe(cb) { stateSubs.add(cb); return () => stateSubs.delete(cb); },
    /** Scheduled ticks for lamps and sync (Perform's scroll, The Session). */
    onPulse(cb) { pulseSubs.add(cb); return () => pulseSubs.delete(cb); },
    now: () => (Tone ? Tone.now() : 0),
    dispose() {
      this.stop();
      try { synth?.dispose(); } catch { /* noop */ }
      try { gain?.dispose(); } catch { /* noop */ }
      synth = gain = null;
    },
  };
}

// The one metronome. Rooms mount controllers for it; nobody owns it.
export const metronome = createMetronome();
