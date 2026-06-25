import { describe, it, expect } from "vitest";
import { parseChord, chordSymbol, buildChord, diatonicChord } from "./theory.js";
import {
  dominantOf, iiOf, tritoneSubOf, passingDimBetween,
  replaceChord, insertBeforeChord, insertAfterChord,
  suggestProgressionEdits, suggestionsFor, KNOWN_STYLES, simplify,
} from "./suggest.js";

const sym = (c) => chordSymbol(c);

describe("dominantOf", () => {
  it("returns G7 for C", () => {
    expect(sym(dominantOf(0))).toBe("G7");
  });
  it("returns D7 for G", () => {
    expect(sym(dominantOf(7))).toBe("D7");
  });
  it("returns B7 for E", () => {
    expect(sym(dominantOf(4))).toBe("B7");
  });
});

describe("iiOf", () => {
  it("returns Dm7 for C", () => {
    expect(sym(iiOf(0))).toBe("Dm7");
  });
  it("returns Am7 for G", () => {
    expect(sym(iiOf(7))).toBe("Am7");
  });
});

describe("tritoneSubOf", () => {
  it("substitutes G7 with Db7", () => {
    const sub = tritoneSubOf(parseChord("G7"));
    expect(sym(sub)).toBe("C#7"); // C# is enharmonic to Db; sharps-only naming
  });
  it("substitutes A7 with Eb7", () => {
    const sub = tritoneSubOf(parseChord("A7"));
    expect(sym(sub)).toBe("D#7");
  });
});

describe("passingDimBetween", () => {
  it("inserts C#°7 between C and D (whole step up)", () => {
    const d = passingDimBetween(parseChord("C"), parseChord("D"));
    expect(sym(d)).toBe("C#dim7");
  });
  it("inserts Bb°7 between C and Bb (whole step down)", () => {
    const d = passingDimBetween(parseChord("C"), parseChord("Bb"));
    expect(sym(d)).toBe("Bdim7");
  });
  it("returns null when not a whole step apart", () => {
    expect(passingDimBetween(parseChord("C"), parseChord("F"))).toBeNull();
  });
});

describe("buildChord & diatonicChord", () => {
  it("buildChord(0, 'maj7') is Cmaj7", () => {
    expect(sym(buildChord(0, "maj7"))).toBe("Cmaj7");
  });
  it("diatonicChord(0, 'major', 0) is C", () => {
    expect(sym(diatonicChord(0, "major", 0))).toBe("C");
  });
  it("diatonicChord(0, 'major', 4) is G", () => {
    expect(sym(diatonicChord(0, "major", 4))).toBe("G");
  });
  it("diatonicChord(0, 'major', 4, true) is G7 (dominant 7)", () => {
    expect(sym(diatonicChord(0, "major", 4, true))).toBe("G7");
  });
  it("diatonicChord(0, 'major', 0, true) is Cmaj7", () => {
    expect(sym(diatonicChord(0, "major", 0, true))).toBe("Cmaj7");
  });
  it("diatonicChord(0, 'major', 6, true) is Bm7b5", () => {
    const c = diatonicChord(0, "major", 6, true);
    expect(c.rootName).toBe("B");
    expect(c.quality).toBe("m7♭5");
  });
  it("diatonicChord(9, 'minor', 0) is Am", () => {
    expect(sym(diatonicChord(9, "minor", 0))).toBe("Am");
  });
});

describe("replaceChord — color upgrades", () => {
  it("suggests maj7, 6, add9 etc for a major triad", () => {
    const subs = replaceChord(parseChord("C"), { tonic: 0, mode: "major" });
    const symbols = subs.map((s) => sym(s.chords[0]));
    expect(symbols).toContain("Cmaj7");
    expect(symbols).toContain("Cadd9");
    expect(symbols.some((x) => x.startsWith("C") && x.includes("sus"))).toBe(true);
  });
  it("suggests tritone sub for a dominant 7", () => {
    const subs = replaceChord(parseChord("G7"), { tonic: 0, mode: "major" });
    const trisub = subs.find((s) => s.tags.includes("tritone-sub"));
    expect(trisub).toBeTruthy();
    expect(sym(trisub.chords[0])).toBe("C#7");
  });
  it("suggests vi for I (relative-minor substitute in major)", () => {
    const subs = replaceChord(parseChord("C"), { tonic: 0, mode: "major" });
    const viSub = subs.find((s) => s.tags.includes("tonic-sub"));
    expect(viSub).toBeTruthy();
    expect(sym(viSub.chords[0])).toBe("Am7");
  });
  it("suggests iv (borrowed minor) for IV in major", () => {
    const subs = replaceChord(parseChord("F"), { tonic: 0, mode: "major" });
    const borrow = subs.find((s) => s.tags.includes("modal-interchange"));
    expect(borrow).toBeTruthy();
    expect(sym(borrow.chords[0])).toBe("Fm");
  });
});

