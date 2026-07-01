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

// Assign octaves so the strings ascend, anchoring the lowest string near E2.
function assignOctaves(pcs) {
  const notes = [];
  let first = pcs[0];
  while (first < 36) first += 12; // lowest reasonable bass string ~ C2
  while (first - 12 >= 36) first -= 12; // smallest midi >= 36 for this pc
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

/** Pitch class (0–11) of an open string. */
export function pcOfString(notes, string) {
  return pcMod(notes[string]);
}
