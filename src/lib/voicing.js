// voicing.js — pure voicing + keyboard geometry. No DOM, no audio.
import { SHARP_NAMES } from "./theory.js";

export const LOW_MIDI = 36;  // C2
export const HIGH_MIDI = 72; // C5
const WHITE_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const BLACK_AFTER = new Set([0, 2, 5, 7, 9]);
export const VOICE_CENTER = 57;

export const midiName = (m) => SHARP_NAMES[((m % 12) + 12) % 12];
export const midiOctave = (m) => Math.floor(m / 12) - 1;

export function clampVoicing(notes) {
  const out = notes.map((n) => {
    let m = n;
    while (m < LOW_MIDI) m += 12;
    while (m > HIGH_MIDI) m -= 12;
    return m;
  });
  return [...new Set(out)].sort((a, b) => a - b);
}

// Trim big chords (9/11/13) to a tasteful 3-4 note piano shell.
export function reduceVoicing(intervals) {
  if (intervals.length <= 4) return [...intervals];
  const has = (x) => intervals.includes(x);
  const sel = new Set([0]);
  // The chord's "third". A dominant/major 11th (interval 17) clashes a minor 9th
  // against the major 3rd, so when an 11 is present the major 3rd is dropped
  // (a minor 3rd, 2 or 4 doesn't clash and is kept).
  const thirdPrefs = has(17) ? [3, 2, 5] : [3, 4, 2, 5];
  for (const t of thirdPrefs) if (has(t)) { sel.add(t); break; }
  for (const t of [11, 10, 9]) if (has(t)) { sel.add(t); break; }
  const tensions = intervals.filter((i) => i >= 13).sort((a, b) => b - a);
  if (tensions.length) sel.add(tensions[0]);
  if (sel.size < 4) for (const t of [7, 6, 8]) if (has(t)) { sel.add(t); break; }
  if (sel.size < 4) for (const i of intervals) { if (!sel.has(i)) { sel.add(i); if (sel.size >= 4) break; } }
  return [...sel].sort((a, b) => a - b).slice(0, 4);
}

export function addBass(notes, chord) {
  if (chord.bassSemitone === null || chord.bassSemitone === chord.rootSemitone) return notes;
  const b = ((chord.bassSemitone % 12) + 12) % 12;
  // Lowest in-range MIDI note carrying the bass pitch class.
  const bass = LOW_MIDI + (((b - LOW_MIDI) % 12) + 12) % 12;
  // The slash bass MUST be the lowest sounding note: lift any chord tone that
  // would otherwise sit at or below it (so the bass isn't deduped away when the
  // upper voicing is already near the bottom of the keyboard).
  const upper = notes.map((n) => {
    let m = n;
    while (m <= bass) m += 12;
    return m;
  });
  return [bass, ...upper];
}

export function rootPositionUpper(chord) {
  const ivs = reduceVoicing(chord.intervals);
  let rootMidi = 48 + chord.rootSemitone;
  const avg = () => rootMidi + ivs.reduce((s, i) => s + i, 0) / ivs.length;
  let guard = 0;
  while (avg() > VOICE_CENTER + 7 && rootMidi - 12 >= LOW_MIDI && guard++ < 6) rootMidi -= 12;
  guard = 0;
  while (avg() < VOICE_CENTER - 7 && rootMidi + Math.max(...ivs) + 12 <= HIGH_MIDI && guard++ < 6) rootMidi += 12;
  return ivs.map((i) => rootMidi + i);
}

export function rootPositionFull(chord) {
  return clampVoicing(addBass(rootPositionUpper(chord), chord));
}

function voicingCandidates(chord) {
  const ivs = reduceVoicing(chord.intervals);
  const out = [];
  const seen = new Set();
  for (const base of [36, 48, 60]) {
    const rootMidi = base + chord.rootSemitone;
    const notes = ivs.map((i) => rootMidi + i);
    for (let r = 0; r < notes.length; r++) {
      const v = notes.slice();
      for (let k = 0; k < r; k++) v[k] += 12;
      const sorted = v.slice().sort((a, b) => a - b);
      if (Math.min(...sorted) < LOW_MIDI || Math.max(...sorted) > HIGH_MIDI) continue;
      const key = sorted.join(",");
      if (!seen.has(key)) { seen.add(key); out.push(sorted); }
    }
  }
  return out.length ? out : [rootPositionUpper(chord)];
}

function voiceCost(cand, prev) {
  let c = 0;
  for (const n of cand) {
    let best = Infinity;
    for (const p of prev) best = Math.min(best, Math.abs(n - p));
    c += best;
  }
  const avg = cand.reduce((s, n) => s + n, 0) / cand.length;
  return c + 0.15 * Math.abs(avg - VOICE_CENTER);
}

// Pick the inversion/octave nearest to the previous voicing (least hand movement).
export function smoothUpper(chord, prev) {
  if (!prev || !prev.length) return rootPositionUpper(chord);
  const cands = voicingCandidates(chord);
  let best = cands[0], bc = Infinity;
  for (const cand of cands) {
    const cost = voiceCost(cand, prev);
    if (cost < bc) { bc = cost; best = cand; }
  }
  return best;
}

/* ---- keyboard layout (C2..C5) ---- */
export const KEY_W = 34, KEY_H = 176, BLK_W = 22, BLK_H = 108;

function buildKeys() {
  const whites = [];
  for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) if (WHITE_CLASSES.has(m % 12)) whites.push(m);
  const whiteKeys = whites.map((m, idx) => ({ midi: m, x: idx * KEY_W }));
  const blackKeys = [];
  whiteKeys.forEach((wk, idx) => {
    if (idx === whiteKeys.length - 1) return;
    if (BLACK_AFTER.has(wk.midi % 12)) {
      const bm = wk.midi + 1;
      if (bm <= HIGH_MIDI) blackKeys.push({ midi: bm, x: (idx + 1) * KEY_W - BLK_W / 2 });
    }
  });
  return { whiteKeys, blackKeys, width: whiteKeys.length * KEY_W };
}
export const KEYS = buildKeys();
