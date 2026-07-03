// ear.js — Keylit hears the RECORD: PCM in, chord chart out. Pure DSP, no
// models, no network, no upload — a chromagram (FFT → pitch-class energy),
// 25-state chord-template Viterbi (12 maj + 12 min + silence), then the
// existing theory stack names the key and spells the chart (♭ keys stay ♭).
//
// The browser side (decode, resample, chunked progress) lives in
// components/Ear.jsx; tests drive this file with synthesized audio and hold
// the detector to ≥80% on the bench.
import { parseChord, detectKey } from "./theory.js";
import { spellPc } from "./spelling.js";

/* ---- FFT: iterative radix-2, in-place ----------------------------------- */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/* ---- chromagram ---------------------------------------------------------- */
const LOG2 = Math.log(2);
const hannCache = new Map();
const hann = (n) => {
  if (!hannCache.has(n)) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return hannCache.get(n);
};

/** One frame of pitch-class energy (unit-norm Float32Array(12)). */
export function frameChroma(pcm, offset, size, sampleRate) {
  const re = new Float32Array(size), im = new Float32Array(size);
  const w = hann(size);
  const end = Math.min(size, pcm.length - offset);
  for (let i = 0; i < end; i++) re[i] = pcm[offset + i] * w[i];
  fft(re, im);
  const chroma = new Float32Array(12);
  const loHz = 60, hiHz = 2100;                       // ~B1 … ~C7
  const kLo = Math.max(1, Math.floor((loHz * size) / sampleRate));
  const kHi = Math.min(size / 2 - 1, Math.ceil((hiHz * size) / sampleRate));
  for (let k = kLo; k <= kHi; k++) {
    const f = (k * sampleRate) / size;
    const midi = 69 + (12 * Math.log(f / 440)) / LOG2;
    const nearest = Math.round(midi);
    if (Math.abs(midi - nearest) > 0.45) continue;    // between-note bins are noise
    const mag = re[k] * re[k] + im[k] * im[k];
    chroma[((nearest % 12) + 12) % 12] += mag;
  }
  let norm = 0;
  for (let p = 0; p < 12; p++) norm += chroma[p] * chroma[p];
  norm = Math.sqrt(norm) || 1;
  for (let p = 0; p < 12; p++) chroma[p] /= norm;
  return chroma;
}

export function chromagram(pcm, sampleRate, { size = 8192, hop = 4096, onFrame } = {}) {
  const count = Math.max(0, Math.floor((pcm.length - size) / hop) + 1);
  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push(frameChroma(pcm, i * hop, size, sampleRate));
    onFrame?.(i, count);
  }
  return { frames, hopSec: hop / sampleRate };
}

/* ---- chord templates + Viterbi ------------------------------------------ */
const QUAL_IV = { maj: [[0, 1.0], [4, 0.75], [7, 0.9]], min: [[0, 1.0], [3, 0.75], [7, 0.9]] };

export function chordTemplates() {
  const states = [];
  for (const quality of ["maj", "min"]) {
    for (let pc = 0; pc < 12; pc++) {
      const vec = new Float32Array(12);
      for (const [iv, wgt] of QUAL_IV[quality]) vec[(pc + iv) % 12] = wgt;
      let n = 0;
      for (let p = 0; p < 12; p++) n += vec[p] * vec[p];
      n = Math.sqrt(n);
      for (let p = 0; p < 12; p++) vec[p] /= n;
      states.push({ pc, quality, vec });
    }
  }
  const flat = new Float32Array(12).fill(1 / Math.sqrt(12));
  states.push({ pc: -1, quality: "N", vec: flat });
  return states;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < 12; i++) s += a[i] * b[i]; return s; };

/**
 * Frames → chord segments via Viterbi (switch penalty keeps it honest).
 * @returns segments [{ start, end, pc, quality, conf, alts }] in seconds
 */
