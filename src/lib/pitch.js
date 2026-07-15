// pitch.js — monophonic pitch detection for the singing voice, pure DSP
// (prime directive 2: no audio nodes here — the Voice room feeds frames in).
// YIN (de Cheveigné & Kawahara 2002): difference function → cumulative-mean
// normalization → absolute threshold → parabolic refinement. pYIN-class
// accuracy is overkill for a tuner/tessitura tool; plain YIN with a clarity
// gate is honest, fast, and fully client-side (prime directive 3).
//
// Tessitura vs range (Titze; McKinney): range is every note you CAN make;
// tessitura is where the voice LIVES. The finder below builds a weighted
// distribution of comfortable sung pitch and reports the 20th–80th
// percentile band — never a min/max belting test.

/** Detect pitch in one mono frame. Returns { hz, midi, clarity } or null.
 * frame: Float32Array (≥ 1024 samples recommended), sampleRate in Hz. */
export function detectPitch(frame, sampleRate, { minHz = 60, maxHz = 1100, threshold = 0.15, minRms = 0.008 } = {}) {
  const n = frame.length;
  if (!n || n < 256) return null;

  let rms = 0;
  for (let i = 0; i < n; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / n);
  if (rms < minRms) return null; // silence — never report a pitch for noise floor

  const maxTau = Math.min(n - 2, Math.floor(sampleRate / minHz));
  const minTau = Math.max(2, Math.ceil(sampleRate / maxHz));
  if (maxTau <= minTau) return null;

  // difference function
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i + tau < n; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // cumulative mean normalized difference
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // absolute threshold: first dip under it, then slide to the local minimum
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // no confident dip — accept the global minimum only if it's decent
    let best = minTau;
    for (let t = minTau + 1; t <= maxTau; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.4) return null;
    tau = best;
  }
  // a "dip" pinned to the search boundary is the window's edge, not a period
  // (a 50Hz tone under a 60Hz floor lands exactly here) — refuse it
  if (tau >= maxTau - 1 || tau <= minTau) return null;

  // subharmonic guard: a tone ABOVE the ceiling dips at every multiple of its
  // true period, so its 2× period lands inside our window looking perfect.
  // If half this period also dips deep, the real fundamental is out of range.
  const half = Math.round(tau / 2);
  if (half >= 2 && half < minTau && cmnd[half] < threshold) return null;

  // parabolic interpolation around the dip
  let refined = tau;
  if (tau > minTau && tau < maxTau) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) refined = tau + (a - c) / (2 * denom) * -1;
  }
  if (!(refined > 0)) return null;

  const hz = sampleRate / refined;
  if (hz < minHz || hz > maxHz) return null;
  return { hz, midi: hzToMidi(hz), clarity: Math.max(0, Math.min(1, 1 - cmnd[tau])) };
}

export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** { name: "A3", cents: -12.4, midi: 57 } for a (float) midi value. */
export function noteOf(midiFloat) {
  const midi = Math.round(midiFloat);
  const cents = (midiFloat - midi) * 100;
  const name = `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  return { midi, name, cents };
}

/**
 * Tessitura from a pile of sung samples [{ midi, weight? }].
 * Weighted percentile band: where the voice actually lives, not its extremes.
 * Returns { low, high, center, count } in float midi, or null under 20 samples
 * (a guess from three hums would be a lie).
 */
export function tessituraFrom(samples, { pLow = 0.2, pHigh = 0.8 } = {}) {
  const rows = (samples || []).filter((s) => Number.isFinite(s.midi));
  if (rows.length < 20) return null;
  const sorted = rows.slice().sort((a, b) => a.midi - b.midi);
  const total = sorted.reduce((n, s) => n + (s.weight ?? 1), 0);
  const at = (p) => {
    let acc = 0;
    for (const s of sorted) {
      acc += s.weight ?? 1;
      if (acc >= p * total) return s.midi;
    }
    return sorted[sorted.length - 1].midi;
  };
  return { low: at(pLow), high: at(pHigh), center: at(0.5), count: rows.length };
}

/**
 * Where did a sung take sit against the singer's band? Returns a transpose
 * suggestion in semitones (negative = take the song down) with a plain note,
 * or shift 0 when the take already lives inside the band.
 */
export function singFit(takeMidis, band) {
  if (!band || !takeMidis || takeMidis.length < 20) return null;
  const sorted = takeMidis.slice().sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const top = p(0.85), bottom = p(0.15);
  const overHigh = top - band.high;
  const overLow = band.low - bottom;
  if (overHigh > 0.6 && overHigh >= overLow) {
    const shift = -Math.min(11, Math.round(overHigh));
    return { shift, note: `you were singing above where your voice lives — take it down ${-shift} semitone${shift === -1 ? "" : "s"}` };
  }
  if (overLow > 0.6) {
    const shift = Math.min(11, Math.round(overLow));
    return { shift, note: `you were digging under your comfortable floor — lift it ${shift} semitone${shift === 1 ? "" : "s"}` };
  }
  return { shift: 0, note: "that take sat inside your band — this key is yours" };
}
