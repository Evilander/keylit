// spelling.js — pure, key-aware enharmonic spelling.
//
// The rest of Keylit does all math in pitch classes (0-11); names are cosmetic.
// But "A#" in the key of F is wrong — it should read "Bb". This module picks
// sharps vs flats from the key signature so every displayed name is spelled the
// way a musician would actually write it. No pitch ever changes — only its label.

import { SHARP_NAMES, symFromName } from "./theory.js";

export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Relative-major tonic pitch classes whose key signatures use flats.
// (F, Bb, Eb, Ab, Db, Gb majors — and their relative minors via the +3 mapping.)
const FLAT_REL_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

// Does this key spell its accidentals with flats? Minor keys borrow the key
// signature of their relative major (a minor third up).
export function keyPrefersFlats(tonic, mode = "major") {
  const relMajor = mode === "minor" ? ((tonic + 3) % 12) : (((tonic % 12) + 12) % 12);
  return FLAT_REL_MAJORS.has(relMajor);
}

// Spell one pitch class for a key context { tonic, mode }.
export function spellPc(pc, keyCtx) {
  const p = (((pc % 12) + 12) % 12);
  const flats = keyCtx ? keyPrefersFlats(keyCtx.tonic, keyCtx.mode) : false;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[p];
}

// Chromatic pitch classes (relative to the tonic) that the app's whole number
// language reads as FLAT degrees: ♭2 ♭3 ♭5 ♭6 ♭7 (see theory.MAJOR_DEGREE).
const FLAT_DEGREES = new Set([1, 3, 6, 8, 10]);

// Spell a pitch class by its DEGREE FUNCTION in the key: if the number rail
// calls it ♭3, the note must read E♭ — even in a sharps key like C or G.
// Diatonic notes keep the key-signature spelling.
export function spellDegreePc(pc, keyCtx) {
  const p = (((pc % 12) + 12) % 12);
  if (!keyCtx) return SHARP_NAMES[p];
  const rel = (((p - keyCtx.tonic) % 12) + 12) % 12;
  if (FLAT_DEGREES.has(rel)) return FLAT_NAMES[p];
  return spellPc(p, keyCtx);
}

// Display string for a chord, spelled for the key. Mirrors theory.chordSymbol
// but key-aware. Quality + slash bass handled the same way.
export function spellChord(chord, keyCtx) {
  if (!chord) return "";
  const root = spellDegreePc(chord.rootSemitone, keyCtx);
  const bass = chord.bassSemitone === null || chord.bassSemitone === undefined
    ? "" : "/" + spellDegreePc(chord.bassSemitone, keyCtx);
  return root + symFromName(chord.quality) + bass;
}

// Return a chord clone whose rootName/bassName/raw are spelled for the key.
// Use this once on the working progression so downstream code that reads
// chord.rootName / chordSymbol() is automatically key-correct.
export function respell(chord, keyCtx) {
  if (!chord) return chord;
  const rootName = spellDegreePc(chord.rootSemitone, keyCtx);
  const bassName = chord.bassSemitone === null || chord.bassSemitone === undefined
    ? null : spellDegreePc(chord.bassSemitone, keyCtx);
  return {
    ...chord,
    rootName,
    bassName,
    raw: rootName + symFromName(chord.quality) + (bassName ? "/" + bassName : ""),
  };
}
