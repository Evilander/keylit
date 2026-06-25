// theory.js — pure music-theory helpers. No DOM, no audio: fully unit-testable.

import { spellPc } from "./spelling.js";

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const NOTE_TO_SEMITONE = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, "E#": 5, Fb: 4,
  F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10,
  B: 11, Cb: 11, "B#": 0,
};

// Case-sensitive: "m7" (minor) vs "M7" (major7).
export const QUALITIES = {
  "": { name: "maj", intervals: [0, 4, 7] },
  maj: { name: "maj", intervals: [0, 4, 7] },
  M: { name: "maj", intervals: [0, 4, 7] },
  m: { name: "min", intervals: [0, 3, 7] },
  min: { name: "min", intervals: [0, 3, 7] },
  "-": { name: "min", intervals: [0, 3, 7] },
  dim: { name: "dim", intervals: [0, 3, 6] },
  "\u00b0": { name: "dim", intervals: [0, 3, 6] },
  aug: { name: "aug", intervals: [0, 4, 8] },
  "+": { name: "aug", intervals: [0, 4, 8] },
  "5": { name: "5", intervals: [0, 7] },
  "6": { name: "6", intervals: [0, 4, 7, 9] },
  m6: { name: "m6", intervals: [0, 3, 7, 9] },
  min6: { name: "m6", intervals: [0, 3, 7, 9] },
  "6/9": { name: "6/9", intervals: [0, 4, 7, 9, 14] },
  "69": { name: "6/9", intervals: [0, 4, 7, 9, 14] },
  "7": { name: "7", intervals: [0, 4, 7, 10] },
  maj7: { name: "maj7", intervals: [0, 4, 7, 11] },
  M7: { name: "maj7", intervals: [0, 4, 7, 11] },
  m7: { name: "m7", intervals: [0, 3, 7, 10] },
  min7: { name: "m7", intervals: [0, 3, 7, 10] },
  "-7": { name: "m7", intervals: [0, 3, 7, 10] },
  m7b5: { name: "m7\u266d5", intervals: [0, 3, 6, 10] },
  "\u00f8": { name: "m7\u266d5", intervals: [0, 3, 6, 10] },
  dim7: { name: "dim7", intervals: [0, 3, 6, 9] },
  "\u00b07": { name: "dim7", intervals: [0, 3, 6, 9] },
  "7b5": { name: "7\u266d5", intervals: [0, 4, 6, 10] },
  "7#5": { name: "7\u266f5", intervals: [0, 4, 8, 10] },
  "7b9": { name: "7\u266d9", intervals: [0, 4, 7, 10, 13] },
  "7#9": { name: "7\u266f9", intervals: [0, 4, 7, 10, 15] },
  "7#11": { name: "7\u266f11", intervals: [0, 4, 7, 10, 18] },
  "maj7#11": { name: "maj7\u266f11", intervals: [0, 4, 7, 11, 18] },
  "9": { name: "9", intervals: [0, 4, 7, 10, 14] },
  maj9: { name: "maj9", intervals: [0, 4, 7, 11, 14] },
  M9: { name: "maj9", intervals: [0, 4, 7, 11, 14] },
  m9: { name: "m9", intervals: [0, 3, 7, 10, 14] },
  "11": { name: "11", intervals: [0, 4, 7, 10, 14, 17] },
  m11: { name: "m11", intervals: [0, 3, 7, 10, 14, 17] },
  "13": { name: "13", intervals: [0, 4, 7, 10, 14, 21] },
  maj13: { name: "maj13", intervals: [0, 4, 7, 11, 14, 21] },
  m13: { name: "m13", intervals: [0, 3, 7, 10, 14, 21] },
  add9: { name: "add9", intervals: [0, 4, 7, 14] },
  madd9: { name: "madd9", intervals: [0, 3, 7, 14] },
  add11: { name: "add11", intervals: [0, 4, 7, 17] },
  sus2: { name: "sus2", intervals: [0, 2, 7] },
  sus4: { name: "sus4", intervals: [0, 5, 7] },
  sus: { name: "sus4", intervals: [0, 5, 7] },
  "7sus4": { name: "7sus4", intervals: [0, 5, 7, 10] },
  "7sus2": { name: "7sus2", intervals: [0, 2, 7, 10] },
  "7sus": { name: "7sus4", intervals: [0, 5, 7, 10] },
};

