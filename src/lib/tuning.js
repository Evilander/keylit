// tuning.js — the fretboard model: alternate guitar tunings as absolute MIDI
// pitches, plus fret/string → note math. Pure (no React/audio/DOM/network).
//
// Convention: MIDI 60 = middle C (C4); standard low E = E2 = MIDI 40. This is
// the SAME absolute-pitch convention voicing.js uses for the keyboard (36–72),
// so a fretted note and a lit piano key speak one language.
//
// theory.js works in octave-free pitch classes (0–11) — great for "what chord,"
// useless for "which exact note a fret sounds." This module fills that gap.

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const pcMod = (n) => ((n % 12) + 12) % 12;

function noteToPc(letter, accidental) {
  let pc = LETTER_PC[letter.toUpperCase()];
  if (pc == null) return null;
  if (accidental === "#") pc += 1;
  else if (accidental === "b") pc -= 1;
  return pcMod(pc);
}

// Turn "E A D G B E" / "EADGBE" / "D A D G A D" into a pitch-class array, or null.
function tokenizeNotes(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  if (!s) return null;
  const tokens = /\s/.test(s) ? s.split(/\s+/) : s.match(/[A-Ga-g][#b]?/g) || [];
  const pcs = [];
  for (const tok of tokens) {
    const m = /^([A-Ga-g])([#b]?)$/.exec(tok);
    if (!m) return null;
    pcs.push(noteToPc(m[1], m[2]));
  }
  return pcs;
}

// Assign octaves so the strings ascend, anchoring the lowest string in the
// real guitar bass register (A1..G#2) — a low B/A string is B1/A1, not B2/A2.
function assignOctaves(pcs) {
  const notes = [];
  let first = pcs[0];
  while (first < 33) first += 12; // lowest reasonable bass string ~ A1
  while (first - 12 >= 33) first -= 12; // smallest midi >= 33 for this pc
  notes.push(first);
  for (let i = 1; i < pcs.length; i++) {
    let m = pcs[i];
    while (m <= notes[i - 1]) m += 12;
    notes.push(m);
  }
  return notes;
}

/** Parse a tuning spelling into ascending MIDI notes (low→high), or null. */
export function parseTuning(str) {
  const pcs = tokenizeNotes(str);
  if (!pcs || pcs.length < 4 || pcs.length > 8) return null;
  return assignOctaves(pcs);
}

// id → [spelling, display name, family]
const SPELLINGS = {
  standard: ["E A D G B E", "Standard", "standard"],
  ebStandard: ["Eb Ab Db Gb Bb Eb", "Eb Standard", "down"],
  dStandard: ["D G C F A D", "D Standard", "down"],
  dropD: ["D A D G B E", "Drop D", "drop"],
  doubleDropD: ["D A D G B D", "Double Drop D", "drop"],
  dropC: ["C G C F A D", "Drop C", "drop"],
  dropCsharp: ["C# G# C# F# A# D#", "Drop C#", "drop"],
  openD: ["D A D F# A D", "Open D", "open"],
  openE: ["E B E G# B E", "Open E", "open"],
  openG: ["D G D G B D", "Open G", "open"],
  openA: ["E A E A C# E", "Open A", "open"],
  openC: ["C G C G C E", "Open C", "open"],
  openCsus2: ["C G C G C D", "Open Csus2", "open"],
  DADGAD: ["D A D G A D", "DADGAD", "modal"],
  CGCGCD: ["C G C G C D", "CGCGCD", "modal"],
  DADGBD: ["D A D G B D", "DADGBD", "modal"],
  EADEAE: ["E A D E A E", "EADEAE", "modal"],
};

/** Canonical named tunings: id → { id, name, family, spelling, notes:[midi×6] }. */
export const TUNINGS = Object.fromEntries(
  Object.entries(SPELLINGS).map(([id, [spelling, name, family]]) => [
    id,
    { id, name, family, spelling, notes: parseTuning(spelling) },
  ])
);

/** Standard tuning as MIDI, low→high: E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING = TUNINGS.standard.notes;

/** Resolve an id ("openD") or free-text spelling ("C G C F C E") to a tuning. */
export function getTuning(idOrSpelling) {
  if (idOrSpelling == null) return TUNINGS.standard;
  if (typeof idOrSpelling === "string" && TUNINGS[idOrSpelling]) return TUNINGS[idOrSpelling];
  const notes = parseTuning(idOrSpelling);
  if (notes) {
    const known = Object.values(TUNINGS).find(
      (t) => t.notes.length === notes.length && t.notes.every((n, i) => n === notes[i])
    );
    if (known) return known;
    const spelling = tuningSpelling(notes);
    return { id: spelling, name: spelling, family: "custom", spelling, notes };
  }
  return TUNINGS.standard;
}

/** Resolve like getTuning, then fold by NOTES to the first canonical entry —
 *  twin names (DADGBD ≡ doubleDropD, CGCGCD ≡ openCsus2) unify for data
 *  tagging while the Tunings UI keeps both lineages. */
export function canonicalTuning(idOrSpelling) {
  const t = getTuning(idOrSpelling);
  const folded = Object.values(TUNINGS).find(
    (k) => k.notes.length === t.notes.length && k.notes.every((n, i) => n === t.notes[i])
  );
  return folded || t;
}

/** MIDI note sounded by a fret on a string (0 = low string). null = muted. */
export function fretToMidi(notes, string, fret) {
  if (fret == null || fret < 0) return null;
  return notes[string] + fret;
}

/** A fret-per-string shape (e.g. [null,3,2,0,1,0]) → sounded MIDI notes low→high. */
export function shapeToMidi(notes, frets) {
  const out = [];
  for (let s = 0; s < frets.length; s++) {
    const m = fretToMidi(notes, s, frets[s]);
    if (m != null) out.push(m);
  }
  return out;
}

/** Render a MIDI tuning array back to a note-name spelling ("E A D G B E"). */
export function tuningSpelling(notes) {
  return notes.map((m) => SHARP_NAMES[pcMod(m)]).join(" ");
}

/** Per-string semitone offset vs standard tuning (negative = tuned down). */
export function relativeToStandard(notes) {
  return notes.map((m, i) => m - STANDARD_TUNING[i]);
}

/* ---- tuning declared in the chart text ---------------------------------
 * Real charts carry their tuning as prose ("Tuning: 1 step down", "drop d,
 * half step down") that scrapers store as metadata "standard". This reads
 * the first lines of a chart and returns a tuning id, or null. Conservative:
 * quarter-steps and lyric-looking lines are ignored. Pure. */
const DOWN_WHOLE = /\b(?:whole|full|one|1)\s+(?:whole\s+|full\s+)?step\s+down\b|\bdown\s+(?:a\s+|one\s+|1\s+)?(?:whole|full)\s+step\b|\bd\s+standard\b|\bdgcfad\b/i;
const DOWN_HALF = /\b(?:half|1\/2)\s+(?:a\s+)?step\s+down\b|\bdown\s+(?:a\s+|one\s+)?(?:half|1\/2)\s+step\b|\beb?\s*flat\s+standard\b|\beb\s+standard\b/i;
const DROP_D_RE = /\bdrop(?:ped)?[\s-]*d\b(?!\s*(?:#|sharp))/i;
// A spelling candidate is note letters + accidentals + separators only —
// this rejects words like "standard" (whose a/d letters would false-parse).
const SPELLING_CHARS = /^[\sA-Ga-g#b♭♯,./|–-]+$/;

// A compact all-caps spelling like DGCFAD or DADGBE glued into prose.
const COMPACT_SPELLING = /\b(?:[A-G][#b]?){6}\b/;
// Prose names: "open D", "drop C#", "dadgad", "double drop d".
const NAME_OPEN = /\bopen\s*([a-g])\b(?!\s*(?:#|sharp))/i;
const NAME_DADGAD = /\bdadgad\b/i;
const NAME_DOUBLE_DROP = /\bdouble[\s-]*drop(?:ped)?[\s-]*d\b/i;
const NAME_DROP_C = /\bdrop(?:ped)?[\s-]*c(\s*#|sharp)?\b/i;

/**
 * Two-phase scan of the WHOLE text:
 *  A) explicit letters (compact CGCEGC / spelled "Tuning: D-G-C-F-A-D") —
 *     the most specific statement always wins, wherever it appears;
 *  B) prose (step-downs, drop/open/dadgad names, explicit "standard").
 * Quarter-step tunings aren't representable and are ignored.
 */
export function detectDeclaredTuning(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // --- phase A: explicit letters ---
  for (const line of lines) {
    if (/1\/4|quarter/i.test(line)) continue;
    const compact = COMPACT_SPELLING.exec(line);
    if (compact) {
      const t = canonicalTuning(compact[0]);
      if (t.id !== "standard" || /\btun/i.test(line) || /dropped|version/i.test(line)) return t.id;
    }
    if (/tun/i.test(line) && /[:\-–]/.test(line)) {
      const rest = line.slice(line.search(/[:\-–]/) + 1).trim();
      if (rest && SPELLING_CHARS.test(rest)) {
        const notes = parseTuning(rest.replace(/[,./|–-]+/g, " "));
        if (notes) return canonicalTuning(rest.replace(/[,./|–-]+/g, " ")).id;
      }
    }
  }

  // --- phase B: prose ---
  for (const line of lines) {
    const tuney = /tun(?:e|ing|ed)?\b|tuning/i.test(line) && /tun/i.test(line);
    const standalone = line.length <= 24 && /step/i.test(line) && /down/i.test(line);
    const droppy = /\bdrop/i.test(line);
    const namey = NAME_OPEN.test(line) || NAME_DADGAD.test(line);
    if (!tuney && !standalone && !droppy && !namey) continue;
    if (/1\/4|quarter/i.test(line)) continue;
    const whole = DOWN_WHOLE.test(line);
    const half = DOWN_HALF.test(line);
    if (NAME_DOUBLE_DROP.test(line)) return "doubleDropD";
    if (DROP_D_RE.test(line)) return whole ? "dropC" : half ? "dropCsharp" : "dropD";
    if (whole) return "dStandard";
    if (half) return "ebStandard";
    const dc = NAME_DROP_C.exec(line);
    if (dc) return dc[1] ? "dropCsharp" : "dropC";
    const open = NAME_OPEN.exec(line);
    if (open) {
      const id = "open" + open[1].toUpperCase();
      if (TUNINGS[id]) return id;
    }
    if (NAME_DADGAD.test(line)) return "DADGAD";
    if (tuney && (/\bstandard\b/i.test(line) || /\beadgbe\b/i.test(line))) return "standard";
  }
  return null;
}

/** Pitch class (0–11) of an open string. */
export function pcOfString(notes, string) {
  return pcMod(notes[string]);
}
