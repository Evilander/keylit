import { describe, it, expect } from "vitest";
import { fft, frameChroma, detectFromPcm, segmentsToSheet } from "./ear.js";

const SR = 22050;

/* ---- deterministic audio synthesis (the eval bench) -------------------- */
// Seeded LCG so runs never flake.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// A strummy chord: fundamentals across two octaves + a couple of harmonics
// + light noise. Close enough to a real instrument for chroma purposes.
function synthChord(pcs, seconds, seed = 1) {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const rand = rng(seed);
  const notes = [];
  for (const pc of pcs) { notes.push(48 + pc, 60 + pc); }
  for (const m of notes) {
    const f = midiHz(m);
    const phase = rand() * Math.PI * 2;
    for (const [mult, amp] of [[1, 1], [2, 0.35], [3, 0.15]]) {
      const w = (2 * Math.PI * f * mult) / SR;
      if (f * mult > SR / 2 - 200) continue;
      for (let i = 0; i < n; i++) out[i] += amp * Math.sin(w * i + phase);
    }
  }
  for (let i = 0; i < n; i++) out[i] = out[i] / (notes.length * 1.6) + (rand() - 0.5) * 0.02;
  return out;
}

function synthProgression(chords, secondsEach = 1.2, seed = 7) {
  const parts = chords.map((pcs, i) => synthChord(pcs, secondsEach, seed + i));
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const MAJ = (r) => [r % 12, (r + 4) % 12, (r + 7) % 12];
const MIN = (r) => [r % 12, (r + 3) % 12, (r + 7) % 12];

// Squash consecutive duplicates and drop N (no-chord) for sequence compare.
const seq = (segments) => {
  const out = [];
  for (const s of segments) {
    if (s.quality === "N") continue;
    const sym = `${s.pc}:${s.quality}`;
    if (out[out.length - 1] !== sym) out.push(sym);
  }
  return out;
};

/* ---- units -------------------------------------------------------------- */

describe("fft", () => {
  it("finds a pure tone in the right bin", () => {
    const N = 4096;
    const re = new Float32Array(N), im = new Float32Array(N);
    const f = 440;
    for (let i = 0; i < N; i++) re[i] = Math.sin((2 * Math.PI * f * i) / SR);
    fft(re, im);
    let best = 0, bestMag = 0;
    for (let k = 1; k < N / 2; k++) {
      const mag = re[k] * re[k] + im[k] * im[k];
      if (mag > bestMag) { bestMag = mag; best = k; }
    }
    expect(Math.abs(best - Math.round((f * N) / SR))).toBeLessThanOrEqual(1);
  });
});

describe("frameChroma", () => {
  it("a lone A rings pitch class 9", () => {
    const pcm = synthChord([9], 0.6, 3);
    const c = frameChroma(pcm, 0, 8192, SR);
    const best = c.indexOf(Math.max(...c));
    expect(best).toBe(9);
  });
  it("a C major chord lights C, E and G above everything else", () => {
    const pcm = synthChord(MAJ(0), 0.6, 4);
    const c = frameChroma(pcm, 0, 8192, SR);
    const ranked = [...c.keys()].sort((a, b) => c[b] - c[a]);
    expect(ranked.slice(0, 3).sort((a, b) => a - b)).toEqual([0, 4, 7]);
  });
});

/* ---- the detector ------------------------------------------------------- */

describe("detectFromPcm", () => {
  it("hears I–V–vi–IV in C", () => {
    const pcm = synthProgression([MAJ(0), MAJ(7), MIN(9), MAJ(5)]);
    const { segments } = detectFromPcm(pcm, SR);
    expect(seq(segments)).toEqual(["0:maj", "7:maj", "9:min", "5:maj"]);
  });

  it("hears a minor progression in A", () => {
    const pcm = synthProgression([MIN(9), MAJ(5), MAJ(0), MAJ(7)], 1.2, 11);
    const { segments } = detectFromPcm(pcm, SR);
    expect(seq(segments)).toEqual(["9:min", "5:maj", "0:maj", "7:maj"]);
  });

  it("reports confidence and ranked alternates per segment", () => {
    const pcm = synthProgression([MAJ(0), MAJ(5)]);
    const { segments } = detectFromPcm(pcm, SR);
    for (const s of segments.filter((x) => x.quality !== "N")) {
      expect(s.conf).toBeGreaterThan(0);
      expect(s.conf).toBeLessThanOrEqual(1);
      expect(s.alts.length).toBeGreaterThanOrEqual(2);
      expect(s.alts[0]).toHaveProperty("pc");
      expect(s.alts[0]).toHaveProperty("quality");
    }
  });

  it("clears the 80% bar across the eval bench", () => {
    const bench = [
      [MAJ(0), MAJ(7), MIN(9), MAJ(5)],              // C G Am F
      [MAJ(7), MAJ(2), MIN(4), MAJ(0)],              // G D Em C
      [MIN(4), MAJ(0), MAJ(7), MAJ(2)],              // Em C G D
      [MAJ(2), MAJ(9), MIN(11), MAJ(7)],             // D A Bm G
      [MIN(0), MAJ(8), MAJ(3), MAJ(10)],             // Cm Ab Eb Bb
      [MAJ(4), MAJ(11), MIN(1), MAJ(9)],             // E B C#m A
    ];
    let hit = 0, total = 0;
    bench.forEach((chords, k) => {
      const pcm = synthProgression(chords, 1.1, 20 + k * 5);
      const got = seq(detectFromPcm(pcm, SR).segments);
      const want = chords.map((pcs) => `${pcs[0]}:${pcs[1] === (pcs[0] + 3) % 12 ? "min" : "maj"}`);
      total += want.length;
      for (let i = 0; i < want.length; i++) if (got[i] === want[i]) hit++;
    });
    expect(hit / total).toBeGreaterThanOrEqual(0.8);
  });
});

describe("segmentsToSheet", () => {
  it("writes a chart the parser reads back, spelled for the key", () => {
    const pcm = synthProgression([MAJ(5), MAJ(10), MIN(2), MAJ(0)]); // F Bb Dm C
    const { segments, sheet, key } = detectFromPcm(pcm, SR);
    expect(sheet).toContain("Bb");        // flat key: never A#
    expect(sheet).not.toContain("A#");
    expect(key.name).toMatch(/F major|D minor/);
    expect(segments.length).toBeGreaterThan(0);
  });
});