describe("insertBeforeChord", () => {
  it("suggests V7 of the chord", () => {
    const before = insertBeforeChord(parseChord("F"));
    const sec = before.find((s) => s.tags.includes("secondary-dominant"));
    expect(sec).toBeTruthy();
    expect(sym(sec.chords[0])).toBe("C7");
  });
  it("suggests relative ii-V (two chords)", () => {
    const before = insertBeforeChord(parseChord("F"));
    const iiV = before.find((s) => s.tags.includes("ii-V"));
    expect(iiV).toBeTruthy();
    expect(iiV.chords).toHaveLength(2);
    expect(sym(iiV.chords[0])).toBe("Gm7");
    expect(sym(iiV.chords[1])).toBe("C7");
  });
  it("suggests tritone-sub V (chromatic approach)", () => {
    const before = insertBeforeChord(parseChord("C"));
    const tri = before.find((s) => s.tags.includes("tritone-sub"));
    expect(tri).toBeTruthy();
    // G7 tritone-sub → Db7 → C; with sharps-only naming Db is C#
    expect(sym(tri.chords[0])).toBe("C#7");
  });
});

describe("insertAfterChord", () => {
  it("suggests III7 → vi when chord is I major", () => {
    const after = insertAfterChord(parseChord("C"), { tonic: 0, mode: "major" });
    const sec = after.find((s) => s.tags.includes("secondary-dominant"));
    expect(sec).toBeTruthy();
    expect(sym(sec.chords[0])).toBe("E7");
  });
  it("suggests Picardy third when chord is i minor in minor key", () => {
    const after = insertAfterChord(parseChord("Am"), { tonic: 9, mode: "minor" });
    const pic = after.find((s) => s.tags.includes("picardy"));
    expect(pic).toBeTruthy();
    expect(sym(pic.chords[0])).toBe("Amaj7");
  });
});

describe("suggestProgressionEdits", () => {
  it("finds a passing dim7 between C and D", () => {
    const prog = [parseChord("C"), parseChord("D")];
    const moves = suggestProgressionEdits(prog);
    const dim = moves.find((m) => m.suggestion.tags.includes("dim-passing"));
    expect(dim).toBeTruthy();
    expect(sym(dim.suggestion.chords[0])).toBe("C#dim7");
  });
});

describe("suggestionsFor — public API", () => {
  it("returns replace / insertBefore / insertAfter buckets", () => {
    const out = suggestionsFor(parseChord("C"), { tonic: 0, mode: "major" });
    expect(out.replace.length).toBeGreaterThan(0);
    expect(out.insertBefore.length).toBeGreaterThan(0);
    expect(out.insertAfter.length).toBeGreaterThan(0);
  });
  it("respects maxPerKind", () => {
    const out = suggestionsFor(parseChord("C"), { maxPerKind: 2 });
    expect(out.replace.length).toBeLessThanOrEqual(2);
    expect(out.insertBefore.length).toBeLessThanOrEqual(2);
    expect(out.insertAfter.length).toBeLessThanOrEqual(2);
  });
  it("filters by style", () => {
    const out = suggestionsFor(parseChord("G7"), { style: "jazz", maxPerKind: 50 });
    // No jazz-only suggestion should bleed through with style: "pop"
    const popOut = suggestionsFor(parseChord("G7"), { style: "pop", maxPerKind: 50 });
    const jazzOnly = out.replace.filter((s) => s.style === "jazz").length;
    const popHasJazz = popOut.replace.filter((s) => s.style === "jazz").length;
    expect(popHasJazz).toBe(0);
    expect(jazzOnly).toBeGreaterThan(0);
  });
});

describe("KNOWN_STYLES sanity", () => {
  it("contains the obvious style names", () => {
    expect(KNOWN_STYLES).toEqual(
      expect.arrayContaining(["any", "pop", "jazz", "soul", "gospel"]),
    );
  });
});

describe("simplify", () => {
  it("reduces a complex chord to its triad", () => {
    const subs = simplify(parseChord("Cmaj7")).map((s) => chordSymbol(s.chords[0]));
    expect(subs).toContain("C");
  });
  it("reduces a dominant to a major triad", () => {
    const subs = simplify(parseChord("G13")).map((s) => chordSymbol(s.chords[0]));
    expect(subs).toContain("G");
  });
  it("offers a friendly minor stand-in for m7b5", () => {
    const subs = simplify(parseChord("Bm7b5")).map((s) => chordSymbol(s.chords[0]));
    expect(subs).toContain("Bm");
  });
  it("drops the slash bass", () => {
    const subs = simplify(parseChord("C/E")).map((s) => chordSymbol(s.chords[0]));
    expect(subs).toContain("C");
  });
  it("always offers a power chord", () => {
    const subs = simplify(parseChord("F#m7")).map((s) => chordSymbol(s.chords[0]));
    expect(subs.some((x) => x.endsWith("5"))).toBe(true);
  });
});
