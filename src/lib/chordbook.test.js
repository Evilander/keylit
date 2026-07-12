import { describe, it, expect } from "vitest";
import { CHORD_FAMILIES, qualityLabel, bookChord, findInBook } from "./chordbook.js";
import { QUALITIES, parseChord } from "./theory.js";
import { chordShapes } from "./chordShapes.js";
import { TUNINGS } from "./tuning.js";

const ALL_KEYS = CHORD_FAMILIES.flatMap((f) => f.keys);

describe("CHORD_FAMILIES — the table of contents", () => {
  it("every key is a real QUALITIES entry that builds a chord", () => {
    for (const k of ALL_KEYS) {
      expect(QUALITIES[k], `"${k}" should be a QUALITIES key`).toBeDefined();
      const ch = bookChord(0, k);
      expect(ch, `"${k}" should build at C`).not.toBeNull();
      expect(ch.intervals.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("no two pages sound the same (interval sets are unique across the book)", () => {
    const seen = new Map();
    for (const k of ALL_KEYS) {
      const sig = [...bookChord(0, k).intervals].sort((a, b) => a - b).join(",");
      expect(seen.has(sig), `"${k}" duplicates "${seen.get(sig)}"`).toBe(false);
      seen.set(sig, k);
    }
  });

  it("labels read as chord-symbol suffixes", () => {
    expect(qualityLabel("")).toBe("maj");
    expect(qualityLabel("m")).toBe("m");
    expect(qualityLabel("m7b5")).toBe("m7♭5");
    expect(qualityLabel("mmaj7")).toBe("m(maj7)");
    expect(qualityLabel("6/9")).toBe("6/9");
  });

  it("the book symbol re-parses to the same chord", () => {
    for (const k of ALL_KEYS) {
      const ch = bookChord(7, k); // G-rooted
      const back = parseChord(ch.raw);
      expect(back, `${ch.raw} should re-parse`).not.toBeNull();
      expect(back.intervals).toEqual(ch.intervals);
    }
  });
});

describe("every page has a playable grip", () => {
  it("all 12 roots × every quality find at least one shape in standard tuning", () => {
    for (const k of ALL_KEYS) {
      for (let root = 0; root < 12; root++) {
        const ch = bookChord(root, k);
        const shapes = chordShapes(ch, { limit: 1 });
        expect(shapes.length, `${ch.raw} should have a grip`).toBeGreaterThan(0);
      }
    }
  });

  it("the book opens in an alternate tuning too (spot check: open G)", () => {
    for (const k of ["", "m", "7", "sus4"]) {
      const shapes = chordShapes(bookChord(7, k), { tuning: TUNINGS.openG.notes, limit: 1 });
      expect(shapes.length).toBeGreaterThan(0);
    }
  });
});

describe("findInBook — the lookup path", () => {
  it("locates a parsed chord by quality", () => {
    expect(findInBook(parseChord("F#m7"))).toEqual({ familyId: "minor", key: "m7" });
    expect(findInBook(parseChord("C"))).toEqual({ familyId: "major", key: "" });
    expect(findInBook(parseChord("Bb7#9"))).toEqual({ familyId: "dominant", key: "7#9" });
    expect(findInBook(parseChord("A5"))).toEqual({ familyId: "power", key: "5" });
  });

  it("a slash bass doesn't derail the lookup", () => {
    expect(findInBook(parseChord("D/F#"))).toEqual({ familyId: "major", key: "" });
  });

  it("returns null off the pages", () => {
    expect(findInBook(parseChord("Cmaj13"))).toBeNull(); // not curated (yet)
    expect(findInBook(null)).toBeNull();
  });
});
