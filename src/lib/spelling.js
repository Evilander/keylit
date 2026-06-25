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

// Display string for a chord, spelled for the key. Mirrors theory.chordSymbol
// but key-aware. Quality + slash bass handled the same way.
export function spellChord(chord, keyCtx) {
  if (!chord) return "";
  const root = spellPc(chord.rootSemitone, keyCtx);
  const bass = chord.bassSemitone === null || chord.bassSemitone === undefined
    ? "" : "/" + spellPc(chord.bassSemitone, keyCtx);
  return root + symFromName(chord.quality) + bass;
}

// Return a chord clone whose rootName/bassName/raw are spelled for the key.
// Use this once on the working progression so downstream code that reads
// chord.rootName / chordSymbol() is automatically key-correct.
export function respell(chord, keyCtx) {
  if (!chord) return chord;
  const rootName = spellPc(chord.rootSemitone, keyCtx);
  const bassName = chord.bassSemitone === null || chord.bassSemitone === undefined
    ? null : spellPc(chord.bassSemitone, keyCtx);
  return {
    ...chord,
    rootName,
    bassName,
    raw: rootName + symFromName(chord.quality) + (bassName ? "/" + bassName : ""),
  };
}
