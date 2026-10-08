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
// Tone is a 250 KB chunk. A static import had the browser modulepreloading it
// on first paint, which is exactly what directive 5 asks us not to do — and
// the gesture gate makes deferring it free, because nothing here
// touches Tone before init(), and init() only ever runs from a click or a
// keydown. The synchronous now() below is the one exception, so it answers 0
// until the engine is armed.
let Tone = null;
const loadTone = async () => {
  if (!Tone) Tone = await import("tone");
  return Tone;
};

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
  let generation = 0, initPromise = null, sampleTimer = null;
  const schedules = new Set();
  const heldPiano = new Map();
  let instrument = null, synth = null, sampler = null, reverb = null;
  let output = null, muted = false;
  let bassSynth = null, bassVoice = null, kit = null, kitNodes = [];
  let state = { engine: "off", loading: false };

  const set = (patch) => {
    state = { ...state, ...patch };
    try { onState?.(state); } catch { /* listener errors never kill audio */ }
  };

  // The rhythm section: an upright-ish mono bass and a synthesized kit.
  // No samples — the band is ready the instant the engine is, offline included.
  const buildBand = () => {
    const nodes = [];
    const keep = (n) => { nodes.push(n); kitNodes = nodes; return n; };

    bassSynth = keep(new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 1, rolloff: -24 },
      filterEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.3, release: 0.5, baseFrequency: 80, octaves: 3.2 },
      envelope: { attack: 0.008, decay: 0.25, sustain: 0.8, release: 0.3 },
    })).connect(output);
    bassSynth.volume.value = -5;

    const kick = keep(new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 7,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0.005, release: 0.6 },
    })).connect(output);
    kick.volume.value = -6;

    const snareFilter = keep(new Tone.Filter(1800, "bandpass")).connect(output);
    const snare = keep(new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    })).connect(snareFilter);
    snare.volume.value = -8;

    const stickFilter = keep(new Tone.Filter(2600, "bandpass")).connect(output);
    stickFilter.Q.value = 3;
    const stick = keep(new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
    })).connect(stickFilter);
    stick.volume.value = -10;

    const hatFilter = keep(new Tone.Filter(9000, "highpass")).connect(output);
    const hat = keep(new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    })).connect(hatFilter);
    hat.volume.value = -14;

    const shakerFilter = keep(new Tone.Filter(6000, "bandpass")).connect(output);
    shakerFilter.Q.value = 2;
    const shaker = keep(new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.004, decay: 0.05, sustain: 0 },
    })).connect(shakerFilter);
    shaker.volume.value = -14;

    const ride = keep(new Tone.MetalSynth({
      envelope: { attack: 0.002, decay: 0.7, release: 0.5 },
      harmonicity: 5.1, modulationIndex: 18, resonance: 4200, octaves: 1.2,
    })).connect(output);
    ride.volume.value = -20;

    const crash = keep(new Tone.MetalSynth({
      envelope: { attack: 0.002, decay: 1.6, release: 1.2 },
      harmonicity: 4.1, modulationIndex: 24, resonance: 3600, octaves: 1.6,
    })).connect(output);
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

  const build = (builtGeneration) => {
    output = new Tone.Gain(muted ? 0 : 1).toDestination();
    reverb = new Tone.Reverb({ decay: 2.4, wet: 0.22 }).connect(output);
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.006, decay: 0.9, sustain: 0.12, release: 1.3 },
    });
    synth.volume.value = -7;
    synth.connect(reverb);
    instrument = synth;
    try { buildBand(); } catch {
      for (const n of kitNodes) { try { n.dispose(); } catch { /* noop */ } }
      kitNodes = []; bassSynth = null; kit = null;
    } // band is optional; piano must survive
    set({ engine: "synth", loading: true });
    try {
      const s = new Tone.Sampler({
        urls: SALAMANDER, baseUrl: SALAMANDER_BASE, release: 1,
        onload: () => {
          if (disposed || builtGeneration !== generation || sampler !== s) {
            try { s.dispose(); } catch { /* noop */ } return;
          }
          instrument = s;
          clearTimeout(sampleTimer); sampleTimer = null;
          set({ engine: "piano", loading: false });
        },
      });
      sampler = s;
      s.connect(reverb);
      sampleTimer = setTimeout(() => {
        sampleTimer = null;
        if (!disposed && builtGeneration === generation && instrument !== s) set({ loading: false });
      }, 12000);
    } catch { set({ loading: false }); }
  };

  const init = () => {
    if (initPromise) return initPromise;
    const request = generation;
    disposed = false;
    const ready = (async () => {
      await loadTone();
      if (disposed || request !== generation) return;
      if (inited) {
        if (Tone.getContext().state !== "running") {
          try { await Tone.start(); } catch { /* still locked; next gesture */ }
        }
        return;
      }
      try { await Tone.start(); } catch { /* autoplay policy; retried next gesture */ }
      if (disposed || request !== generation) return;
      build(request);
      inited = true;
    })();
    initPromise = ready;
    const clear = () => { if (initPromise === ready) initPromise = null; };
    ready.then(clear, clear);
    return ready;
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
  // queues everything inside a 180ms horizon on Tone's clock. The handle owns
  // queued attacks/releases so stop can cancel them before voices are started.
  const playEvents = ({ events, totalBeats }, { bpm = 90, loop = false, onStep, onDone, startAt } = {}) => {
    if (!events || !events.length || disposed || !Tone) return { stop() {} };
    const spb = 60 / bpm;
    const AHEAD = 0.18;
    let idx = 0, stopped = false, cancelled = false;
    // startAt lets a caller chain windows seamlessly (The Session schedules
    // two bars at a time and butts each window against the last, drift-free).
    let base = startAt && startAt > Tone.now() ? startAt : Tone.now() + 0.1;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); };
    const context = Tone.getContext(), audioTimers = new Set(), voices = new Set();
    const atTime = (fn, at) => {
      if (at <= Tone.now()) { if (!cancelled && !disposed) fn(); return () => {}; }
      const id = context.setTimeout(() => {
        audioTimers.delete(id);
        if (!cancelled && !disposed) fn();
        if (stopped && !audioTimers.size) schedules.delete(handle);
      }, at - Tone.now());
      audioTimers.add(id);
      return () => {
        context.clearTimeout(id); audioTimers.delete(id);
        if (stopped && !audioTimers.size) schedules.delete(handle);
      };
    };

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
          const note = Tone.Frequency(m, "midi").toNote(), dur = Math.max(0.09, e.dur * spb);
          if (e.ch !== "bass") {
            // PolySynth hides future callbacks; Sampler immediately forgets a
            // source after scheduling its off. Own both phases for either one.
            const held = heldPiano.get(target) || new Map();
            held.get(note)?.end(at);
            target.triggerAttack(note, at, e.v ?? 0.9);
            const voice = {
              end(when) {
                if (held.get(note) !== voice) return;
                voice.cancelOff?.(); held.delete(note); voices.delete(voice);
                if (!held.size) heldPiano.delete(target);
                try { target.triggerRelease(note, when); } catch { /* disposed voice */ }
              },
            };
            held.set(note, voice); heldPiano.set(target, held); voices.add(voice);
            voice.cancelOff = atTime(() => voice.end(at + dur), at + dur);
          } else {
            target.triggerAttackRelease(note, dur, at, e.v ?? 0.9);
            const voice = { owner: handle };
            bassVoice = voice;
            atTime(() => { if (bassVoice === voice) bassVoice = null; }, at + dur);
          }
        } catch { /* sampler mid-load */ }
      }
    };

    const tick = () => {
      if (stopped || disposed) return;
      const now = Tone.now();
      while (idx < events.length && base + events[idx].t * spb < now + AHEAD) {
        const e = events[idx];
        const at = base + e.t * spb;
        atTime(() => strike(e, at), at);
        if (onStep) later(() => { if (!stopped) onStep(e); }, (at - Tone.now()) * 1000);
        idx++;
      }
      if (idx >= events.length) {
        if (loop) { base += (totalBeats || events[events.length - 1].t + 4) * spb; idx = 0; }
        else {
          const endAt = base + (totalBeats || events[events.length - 1].t + 4) * spb;
          later(() => {
            if (!stopped) {
              stopped = true; clearInterval(timer);
              if (!audioTimers.size) schedules.delete(handle);
              onDone?.();
            }
          }, (endAt - Tone.now()) * 1000);
          clearInterval(timer);
        }
      }
    };
    const timer = setInterval(tick, 40);
    const handle = {
      // startTime is on Tone's clock — pair it with engine.now() to score
      // taps (the Meter Feel Trainer) against the same clock the audio uses.
      startTime: base,
      secondsPerBeat: spb,
      stop() {
        if (cancelled) return;
        stopped = true; cancelled = true;
        schedules.delete(handle);
        clearInterval(timer);
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of audioTimers) context.clearTimeout(id);
        audioTimers.clear();
        for (const voice of [...voices]) voice.end(Tone.now());
        // The bass holds long notes (a pedal drone runs a whole bar) — cut it
        // too, or it rings for seconds after the stop button.
        if (bassVoice?.owner === handle) {
          try { bassSynth?.triggerRelease?.(); } catch { /* noop */ }
          bassVoice = null;
        }
      },
    };
    schedules.add(handle);
    tick();
    return handle;
  };

  const dispose = () => {
    disposed = true;
    generation++; initPromise = null; inited = false;
    for (const schedule of [...schedules]) schedule.stop();
    clearTimeout(sampleTimer); sampleTimer = null;
    try { synth?.dispose(); } catch { /* noop */ }
    try { sampler?.dispose(); } catch { /* noop */ }
    try { reverb?.dispose(); } catch { /* noop */ }
    try { output?.dispose(); } catch { /* noop */ }
    output = null;
    for (const n of kitNodes) { try { n.dispose(); } catch { /* noop */ } }
    kitNodes = [];
    heldPiano.clear();
    synth = sampler = reverb = instrument = bassSynth = bassVoice = kit = null;
    set({ engine: "off", loading: false });
  };

  return { init, play, playEvents, dispose, setMuted(value) {
    muted = !!value;
    if (output) output.gain.value = muted ? 0 : 1;
  }, getState: () => state, now: () => (Tone ? Tone.now() : 0) };
}
