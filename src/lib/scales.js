// scales.js — pure: "what scale do I play over this chord?" (chord-scale theory).
// For melody writing and soloing. Returns scales as pitch-class sets so the UI
// can name them and (later) light them on the keyboard.

import { qualClass } from "./theory.js";

// Interval recipes (semitones from the scale root).
export const SCALE_SHAPES = {
  major:           [0, 2, 4, 5, 7, 9, 11],   // Ionian
  ionian:          [0, 2, 4, 5, 7, 9, 11],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  mixolydian:      [0, 2, 4, 5, 7, 9, 10],
  aeolian:         [0, 2, 3, 5, 7, 8, 10],   // natural minor
  locrian:         [0, 1, 3, 5, 6, 8, 10],
  "harmonic minor":[0, 2, 3, 5, 7, 8, 11],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  "lydian dominant":[0, 2, 4, 6, 7, 9, 10],
  "lydian augmented":[0, 2, 4, 6, 8, 9, 11], // melodic minor's 3rd mode: the maj7♯5 scale
  altered:         [0, 1, 3, 4, 6, 8, 10],   // super-locrian
  "major pentatonic":[0, 2, 4, 7, 9],
  "minor pentatonic":[0, 3, 5, 7, 10],
  "blues":         [0, 3, 5, 6, 7, 10],
  "whole-half dim":[0, 2, 3, 5, 6, 8, 9, 11],
  "whole tone":    [0, 2, 4, 6, 8, 10],
  "augmented":     [0, 3, 4, 7, 8, 11],
};

export function scalePitchClasses(rootSemitone, shapeName) {
  const shape = SCALE_SHAPES[shapeName] || SCALE_SHAPES.major;
  return shape.map((iv) => ((rootSemitone + iv) % 12 + 12) % 12);
}

// Pick the scales that fit a chord. The first is the "safe / inside" choice;
// the rest add color. Returns [{ name, root, shape, pcs, note }].
export function scalesForChord(chord) {
  const root = chord.rootSemitone;
  const q = chord.quality;
  const cls = qualClass(q);
  const picks = [];
  const add = (shape, note) => picks.push({
    name: nameFor(root, shape), root, shape,
    pcs: scalePitchClasses(root, shape), note,
  });

  // m7♭5 (half-diminished) and diminished. qualClass groups m7♭5 with the
  // diminished family, so detect half-diminished by the ♭5 in its name and keep
  // the fully-diminished branch for everything else in that family.
  const isHalfDim = (cls === "dim" || cls === "min") && q.includes("♭5");
  const isFullDim = cls === "dim" && !isHalfDim;
  // dominant 7 family: starts with "7", or is a 9/11/13 (which contain a dom 7),
  // unless it's a maj7/maj9/etc. (those are the major family).
  // Dominant family: a ♭7 over a major 3rd or a sus. The named extensions
  // count too — "9sus4" and "13♯11" are dominants, and reading them as major
  // handed the player a natural 7 against the chord's own ♭7.
  const isDominant = !q.startsWith("maj") &&
    (q.startsWith("7") || /^(9|11|13)([♯♭#b][0-9]+|sus[24]?)?$/.test(q));
  const isAltered = isDominant && /[♭♯]/.test(q);

  if (isHalfDim) {
    add("locrian", "the half-diminished home base");
    add("harmonic minor", "if it's resolving as a vii°");
  } else if (isFullDim) {
    add("whole-half dim", "the symmetric diminished sound");
    add("harmonic minor", "if it's resolving as a vii°");
  } else if (isAltered && /[♯#]11/.test(q) && !/[♯♭#b](5|9)/.test(q)) {
    // A ♯11 on its own is not "altered" in the jazz sense — it is lydian
    // dominant's defining note, and the altered scale flattens the 5th out
    // from under it. Altered leads only when the 5th or 9th is really wrecked.
    add("lydian dominant", "the ♯11 is this scale's own note");
    add("altered", "only when it resolves and you want more tension");
  } else if (isAltered) {
    add("altered", "for maximum tension into the resolution");
    // An altered FIFTH (♯5/♭5) rules out lydian dominant (it has a natural 5);
    // whole-tone contains the altered 5th instead.
    if (/[♯#♭b]5/.test(q)) add("whole tone", "fits the altered 5th — no natural 5 to clash");
    else add("lydian dominant", "smoother altered color (♯11)");
  } else if (isDominant) {
    add("mixolydian", "the bread-and-butter dominant scale");
    add("lydian dominant", "brighter, jazzy (#11)");
    add("blues", "for a grittier, vocal line");
  } else if (cls === "min" && /maj7/.test(q)) {
    // m(maj7) is built on a NATURAL 7th. Dorian and aeolian both flat it, so
    // the generic minor picks would hand the player the one note this chord
    // exists to contradict.
    add("melodic minor", "the natural 7th is the whole point of this chord");
    add("harmonic minor", "darker — a flat 6 under the same natural 7");
  } else if (cls === "min") {
    add("dorian", "the modern, slightly bright minor (jazz/pop default)");
    add("aeolian", "natural minor — sadder, more classic");
    add("minor pentatonic", "the safe 5-note line for soloing");
  } else if (q.startsWith("maj") && /[♯#]5/.test(q)) {
    // maj7♯5: a natural 7 sitting on an augmented triad. The plain major
    // scale has a natural 5 that fights the ♯5, so it cannot lead here.
    add("lydian augmented", "melodic minor's third mode — it owns the ♯5 under a natural 7");
    add("augmented", "the symmetric augmented sound");
  } else if (cls === "aug") {
    add("whole tone", "the symmetric augmented sound — contains the ♯5");
    add("augmented", "the augmented scale (alternating minor-3rd / half-step)");
  } else {
    // major family (maj, maj7, 6, add9, 6/9, sus, ...)
    // A ♯11 rules the plain major scale out: its natural 4 sits a
    // half-step under the chord's ♯11 and sours it. Lydian owns that note.
    if (/[♯#]11/.test(q)) {
      add("lydian", "the ♯11 is lydian's own note");
      add("major", "only if the line stays off the natural 4");
    } else {
      add("major", "the home major scale");
      add("lydian", "dreamy, floating (#4) — great for a IV or a static major");
    }
    add("major pentatonic", "the safe 5-note line for melodies");
  }
  return picks;
}

function nameFor(root, shape) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const label = shape.replace(/\b\w/g, (c) => c.toUpperCase());
  return `${NAMES[((root % 12) + 12) % 12]} ${label}`;
}
