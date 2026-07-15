import { describe, it, expect } from "vitest";
import { chordSymbol } from "./theory.js";
import { harmonizeNotes, segmentMelody, diatonicPalette } from "./harmonize.js";

const C = { tonic: 0, mode: "major" };

describe("harmonizeNotes — candidates with the why", () => {
  it("a C-E-G line in C crowns the 1", () => {
    const cands = harmonizeNotes([60, 64, 67, 64, 60], C);
    expect(chordSymbol(cands[0].chord)).toBe("C");
    expect(cands[0].why).toMatch(/holds your/);
    expect(cands[0].why).toMatch(/home/);
  });
  it("an F-A-C line leans 4 (or its relative), never the 7°", () => {
    const cands = harmonizeNotes([65, 69, 72, 69], C);
    expect(["F", "Dm", "Am"]).toContain(chordSymbol(cands[0].chord));
    expect(cands.every((c) => !chordSymbol(c.chord).includes("dim"))).toBe(true);
  });
  it("a line landing on B pulls dominant-ward", () => {
    const cands = harmonizeNotes([62, 67, 71], C);
    const top2 = cands.slice(0, 2).map((c) => chordSymbol(c.chord));
    expect(top2.some((s) => s === "G" || s === "G7" || s === "Em")).toBe(true);
  });
  it("every why names real notes and a job", () => {
    for (const c of harmonizeNotes([60, 62, 64, 65, 67], C)) {
      expect(c.why.length).toBeGreaterThan(12);
      expect(c.fn).toMatch(/^[TSD?]$/);
    }
  });
  it("empty in, empty out", () => {
    expect(harmonizeNotes([], C)).toEqual([]);
    expect(harmonizeNotes([60], null)).toEqual([]);
  });
});

describe("diatonicPalette", () => {
  it("seven triads plus the V7, all parseable", () => {
    const pal = diatonicPalette(C);
    expect(pal).toHaveLength(8);
    expect(chordSymbol(pal[0])).toBe("C");
    expect(chordSymbol(pal[7])).toBe("G7");
  });
});

describe("segmentMelody — phrases split on breath", () => {
  it("splits on the silence gap and drops one-note fragments", () => {
    const samples = [
      { midi: 60, at: 0 }, { midi: 62, at: 200 }, { midi: 64, at: 400 },
      { midi: 67, at: 2000 }, { midi: 65, at: 2200 },
      { midi: 60, at: 5000 }, // lone grunt — dropped
    ];
    const phrases = segmentMelody(samples);
    expect(phrases).toHaveLength(2);
    expect(phrases[0].midis).toEqual([60, 62, 64]);
    expect(phrases[1].midis).toEqual([67, 65]);
  });
  it("collapses a held note instead of counting it twenty times", () => {
    const held = Array.from({ length: 20 }, (_, i) => ({ midi: 60.2, at: i * 50 }));
    const phrases = segmentMelody(held);
    expect(phrases).toHaveLength(1);
    expect(phrases[0].midis.length).toBeLessThan(8);
  });
});
