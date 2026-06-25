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
});
