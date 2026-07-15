// harmonize.js — melody-first writing: sing a line, get ranked chord
// candidates WITH THE WHY. The hum-to-chords mechanic itself is a lineage
// (MySong, CHI 2008 → today's Song Cage/HumOn) — what none of them do is
// teach: every candidate here explains which of YOUR notes it holds and
// what job it would do in the key. Pure (mic plumbing lives in the
// component; pitch tracking in lib/pitch.js).
import { parseChord, harmonicFunction, SHARP_NAMES } from "./theory.js";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_LABEL = ["1", "2m", "3m", "4", "5", "6m", "7°"];
const FN_WORD = { T: "home", S: "away", D: "pulling home", "?": "outside color" };

/** The key's seven diatonic triads + the V7. */
export function diatonicPalette(key) {
  const t = key.tonic;
  const quality = key.mode === "minor"
    ? ["m", "dim", "", "m", "m", "", ""]
    : ["", "m", "m", "", "", "m", "dim"];
  const scale = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : MAJOR;
  const out = scale.map((deg, i) => parseChord(`${SHARP_NAMES[(t + deg) % 12]}${quality[i] === "dim" ? "dim" : quality[i]}`)).filter(Boolean);
  const v7 = parseChord(`${SHARP_NAMES[(t + 7) % 12]}7`);
  if (v7) out.push(v7);
  return out;
}

/**
 * Rank chords under a sung phrase. midis: the phrase's notes (order kept,
 * repeats fine). Returns top candidates [{ chord, score, why, fn }].
 */
export function harmonizeNotes(midis, key, { top = 4 } = {}) {
  const notes = (midis || []).map((m) => Math.round(m)).filter(Number.isFinite);
  if (!notes.length || !key) return [];
  const counts = new Map();
  for (const m of notes) {
    const pc = ((m % 12) + 12) % 12;
    counts.set(pc, (counts.get(pc) || 0) + 1);
  }
  const lastPc = ((notes[notes.length - 1] % 12) + 12) % 12;
  const total = notes.length;

  const cands = diatonicPalette(key).map((ch) => {
    const tones = new Set(ch.intervals.map((i) => (ch.rootSemitone + i) % 12));
    let covered = 0;
    const held = [];
    for (const [pc, n] of counts) {
      if (tones.has(pc)) { covered += n; held.push(pc); }
    }
    let score = covered / total;
    if (tones.has(lastPc)) score += 0.08; // it catches where the phrase lands
    if (ch.rootSemitone === key.tonic && ch.intervals.includes(key.mode === "minor" ? 3 : 4)) score += 0.04;
    const isDim = ch.intervals.includes(6) && !ch.intervals.includes(7);
    if (isDim) score -= 0.15;
    const fn = harmonicFunction(ch, key.tonic, key.mode);
    const heldNames = held.sort((a, b) => (counts.get(b) - counts.get(a))).slice(0, 3).map((pc) => SHARP_NAMES[pc]);
    const why = held.length
      ? `holds your ${heldNames.join(", ")} — ${FN_WORD[fn]}${tones.has(lastPc) ? ", and catches where the line lands" : ""}`
      : `none of your notes live in it — a deliberate rub only`;
    return { chord: ch, score, why, fn };
  });

  return cands.sort((a, b) => b.score - a.score).slice(0, top);
}

/**
 * Split a pitch-tracked take into phrases on silence. samples: [{ midi, at }]
 * (ms timestamps). Returns [{ midis, startAt }].
 */
export function segmentMelody(samples, { gapMs = 650, minNotes = 2 } = {}) {
  const rows = (samples || []).filter((s) => Number.isFinite(s.midi));
  if (!rows.length) return [];
  const phrases = [];
  let cur = { midis: [rows[0].midi], startAt: rows[0].at };
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].at - rows[i - 1].at > gapMs) {
      if (cur.midis.length >= minNotes) phrases.push(cur);
      cur = { midis: [], startAt: rows[i].at };
    }
    cur.midis.push(rows[i].midi);
  }
  if (cur.midis.length >= minNotes) phrases.push(cur);
  // collapse held notes: consecutive same rounded pitch counts once per ~4 samples
  return phrases.map((p) => {
    const out = [];
    let run = 0;
    for (let i = 0; i < p.midis.length; i++) {
      const m = Math.round(p.midis[i]);
      if (out.length && out[out.length - 1] === m && run < 4) { run++; continue; }
      out.push(m);
      run = 0;
    }
    return { ...p, midis: out };
  });
}
