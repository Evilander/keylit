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
  const isDominant = !q.startsWith("maj") &&
    (q.startsWith("7") || q === "9" || q === "11" || q === "13");
  const isAltered = isDominant && /[♭♯]/.test(q);

  if (isHalfDim) {
    add("locrian", "the half-diminished home base");
    add("harmonic minor", "if it's resolving as a vii°");
  } else if (isFullDim) {
    add("whole-half dim", "the symmetric diminished sound");
    add("harmonic minor", "if it's resolving as a vii°");
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
  } else if (cls === "min") {
    add("dorian", "the modern, slightly bright minor (jazz/pop default)");
    add("aeolian", "natural minor — sadder, more classic");
    add("minor pentatonic", "the safe 5-note line for soloing");
  } else if (cls === "aug") {
    add("whole tone", "the symmetric augmented sound — contains the ♯5");
    add("augmented", "the augmented scale (alternating minor-3rd / half-step)");
  } else {
    // major family (maj, maj7, 6, add9, 6/9, sus, ...)
    add("major", "the home major scale");
    add("lydian", "dreamy, floating (#4) — great for a IV or a static major");
    add("major pentatonic", "the safe 5-note line for melodies");
  }
  return picks;
}

function nameFor(root, shape) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const label = shape.replace(/\b\w/g, (c) => c.toUpperCase());
  return `${NAMES[((root % 12) + 12) % 12]} ${label}`;
}