export const symFromName = (name) =>
  name === "maj" ? "" : name === "min" ? "m" : name;

function noteToSemitone(letter, acc) {
  return NOTE_TO_SEMITONE[letter + (acc || "")];
}

const cleanToken = (t) =>
  t.replace(/^[([{<"'.,;:|]+/, "").replace(/[)\]}>"'.,;:|]+$/, "");

export function parseChord(rawToken) {
  const token = cleanToken(rawToken);
  if (!token) return null;
  const m = token.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return null;
  const [, letter, acc, rawRest] = m;
  const rootSemitone = noteToSemitone(letter, acc);
  if (rootSemitone === undefined) return null;

  // Musicians bracket alterations/additions: C7(b9) means C7b9, C(add9) means
  // Cadd9. Strip the parentheses so the inner quality is looked up directly.
  const rest = rawRest.replace(/[()]/g, "");

  // A "/" introduces a slash bass ONLY when what follows it is a note name.
  // Otherwise the slash belongs to the quality itself (e.g. the "6/9" chord),
  // which must not be mistaken for a chord over a "9" bass.
  let qualityStr = rest, bassStr;
  const slash = rest.lastIndexOf("/");
  if (slash !== -1 && /^[A-G][#b]?$/.test(rest.slice(slash + 1))) {
    qualityStr = rest.slice(0, slash);
    bassStr = rest.slice(slash + 1);
  }

  const qDef = QUALITIES[qualityStr];
  if (!qDef) return null;

  let bassSemitone = null, bassName = null;
  if (bassStr !== undefined) {
    bassSemitone = noteToSemitone(bassStr[0], bassStr.slice(1));
    if (bassSemitone === undefined) return null;
    bassName = SHARP_NAMES[bassSemitone];
  }

  return {
    raw: token,
    rootName: SHARP_NAMES[rootSemitone],
    rootSemitone,
    quality: qDef.name,
    intervals: qDef.intervals,
    bassSemitone,
    bassName,
  };
}

const isSectionLine = (l) => /^\s*\[.*\]\s*$/.test(l);

// Normalise the chart formats people actually paste into the plain
// "chords over lyrics" layout Keylit reads:
//   - Ultimate-Guitar inline tags:  [ch]Am[/ch]  ->  Am
//   - ChordPro inline chords:       [C]Twinkle [G]twinkle  ->  chord line + lyric line
//   - ChordPro directives:          {title: ...}, {soh}  ->  dropped
// Section headers like [Verse] / [Chorus] are preserved (not treated as chords).
export function normalizeChart(text) {
  const out = [];
  for (const rawLine of String(text).split("\n")) {
    let line = rawLine.replace(/\[\/?ch\]/gi, "").replace(/\[\/?tab\]/gi, "");
    const trimmed = line.trim();
    if (/^\{.*\}$/.test(trimmed)) continue;                  // ChordPro directive
    // chart metadata (Ultimate-Guitar / Songsterr headers) — NOT chords. Drop them
    // so "Tuning: E A D G B E" and "Key: C" don't pollute the progression.
    if (/^(tuning|key|capo|tempo|artist|title|album|composer|difficulty|author|tabbed|time|bpm|track|year|genre|chords?|strumming|arranged|transcribed)\b[^:]*:/i.test(trimmed)) continue;
    if (/^\d+\s+of\s+\d+$/i.test(trimmed)) continue;         // "1 of 27" page indicator
    const lone = trimmed.match(/^\[([^\]]+)\]$/);
    if (lone) {
      // A lone bracket whose content is a chord (ChordPro "[C]" on its own line)
      // is a chord, not a section header. Section names like [Verse]/[Bridge]
      // don't parse as chords and stay section headers.
      if (parseChord(lone[1])) { out.push(lone[1]); continue; }
      out.push(line); continue; // section header
    }
    const brackets = line.match(/\[[^\]]+\]/g);
    if (brackets && brackets.some((b) => parseChord(b.slice(1, -1)))) {
      const chords = brackets.map((b) => b.slice(1, -1)).filter((t) => parseChord(t)).join("  ");
      const lyric = line.replace(/\[[^\]]*\]/g, "").trim();
      if (chords) out.push(chords);
      if (lyric) out.push(lyric);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

export function parseSheet(text) {
  const lines = normalizeChart(text).split("\n");
  const progression = [];
  let section = "";
  for (const line of lines) {
    if (isSectionLine(line)) {
      section = line.trim().replace(/^\[|\]$/g, "");
      continue;
    }
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const parsed = tokens.map(parseChord);
    const valid = parsed.filter(Boolean).length;
    if (!valid || valid / tokens.length < 0.5) continue;
    for (const ch of parsed) if (ch) progression.push({ ...ch, section });
  }
  const collapsed = [];
  for (const ch of progression) {
    const prev = collapsed[collapsed.length - 1];
    if (!prev || prev.raw !== ch.raw || prev.section !== ch.section) collapsed.push(ch);
  }
  const uniq = new Map();
  for (const ch of collapsed) if (!uniq.has(ch.raw)) uniq.set(ch.raw, ch);
  return { progression: collapsed, unique: [...uniq.values()] };
}

/* ---- transposition + naming ---- */
export const transposeChord = (ch, t) => {
  const rs = ((ch.rootSemitone + t) % 12 + 12) % 12;
  const bs = ch.bassSemitone === null ? null : ((ch.bassSemitone + t) % 12 + 12) % 12;
  return {
    ...ch,
    rootSemitone: rs,
    rootName: SHARP_NAMES[rs],
    bassSemitone: bs,
    bassName: bs === null ? null : SHARP_NAMES[bs],
  };
};
export const chordSymbol = (ch) =>
  ch.rootName + symFromName(ch.quality) + (ch.bassName ? "/" + ch.bassName : "");
export const displaySymbol = (ch, t) => (t === 0 ? ch.raw : chordSymbol(ch));

/* ---- Nashville + Roman ---- */
export const MAJOR_DEGREE = {
  0: "1", 2: "2", 4: "3", 5: "4", 7: "5", 9: "6", 11: "7",
  1: "\u266d2", 3: "\u266d3", 6: "\u266d5", 8: "\u266d6", 10: "\u266d7",
};
export const ROMAN = ["I", "\u266dII", "II", "\u266dIII", "III", "IV", "\u266dV", "V", "\u266dVI", "VI", "\u266dVII", "VII"];

export const qualClass = (name) => {
  if (name.includes("dim")) return "dim";
  if (name === "aug") return "aug";
  const minorish = name.startsWith("m") && !name.startsWith("maj");
  // Half-diminished (m7♭5) is a diminished-triad-plus-minor-7th: it belongs to
  // the diminished family, not plain minor (so it renders as ø and counts as the
  // diatonic vii/ii in key detection). A dominant 7♭5 stays "maj" — handled below.
  if (minorish && (name.includes("♭5") || name.includes("b5"))) return "dim";
  if (minorish) return "min";
  return "maj";
};

// Is this quality a dominant-7 family chord (7, 9, 11, 13 and their altered
// forms), as opposed to maj7/min7? Used to label (secondary) dominants.
export const isDominantQuality = (q) =>
  !q.startsWith("m") && (q.startsWith("7") || q === "9" || q === "11" || q === "13");

export function nashville(ch, tonic) {
  const d = ((ch.rootSemitone - tonic) % 12 + 12) % 12;
  let s = MAJOR_DEGREE[d] + symFromName(ch.quality);
  if (ch.bassSemitone !== null) {
    const bd = ((ch.bassSemitone - tonic) % 12 + 12) % 12;
    s += "/" + MAJOR_DEGREE[bd];
  }
  return s;
}

export function romanNumeral(ch, tonic) {
  const d = ((ch.rootSemitone - tonic) % 12 + 12) % 12;
  const cls = qualClass(ch.quality);
  let r = ROMAN[d];
  if (cls === "min" || cls === "dim") r = r.toLowerCase();
  if (cls === "dim") {
    // Half-diminished (m7\u266d5) gets the \u00f8 symbol; a fully-diminished triad/7th gets \u00b0.
    if (ch.quality.includes("\u266d5") || ch.quality.includes("b5")) return r + "\u00f87";
    return r + "\u00b0" + (ch.quality.includes("7") ? "7" : "");
  }
  if (cls === "aug") return r + "+";
  let ext = symFromName(ch.quality);
  if (cls === "min") ext = ext.replace(/^m/, "");
  return r + ext.replace("maj", "M");
}

/* ---- key detection (weighted diatonic fit) ---- */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const MAJOR_QUAL = ["maj", "min", "min", "maj", "maj", "min", "dim"];
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
export const MINOR_QUAL = ["min", "dim", "maj", "min", "min", "maj", "maj"];

/* ---- scale spelling + degree lookup (for the tutor's scale view) ---- */

// Letter names in scale order, and the pitch class of each natural letter.
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Spell pitch class `pc` using a SPECIFIC letter, choosing the accidental that
// makes the math work — so a diatonic scale gets one letter per degree even when
// that means Cb, Fb, E#, B#, or a double sharp/flat. (The 12-name sharp/flat
// arrays can't express those; letter-cycling can.)
function spellAsLetter(pc, letter) {
  const p = (((pc % 12) + 12) % 12);
  let acc = (((p - LETTER_PC[letter]) % 12) + 12) % 12; // 0..11
  if (acc > 6) acc -= 12;                               // nearest signed: -5..6
  const mark = acc === 0 ? "" : acc > 0 ? "#".repeat(acc) : "b".repeat(-acc);
  return letter + mark;
}

// Walk the scale and report each degree key-aware: its pitch class, the name a
// musician would write in this key (proper diatonic spelling — one letter per
// degree, so Gb major's 4th is Cb, not B), its 1-based degree number, and the
// step ("W"/"H") taken FROM this degree TO the next. The 7th's step lands on the
// octave (tonic + 12). Major -> WWHWWWH; natural minor -> WHWWHWW.
export function spellScale(tonic, mode = "major") {
  const scale = mode === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const t = (((tonic % 12) + 12) % 12);
  // Pick the tonic's letter from the key's sharp/flat preference (Gb not F#, etc.),
  // then cycle letters from there so every degree lands on the next letter.
  const tonicName = spellPc(t, { tonic: t, mode });
  const tonicLetterIdx = LETTERS.indexOf(tonicName[0]);
  return scale.map((iv, i) => {
    const semitone = (t + iv) % 12;
    const letter = LETTERS[(tonicLetterIdx + i) % 7];
    const nextIv = i === scale.length - 1 ? 12 : scale[i + 1];
    const step = nextIv - iv; // 1 = half step, 2 = whole step
    return {
      semitone,
      name: spellAsLetter(semitone, letter),
      degree: i + 1,
      stepType: step === 1 ? "H" : "W",
    };
  });
}

// The key-aware note NAME at a 1-based scale degree. Returns null if degree is
// outside 1..7. Uses the same diatonic letter-cycling as spellScale.
export function degreeOf(tonic, degree, mode = "major") {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) return null;
  return spellScale(tonic, mode)[degree - 1].name;
}

// Is a held pedal tone (a pitch class 0-11) a chord tone of `chord`? A pedal
// that lands on a chord tone is "consonant"; otherwise "dissonant". Chord tones
// are every interval over the root, plus the slash bass if present.
export function pedalRelation(pedalPc, chord) {
  const p = (((pedalPc % 12) + 12) % 12);
  const tones = new Set(chord.intervals.map((iv) => (chord.rootSemitone + iv) % 12));
  if (chord.bassSemitone !== null && chord.bassSemitone !== undefined) {
    tones.add(((chord.bassSemitone % 12) + 12) % 12);
  }
  return tones.has(p) ? "consonant" : "dissonant";
}

/* ---- chord builders (used by the suggester) ---- */

// Build a chord from a root pitch class and a key in the QUALITIES table.
// Pass the same key you'd write in a chord symbol: "" / "maj", "m", "7", "maj7",
// "m7", "m7b5", "dim7", "sus2", "sus4", "add9", "9", "13", etc.
export function buildChord(rootSemitone, qualityKey, bassSemitone = null) {
  const def = QUALITIES[qualityKey];
  if (!def) return null;
  const rs = ((rootSemitone % 12) + 12) % 12;
  const bs = bassSemitone === null ? null : ((bassSemitone % 12) + 12) % 12;
  const rootName = SHARP_NAMES[rs];
  const bassName = bs === null ? null : SHARP_NAMES[bs];
  return {
    raw: rootName + symFromName(def.name) + (bassName ? "/" + bassName : ""),
    rootName,
    rootSemitone: rs,
    quality: def.name,
    intervals: [...def.intervals],
    bassSemitone: bs,
    bassName,
  };
}

// Escape hatch: build a chord with arbitrary intervals (e.g. when cloning a
// chord at a new root and you don't want to look the quality back up).
export function buildChordFromIntervals(rootSemitone, qualityName, intervals, bassSemitone = null) {
  const rs = ((rootSemitone % 12) + 12) % 12;
  const bs = bassSemitone === null ? null : ((bassSemitone % 12) + 12) % 12;
  const rootName = SHARP_NAMES[rs];
  const bassName = bs === null ? null : SHARP_NAMES[bs];
  return {
    raw: rootName + symFromName(qualityName) + (bassName ? "/" + bassName : ""),
    rootName,
    rootSemitone: rs,
    quality: qualityName,
    intervals: [...intervals],
    bassSemitone: bs,
    bassName,
  };
}

// Return the first QUALITIES key whose def.name matches this chord. Useful when
// you want to clone a chord at a new root without recomputing intervals.
export function qualityKey(chord) {
  for (const [k, def] of Object.entries(QUALITIES)) {
    if (def.name === chord.quality) return k;
  }
  return undefined;
}

// The diatonic chord at scale degree (0=I, 6=vii) for a given key.
// `seventh: true` adds the diatonic 7th using standard functional choices.
export function diatonicChord(tonic, mode, degree, seventh = false) {
  if (degree < 0 || degree > 6) return null;
  const scale = mode === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const quals = mode === "minor" ? MINOR_QUAL : MAJOR_QUAL;
  const rootSemi = (tonic + scale[degree]) % 12;
  if (!seventh) {
    const triad = quals[degree] === "maj" ? "" : quals[degree] === "min" ? "m" : "dim";
    return buildChord(rootSemi, triad);
  }
  // Functional sevenths
  const SEVENTHS_MAJOR = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
  const SEVENTHS_MINOR = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"];
  const k = mode === "minor" ? SEVENTHS_MINOR[degree] : SEVENTHS_MAJOR[degree];
  return buildChord(rootSemi, k);
}

/* ---- capo / guitar-shape advisor ----
 * A capo on fret N raises every open string by N semitones, so to SOUND a chord
 * the guitarist fingers the shape N semitones LOWER. Given the song's sounding
 * chords, the shape you play with a capo on fret N is `transposeChord(ch, -N)`.
 * We score shapes by how guitar-friendly the open form is (CAGED + common 7ths).
 */

// Lower ease = easier to play. Open-position shapes a beginner already knows.
// Keyed by pitch class + quality class. Unknown shapes default to a barre cost.
const OPEN_EASE = {
  // major open shapes: C A G E D
  "maj": { 0: 1, 9: 1, 7: 1, 4: 1, 2: 1, 5: 4, 11: 4 },     // F, B need barres
  // minor open shapes: Em Am Dm
  "min": { 4: 1, 9: 1, 2: 1 },
  // dominant 7 open shapes: E7 A7 D7 G7 C7 B7
  "7":   { 4: 1, 9: 1, 2: 1, 7: 1.5, 0: 1.5, 11: 1.5 },
};
const BARRE_COST = 3;          // a movable barre chord — playable but harder
const EXOTIC_COST = 4.5;       // dim/aug/extended with no easy open form

export function shapeEase(chord) {
  const cls = qualClass(chord.quality);
  const pc = chord.rootSemitone;
  const q = chord.quality;
  // No easy open form: diminished, augmented, half-diminished (m7♭5), altered ♭5.
  if (cls === "dim" || cls === "aug" || q.includes("♭5") || /b5/.test(q)) return EXOTIC_COST;
  // Dominant-7 family (7, 9, 11, 13) has its own common open shapes (E7 A7 D7 G7 C7 B7).
  if (cls === "maj" && /^(7|9|11|13)/.test(q)) return OPEN_EASE["7"][pc] ?? BARRE_COST;
  // Minor family (m, m7, m9...) rides the open minor shapes (Em Am Dm).
  if (cls === "min") return OPEN_EASE.min[pc] ?? BARRE_COST;
  // Major family (maj, maj7, 6, add9, sus...) rides the open major shapes (C A G E D).
  return OPEN_EASE.maj[pc] ?? BARRE_COST;
}

// The fingered shape for a sounding chord with a capo on `fret`.
export const shapeForCapo = (chord, fret) => transposeChord(chord, -fret);

// Rank capo positions for a progression. Returns sorted best-first:
//   { fret, totalEase, shapes:[{shape, ease}], openCount }
// `maxFret` caps practical capo positions (most guitars: 7-9).
export function suggestCapo(prog, { maxFret = 7 } = {}) {
  if (!prog.length) return [];
  // Weight by how often each chord is played — the chord you play most should
  // dominate the choice (a tonic hit 40x matters more than a one-off passing chord).
  const counts = new Map();
  const uniq = [];
  const seen = new Set();
  for (const ch of prog) {
    const k = chordSymbol(ch);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!seen.has(k)) { seen.add(k); uniq.push(ch); }
  }
  const results = [];
  for (let fret = 0; fret <= maxFret; fret++) {
    const shapes = uniq.map((ch) => {
      const shape = shapeForCapo(ch, fret);
      return { shape, ease: shapeEase(shape), count: counts.get(chordSymbol(ch)) || 1 };
    });
    // frequency-weighted difficulty + a gentle penalty for high (awkward) capo positions
    const totalEase = shapes.reduce((s, x) => s + x.ease * x.count, 0) + fret * 0.15;
    const openCount = shapes.filter((x) => x.ease <= 1.5).length;
    results.push({ fret, totalEase, shapes, openCount });
  }
  // best = lowest total difficulty; tie-break toward the lower fret (capo 0 wins ties).
  results.sort((a, b) => a.totalEase - b.totalEase || a.fret - b.fret);
  return results;
}

/* ---- harmonic function (Tonic / Subdominant / Dominant) ---- */
// Circle of fifths as pitch classes, starting at C: C G D A E B F# C# G# D# A# F
export const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

// Classify a chord's harmonic function relative to a key. Returns one of
// "T" (tonic), "S" (subdominant/pre-dominant), "D" (dominant), or "?" (chromatic).
// This is a teaching-grade heuristic by scale degree, not a full Riemannian engine.
export function harmonicFunction(chord, tonic, mode = "major") {
  const deg = ((chord.rootSemitone - tonic) % 12 + 12) % 12;
  const cls = qualClass(chord.quality);
  // A dominant-7-family chord is functioning as a dominant — the diatonic V7, or
  // a secondary/applied dominant (A7→ii, D7→V, etc.) or a backdoor ♭VII7.
  if (isDominantQuality(chord.quality)) return "D";
  if (mode === "minor") {
    // i, ♭III, ♭VI = tonic;  iv, ii°, ♭VII (subtonic, pre-dominant) = subdominant;
    // V, vii° = dominant
    if (deg === 0 || deg === 3 || deg === 8) return "T";
    if (deg === 5 || deg === 2 || deg === 10) return "S";
    if (deg === 7 || deg === 11) return "D";
    if (cls === "dim") return "D"; // applied leading-tone
    return "?";
  }
  // major: I, iii, vi = tonic;  ii, IV = subdominant;  V, vii° = dominant
  if (deg === 0 || deg === 4 || deg === 9) return "T";
  if (deg === 2 || deg === 5) return "S";
  if (deg === 7 || deg === 11) return "D";
  if (cls === "dim") return "D"; // applied/secondary leading-tone chord
  return "?";
}

/* ---- key detection (weighted diatonic fit) ---- */
// Krumhansl-Kessler key profiles — empirically-derived tonal hierarchies.
export const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

// Build a weighted pitch-class histogram from a progression. Each chord paints
// its tones; the root is emphasised, cadential (first/last) chords count more,
// and a slash bass adds weight to the bass note. This is what we correlate
// against the key profiles.
export function pitchHistogram(prog) {
  const h = new Array(12).fill(0);
  prog.forEach((ch, i) => {
    const cadence = 1 + (i === 0 ? 0.6 : 0) + (i === prog.length - 1 ? 0.8 : 0);
    for (const iv of ch.intervals) {
      const pc = (ch.rootSemitone + iv) % 12;
      h[pc] += cadence * (iv === 0 ? 1.6 : 1); // root tone weighted up
    }
    if (ch.bassSemitone !== null && ch.bassSemitone !== undefined) h[ch.bassSemitone] += 0.7 * cadence;
  });
  return h;
}

// Detect key by correlating the progression's pitch histogram against the
// Krumhansl-Kessler major/minor profiles for all 24 keys, with small
// cadential and quality-coherence bonuses to break near-ties (relative
// major/minor share pitch content, so the landing chord and chord qualities
// tip the balance). Returns { tonic, mode, score }.
export function detectKey(prog) {
  if (!prog.length) return { tonic: 0, mode: "major", score: 0 };
  const hist = pitchHistogram(prog);
  const firstRoot = prog[0].rootSemitone;
  const lastRoot = prog[prog.length - 1].rootSemitone;

  let best = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      const profile = mode === "major" ? KK_MAJOR : KK_MINOR;
      const rotated = profile.map((_, i) => profile[(i - tonic + 12) % 12]);
      let score = pearson(hist, rotated);

      // Quality coherence: reward chords whose quality matches the diatonic
      // expectation at their scale degree (distinguishes e.g. C major vs A minor).
      const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
      const quals = mode === "major" ? MAJOR_QUAL : MINOR_QUAL;
      let qFit = 0;
      for (const ch of prog) {
        const deg = ((ch.rootSemitone - tonic) % 12 + 12) % 12;
        const idx = scale.indexOf(deg);
        if (idx >= 0 && qualClass(ch.quality) === quals[idx]) qFit += 1;
      }
      score += 0.012 * qFit;

      // Cadential landing: the chord a song starts and (especially) ends on is a
      // strong tonic cue.
      if (tonic === firstRoot) score += 0.06;
      if (tonic === lastRoot) score += 0.10;
      if (mode === "major") score += 0.001; // faint prior, breaks exact ties

      if (!best || score > best.score) best = { tonic, mode, score };
    }
  }
  return best;
}
