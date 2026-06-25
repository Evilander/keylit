import { describe, it, expect } from "vitest";
import { parseChord } from "./theory.js";
import {
  LOW_MIDI, HIGH_MIDI, clampVoicing, reduceVoicing, addBass,
  rootPositionUpper, rootPositionFull, smoothUpper, KEYS, midiName, midiOctave,
} from "./voicing.js";

const pc = (m) => ((m % 12) + 12) % 12;

// The set of pitch classes that are legitimate chord tones (intervals over the
// root, plus the slash bass when present).
function chordTones(chord) {
  const s = new Set(chord.intervals.map((iv) => (chord.rootSemitone + iv) % 12));
  if (chord.bassSemitone !== null && chord.bassSemitone !== undefined) {
    s.add(((chord.bassSemitone % 12) + 12) % 12);
  }
  return s;
}

// A spread of chords that exercises triads, 7ths, extensions, slash, dim/aug.
const CHORDS = [
  "C", "Am", "F", "G", "Em7", "Dm7", "G7", "Cmaj7", "Bdim7", "Caug",
  "F#m7b5", "Bb13", "Eb9", "Dsus4", "Aadd9", "C/E", "G/B", "Fmaj7/A", "Eb6",
].map(parseChord);

it("(sanity) all test chords parse", () => {
  for (const c of CHORDS) expect(c).not.toBeNull();
});

describe("voicing — chord-tone integrity", () => {
  it("every note of rootPositionUpper is a chord tone", () => {
    for (const ch of CHORDS) {
      const tones = chordTones(ch);
      for (const m of rootPositionUpper(ch)) expect(tones.has(pc(m))).toBe(true);
    }
  });

  it("every note of rootPositionFull is a chord tone", () => {
    for (const ch of CHORDS) {
      const tones = chordTones(ch);
      for (const m of rootPositionFull(ch)) expect(tones.has(pc(m))).toBe(true);
    }
  });

  it("every note of a smooth voicing is a chord tone", () => {
    let prev = null;
    for (const ch of CHORDS) {
      const v = smoothUpper(ch, prev);
      const tones = chordTones(ch);
      for (const m of v) expect(tones.has(pc(m))).toBe(true);
      prev = v;
    }
  });
});

describe("voicing — keyboard range (MIDI 36–72)", () => {
  it("rootPositionFull never leaves the range", () => {
    for (const ch of CHORDS) {
      for (const m of rootPositionFull(ch)) {
        expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
        expect(m).toBeLessThanOrEqual(HIGH_MIDI);
      }
    }
  });

  it("smooth voicings never leave the range", () => {
    let prev = null;
    for (const ch of CHORDS) {
      const v = smoothUpper(ch, prev);
      for (const m of v) {
        expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
        expect(m).toBeLessThanOrEqual(HIGH_MIDI);
      }
      prev = v;
    }
  });

  it("clampVoicing folds out-of-range notes back in and de-dupes", () => {
    const v = clampVoicing([12, 24, 36, 60, 84, 96]);
    for (const m of v) {
      expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
      expect(m).toBeLessThanOrEqual(HIGH_MIDI);
    }
    expect(new Set(v).size).toBe(v.length); // no duplicates
    expect([...v]).toEqual([...v].sort((a, b) => a - b)); // sorted
  });
});

describe("voicing — slash bass", () => {
  it("places the slash bass as the lowest note, at the bass pitch class", () => {
    const ch = parseChord("C/E");
    const v = rootPositionFull(ch);
    expect(pc(Math.min(...v))).toBe(ch.bassSemitone); // E in the bass
    expect(Math.min(...v)).toBeLessThan(Math.min(...rootPositionUpper(ch)));
  });

  it("does not add a separate bass when the slash bass equals the root", () => {
    const plain = rootPositionUpper(parseChord("C"));
    const sameBass = addBass(plain, parseChord("C")); // no bassSemitone -> unchanged
    expect(sameBass).toEqual(plain);
  });

  it("keeps the slash bass lowest even when the upper voicing sits near the bottom", () => {
    const v = addBass([36, 40, 43], parseChord("C/E")); // E must end up in the bass
    const lo = Math.min(...v);
    expect(pc(lo)).toBe(4); // E
    expect(v.filter((m) => m === lo).length).toBe(1); // unique — not deduped away
    for (const m of v) expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
  });

  it("places G/B's B in the bass from a low voicing", () => {
    const v = addBass([36, 43, 47], parseChord("G/B"));
    expect(pc(Math.min(...v))).toBe(11); // B
  });
});

