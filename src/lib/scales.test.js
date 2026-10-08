import { describe, it, expect } from "vitest";
import { parseChord } from "./theory.js";
import { scalesForChord, scalePitchClasses, SCALE_SHAPES } from "./scales.js";

describe("scalePitchClasses", () => {
  it("builds C major", () => {
    expect(scalePitchClasses(0, "major")).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
  it("builds G mixolydian", () => {
    expect(scalePitchClasses(7, "mixolydian")).toEqual([7, 9, 11, 0, 2, 4, 5]);
  });
});

describe("scalesForChord", () => {
  it("suggests mixolydian first over a dominant 7", () => {
    const s = scalesForChord(parseChord("G7"));
    expect(s[0].shape).toBe("mixolydian");
    expect(s[0].name).toBe("G Mixolydian");
    expect(s[0].pcs).toContain(5); // F natural — the b7
  });
  it("suggests dorian/aeolian over a minor 7", () => {
    const shapes = scalesForChord(parseChord("Am7")).map((x) => x.shape);
    expect(shapes).toContain("dorian");
    expect(shapes).toContain("aeolian");
  });
  it("suggests major + lydian over a maj7", () => {
    const shapes = scalesForChord(parseChord("Fmaj7")).map((x) => x.shape);
    expect(shapes).toContain("major");
    expect(shapes).toContain("lydian");
  });
  it("suggests an altered scale over an altered dominant", () => {
    const shapes = scalesForChord(parseChord("G7b9")).map((x) => x.shape);
    expect(shapes).toContain("altered");
  });
  it("suggests the diminished scale over a dim7", () => {
    const shapes = scalesForChord(parseChord("Bdim7")).map((x) => x.shape);
    expect(shapes).toContain("whole-half dim");
  });
  it("every pick carries a name, root, and pitch classes", () => {
    for (const p of scalesForChord(parseChord("Dm7"))) {
      expect(p.name).toBeTruthy();
      expect(typeof p.root).toBe("number");
      expect(Array.isArray(p.pcs)).toBe(true);
      expect(p.pcs.length).toBeGreaterThan(0);
    }
  });

  it("recommends whole-tone over an augmented chord and includes the ♯5", () => {
    const picks = scalesForChord(parseChord("Caug"));
    expect(picks[0].shape).toBe("whole tone");
    expect(picks[0].pcs).toContain(8); // G# — the #5 of C+
  });

  it("recommends locrian (half-diminished) over m7♭5, not the diminished scale", () => {
    const shapes = scalesForChord(parseChord("Bm7b5")).map((x) => x.shape);
    expect(shapes).toContain("locrian");
    expect(shapes).not.toContain("whole-half dim");
  });

  it("uses whole-tone (not lydian dominant) for a ♯5 altered dominant", () => {
    const shapes = scalesForChord(parseChord("C7#5")).map((x) => x.shape);
    expect(shapes).toContain("altered");
    expect(shapes).toContain("whole tone");
    expect(shapes).not.toContain("lydian dominant");
  });
});

describe("scalePitchClasses — new shapes", () => {
  it("builds a whole-tone scale", () => {
    expect(scalePitchClasses(0, "whole tone")).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe("a suggested scale must fit the chord under it", () => {
  // The first pick is what the room shows first, so it is the one that has
  // to contain every note of the chord. The altered scale is the standing
  // exception: it drops the natural 5 on purpose, and it IS the scale for
  // an altered dominant.
  const VOCAB = [
    "C", "Cm", "C7", "Cmaj7", "Cm7", "Cdim", "Cdim7", "Caug", "Csus2", "Csus4",
    "C6", "Cm6", "Cadd9", "C9", "Cmaj9", "Cm9", "C7sus4", "Cm7b5", "C11", "C13",
    "C6/9", "Cmmaj7", "C7#5", "C7b5", "C7#11", "Cmaj7#11", "Cø7", "C+7",
    "Caug7", "Caugmaj7", "Cmaj7#5", "C9sus4", "C13sus4", "C9#11", "C13#11",
  ];

  it.each(VOCAB)("%s: the first scale holds every chord tone", (sym) => {
    const ch = parseChord(sym);
    expect(ch, sym).not.toBeNull();
    const first = scalesForChord(ch)[0];
    expect(first, sym).toBeTruthy();
    const pcs = new Set(first.pcs);
    const missing = ch.intervals
      .map((i) => (ch.rootSemitone + i) % 12)
      .filter((pc) => !pcs.has(pc));
    expect(missing, `${sym} -> ${first.name}`).toEqual([]);
  });

  // A m(maj7) exists to put a NATURAL 7 over a minor triad. Dorian and
  // aeolian both flat it, so leading with them named the one note the chord
  // is built to contradict.
  it.each([
    ["Cmmaj7", "C Melodic Minor"],
    ["Cm7", "C Dorian"],
    ["C7#11", "C Lydian Dominant"],
    ["Cmaj7#11", "C Lydian"],
    ["Cmaj7", "C Major"],
    ["C7", "C Mixolydian"],
    ["C7b9", "C Altered"],
    ["Cmaj7#5", "C Lydian Augmented"],
    ["C9sus4", "C Mixolydian"],
  ])("%s leads with %s", (sym, expected) => {
    expect(scalesForChord(parseChord(sym))[0].name).toBe(expected);
  });
});

it("includes the natural sixth in lydian augmented, melodic minor mode three", () => {
  expect(scalePitchClasses(0, "lydian augmented")).toEqual([0, 2, 4, 6, 8, 9, 11]);
});