export function detectChords(frames, hopSec, { switchPenalty = 1.2, minDur = 0.55 } = {}) {
  if (!frames.length) return [];
  const states = chordTemplates();
  const S = states.length, T = frames.length;
  const em = [];                                       // log emissions
  for (let t = 0; t < T; t++) {
    const row = new Float32Array(S);
    for (let s = 0; s < S; s++) row[s] = Math.log(1e-3 + Math.max(0, dot(frames[t], states[s].vec)));
    em.push(row);
  }
  const dp = [em[0].slice()];
  const bk = [new Int16Array(S)];
  for (let t = 1; t < T; t++) {
    const prev = dp[t - 1];
    let bestPrev = 0;
    for (let s = 1; s < S; s++) if (prev[s] > prev[bestPrev]) bestPrev = s;
    const row = new Float32Array(S), back = new Int16Array(S);
    for (let s = 0; s < S; s++) {
      const stay = prev[s];
      const jump = prev[bestPrev] - switchPenalty;
      if (stay >= jump) { row[s] = stay + em[t][s]; back[s] = s; }
      else { row[s] = jump + em[t][s]; back[s] = bestPrev; }
    }
    dp.push(row); bk.push(back);
  }
  let s = 0;
  for (let k = 1; k < S; k++) if (dp[T - 1][k] > dp[T - 1][s]) s = k;
  const path = new Int16Array(T);
  for (let t = T - 1; t >= 0; t--) { path[t] = s; s = bk[t][s]; }

  // merge runs
  let runs = [];
  for (let t = 0; t < T; t++) {
    const last = runs[runs.length - 1];
    if (last && last.s === path[t]) last.t1 = t;
    else runs.push({ s: path[t], t0: t, t1: t });
  }
  // swallow blips shorter than minDur into the longer neighbor
  const minFrames = Math.max(1, Math.round(minDur / hopSec));
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let i = 0; i < runs.length; i++) {
      const len = runs[i].t1 - runs[i].t0 + 1;
      if (len >= minFrames) continue;
      const prev = runs[i - 1], next = runs[i + 1];
      const eat = !prev ? next : !next ? prev : (prev.t1 - prev.t0 >= next.t1 - next.t0 ? prev : next);
      if (!eat) continue;
      if (eat === prev) prev.t1 = runs[i].t1; else next.t0 = runs[i].t0;
      runs.splice(i, 1);
      changed = true;
      break;
    }
  }
  // re-merge equal neighbors after swallowing
  runs = runs.reduce((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.s === r.s) last.t1 = r.t1; else acc.push(r);
    return acc;
  }, []);

  return runs.map((r) => {
    const meanFor = (k) => {
      let m = 0;
      for (let t = r.t0; t <= r.t1; t++) m += Math.max(0, dot(frames[t], states[k].vec));
      return m / (r.t1 - r.t0 + 1);
    };
    const ranked = [...states.keys()]
      .map((k) => ({ k, score: meanFor(k) }))
      .sort((a, b) => b.score - a.score);
    const st = states[r.s];
    return {
      start: r.t0 * hopSec,
      end: (r.t1 + 1) * hopSec,
      pc: st.pc, quality: st.quality,
      conf: Math.min(1, meanFor(r.s)),
      alts: ranked.slice(0, 3).map(({ k, score }) => ({ pc: states[k].pc, quality: states[k].quality, score })),
    };
  });
}

/* ---- naming + the chart -------------------------------------------------- */
const symbolFor = (pc, quality, keyCtx) => `${spellPc(pc, keyCtx)}${quality === "min" ? "m" : ""}`;

export function segmentsToSheet(segments, keyCtx) {
  const chords = segments.filter((s) => s.quality !== "N");
  const syms = [];
  for (const s of chords) {
    const sym = symbolFor(s.pc, s.quality, keyCtx);
    if (syms[syms.length - 1] !== sym) syms.push(sym);
  }
  const lines = [];
  for (let i = 0; i < syms.length; i += 4) lines.push(syms.slice(i, i + 4).join("   "));
  return `[Heard]\n${lines.join("\n")}\n`;
}

/** The whole pipeline for a decoded mono PCM buffer. */
export function detectFromPcm(pcm, sampleRate, opts = {}) {
  const { frames, hopSec } = chromagram(pcm, sampleRate, opts);
  return finishDetection(frames, hopSec, opts);
}

/** Key + spelled chart for a set of segments (also serves the correction UI). */
export function summarizeSegments(segments) {
  const parsed = segments
    .filter((s) => s.quality !== "N")
    .map((s) => parseChord(symbolFor(s.pc, s.quality, { tonic: 0, mode: "major" })))
    .filter(Boolean);
  const detected = detectKey(parsed);
  const keyCtx = { tonic: detected.tonic, mode: detected.mode };
  const key = { ...keyCtx, name: `${spellPc(keyCtx.tonic, keyCtx)} ${keyCtx.mode}` };
  return { segments, key, sheet: segmentsToSheet(segments, keyCtx), symbolFor: (s) => symbolFor(s.pc, s.quality, keyCtx) };
}

/** Second half of the pipeline — lets the UI chunk the chroma loop itself. */
export function finishDetection(frames, hopSec, opts = {}) {
  return summarizeSegments(detectChords(frames, hopSec, opts));
}