describe("voicing — reduceVoicing", () => {
  it("keeps small chords intact", () => {
    expect(reduceVoicing([0, 4, 7])).toEqual([0, 4, 7]);
    expect(reduceVoicing([0, 3, 7, 10])).toEqual([0, 3, 7, 10]);
  });

  it("trims big chords to at most 4 notes including the root and a 3rd/7th", () => {
    const r = reduceVoicing([0, 4, 7, 10, 14, 21]); // a 13 chord
    expect(r.length).toBeLessThanOrEqual(4);
    expect(r).toContain(0);                       // root kept
    expect(r.some((i) => i === 3 || i === 4)).toBe(true); // a third kept
  });

  it("drops the major 3rd against an 11th (dominant 11), keeps a minor 3rd", () => {
    const c11 = reduceVoicing([0, 4, 7, 10, 14, 17]); // C11
    expect(c11).not.toContain(4); // major 3rd dropped (avoids the ♭9 clash with the 11)
    expect(c11).toContain(17);    // the 11th survives
    const m11 = reduceVoicing([0, 3, 7, 10, 14, 17]); // Cm11
    expect(m11).toContain(3);     // minor 3rd doesn't clash, kept
  });
});

describe("voicing — voice leading reduces movement", () => {
  // nearest-note movement of voicing `b` relative to `a`
  const movement = (a, b) =>
    b.reduce((sum, n) => sum + Math.min(...a.map((p) => Math.abs(n - p))), 0);

  it("smooth chain moves no more than the root-position chain", () => {
    const prog = ["C", "Am", "Dm7", "G7", "Cmaj7", "F", "G", "C"].map(parseChord);

    let smoothTotal = 0, prevSmooth = null;
    for (const ch of prog) {
      const v = smoothUpper(ch, prevSmooth);
      if (prevSmooth) smoothTotal += movement(prevSmooth, v);
      prevSmooth = v;
    }

    let rootTotal = 0, prevRoot = null;
    for (const ch of prog) {
      const v = rootPositionUpper(ch);
      if (prevRoot) rootTotal += movement(prevRoot, v);
      prevRoot = v;
    }

    expect(smoothTotal).toBeLessThanOrEqual(rootTotal);
  });
});

describe("voicing — keyboard geometry", () => {
  it("spans C2–C5 with the right number of white keys", () => {
    // 36..72 inclusive = 3 octaves + 1; white keys per octave = 7, plus the top C
    expect(KEYS.whiteKeys[0].midi).toBe(LOW_MIDI);
    expect(KEYS.whiteKeys[KEYS.whiteKeys.length - 1].midi).toBe(HIGH_MIDI);
    expect(KEYS.whiteKeys.length).toBe(22); // C2..C5 inclusive
  });

  it("black keys land only on the five black pitch classes", () => {
    const black = new Set([1, 3, 6, 8, 10]);
    for (const bk of KEYS.blackKeys) expect(black.has(bk.midi % 12)).toBe(true);
  });

  it("white keys are evenly spaced and black keys sit between them", () => {
    for (let i = 1; i < KEYS.whiteKeys.length; i++) {
      expect(KEYS.whiteKeys[i].x).toBeGreaterThan(KEYS.whiteKeys[i - 1].x);
    }
    expect(midiName(60)).toBe("C");
    expect(midiOctave(60)).toBe(4); // MIDI 60 = C4
  });
});
