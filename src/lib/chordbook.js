// chordbook.js — the chord bible's table of contents. The paper version
// prints two thousand grids; this one stores NONE. It is only a curated map
// of the qualities a working guitarist reaches for, grouped the way chord
// bibles group them — every actual fingering is derived live by chordShapes,
// which is what lets the same book open in any tuning. Pure.
import { QUALITIES, buildChord, symFromName } from "./theory.js";

// Quality keys into theory.QUALITIES, grouped by family. Order within a
// family is teaching order: the plain chord first, colors after.
export const CHORD_FAMILIES = [
  { id: "major", label: "Major", keys: ["", "maj7", "maj9", "6", "6/9", "add9", "sus2", "sus4"] },
  { id: "minor", label: "Minor", keys: ["m", "m7", "m9", "m11", "m6", "madd9", "mmaj7"] },
  { id: "dominant", label: "Dominant", keys: ["7", "9", "13", "7sus4", "7b9", "7#9", "7b5", "7#5"] },
  { id: "shade", label: "Dim & Aug", keys: ["dim", "dim7", "m7b5", "aug"] },
  { id: "power", label: "Power", keys: ["5"] },
];

// The suffix a chord symbol prints for a book key ("maj" for the plain major,
// so the chip has a name at all).
export function qualityLabel(key) {
  const def = QUALITIES[key];
  if (!def) return key;
  const suffix = symFromName(def.name);
  return suffix === "" ? "maj" : suffix;
}

// One page of the book: the chord itself. (buildChord validates the key.)
export const bookChord = (rootPc, qualityKey) => buildChord(rootPc, qualityKey);

// Locate a parsed chord in the book by its canonical quality name — powers
// the "look up F#m7" search. A slash bass is the player's business, not the
// book's; it indexes by root + quality only. Returns { familyId, key } | null.
export function findInBook(chord) {
  if (!chord) return null;
  for (const family of CHORD_FAMILIES) {
    for (const key of family.keys) {
      if (QUALITIES[key].name === chord.quality) return { familyId: family.id, key };
    }
  }
  return null;
}
