import { describe, it, expect } from "vitest";
import { parseChord, chordSymbol, shapeEase } from "./theory.js";
import { TUNINGS } from "./tuning.js";
import {
  classifyOpen,
  classifyChord,
  playInTuning,
  suggestArrangements,
  bestArrangement,
} from "./capo.js";

describe("classifyOpen", () => {
  it("open D is a major triad rooted on D", () => {
    const r = classifyOpen(TUNINGS.openD.notes);
    expect(r.rootPc).toBe(2);
    expect(r.quality).toBe("maj");
  });
  it("open E is a major triad rooted on E", () => {
    const r = classifyOpen(TUNINGS.openE.notes);
    expect(r.rootPc).toBe(4);
    expect(r.quality).toBe("maj");
  });
  it("open G is a major triad rooted on G", () => {
    const r = classifyOpen(TUNINGS.openG.notes);
    expect(r.rootPc).toBe(7);
    expect(r.quality).toBe("maj");
  });
  it("open A is a major triad rooted on A", () => {
    const r = classifyOpen(TUNINGS.openA.notes);
    expect(r.rootPc).toBe(9);
    expect(r.quality).toBe("maj");
  });
  it("open C is a major triad rooted on C", () => {
    const r = classifyOpen(TUNINGS.openC.notes);
    expect(r.rootPc).toBe(0);
    expect(r.quality).toBe("maj");
  });
  it("DADGAD is a sus4 rooted on D", () => {
    const r = classifyOpen(TUNINGS.DADGAD.notes);
    expect(r.rootPc).toBe(2);
    expect(r.quality).toBe("sus4");
  });
  it("standard tuning has no open chord", () => {
    expect(classifyOpen(TUNINGS.standard.notes).quality).toBe("standard");
  });
  it("drop D tuning has no open chord", () => {
    expect(classifyOpen(TUNINGS.dropD.notes).quality).toBe("standard");
  });
});

describe("classifyChord", () => {
  it("classifies the basic triad/seventh families", () => {
    expect(classifyChord(parseChord("D"))).toBe("maj");
    expect(classifyChord(parseChord("Dm"))).toBe("min");
    expect(classifyChord(parseChord("D7"))).toBe("dom7");
    expect(classifyChord(parseChord("Ddim"))).toBe("dim");
    expect(classifyChord(parseChord("Daug"))).toBe("aug");
    expect(classifyChord(parseChord("Dsus4"))).toBe("sus");
    expect(classifyChord(parseChord("Dmaj7"))).toBe("maj");
    expect(classifyChord(parseChord("Dm7"))).toBe("min");
  });
});

describe("playInTuning", () => {
  it("D in open D, capo 0: all open", () => {
    const r = playInTuning(parseChord("D"), TUNINGS.openD, 0);
    expect(r.fret).toBe(0);
    expect(r.ease).toBe(0.5);
    expect(r.how).toBe("all open");
  });

  it("G in open D, capo 0: a fret-5 barre", () => {
    const r = playInTuning(parseChord("G"), TUNINGS.openD, 0);
    expect(r.fret).toBe(5);
    expect(r.how).toContain("barre fret 5");
  });

  it("Bb in standard tuning is a hard barre, much harder than an open chord", () => {
    const chord = parseChord("Bb");
    const r = playInTuning(chord, TUNINGS.standard, 0);
    expect(r.ease).toBe(shapeEase(chord));
    expect(r.ease).toBeGreaterThanOrEqual(3);
  });

  it("drop D makes the open D shape itself a touch easier", () => {
    const plain = playInTuning(parseChord("D"), TUNINGS.standard, 0);
    const dropped = playInTuning(parseChord("D"), TUNINGS.dropD, 0);
    expect(dropped.ease).toBeLessThan(plain.ease);
  });
});

describe("suggestArrangements", () => {
  it("returns a non-empty, ease-sorted list where every entry has shapes + a note", () => {
    const results = suggestArrangements(["D", "G", "A"]);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].totalEase).toBeGreaterThanOrEqual(results[i - 1].totalEase);
    }
    for (const r of results) {
      expect(Array.isArray(r.shapes)).toBe(true);
      expect(r.shapes.length).toBeGreaterThan(0);
      expect(typeof r.note).toBe("string");
      expect(r.note.length).toBeGreaterThan(0);
    }
  });

  it("D-G-A is already easy in standard tuning — don't recommend a needless retune", () => {
    const results = suggestArrangements(["D", "G", "A"]);
    for (const r of results) expect(r.totalEase).toBeGreaterThanOrEqual(results[0].totalEase);
    expect(results[0].tuningId).toBe("standard");
    expect(results[0].capo).toBe(0);
  });

  it("C-F#-A needs an open tuning — no capo position in standard tuning rescues it", () => {
    // Unlike a I-IV-V trio (D-G-A, E-A-B, ...), which a capo can always slide
    // into an open-chord-shaped key within 7 frets, C/F#/A isn't a triad built
    // from perfect 4ths/5ths — no standard-tuning capo position lands all
    // three roots in the open-shape set, so an open tuning genuinely wins.
    const results = suggestArrangements(["C", "F#", "A"]);
    const standardCapo0 = results.find((r) => r.tuningId === "standard" && r.capo === 0);
    expect(standardCapo0).toBeTruthy();
    expect(results[0].tuningId).not.toBe("standard");
    expect(results[0].totalEase).toBeLessThan(standardCapo0.totalEase);
  });

  it("accepts already-parsed chord objects, not just strings", () => {
    const prog = ["D", "G", "A"].map(parseChord);
    const fromObjects = suggestArrangements(prog);
    const fromStrings = suggestArrangements(["D", "G", "A"]);
    expect(fromObjects[0].tuningId).toBe(fromStrings[0].tuningId);
    expect(fromObjects[0].capo).toBe(fromStrings[0].capo);
  });

  it("each shape symbol matches a chord in the input progression", () => {
    const results = suggestArrangements(["C", "F#", "A"]);
    const symbols = ["C", "F#", "A"];
    for (const shape of results[0].shapes) {
      expect(symbols).toContain(shape.symbol);
      expect(typeof shape.how).toBe("string");
      expect(shape.how.length).toBeGreaterThan(0);
    }
  });
});

describe("bestArrangement", () => {
  it("is the first (lowest-ease) entry of suggestArrangements", () => {
    const prog = ["D", "G", "A"];
    expect(bestArrangement(prog)).toEqual(suggestArrangements(prog)[0]);
  });
});
