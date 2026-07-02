import { describe, it, expect } from "vitest";
import { parseChord, buildChord } from "./theory.js";
import { keyPrefersFlats, spellPc, spellDegreePc, spellChord, respell, FLAT_NAMES } from "./spelling.js";

describe("keyPrefersFlats", () => {
  it("flat keys use flats", () => {
    expect(keyPrefersFlats(5, "major")).toBe(true);  // F major
    expect(keyPrefersFlats(10, "major")).toBe(true); // Bb major
    expect(keyPrefersFlats(3, "major")).toBe(true);  // Eb major
  });
  it("sharp keys and C use sharps", () => {
    expect(keyPrefersFlats(0, "major")).toBe(false); // C major
    expect(keyPrefersFlats(7, "major")).toBe(false); // G major
    expect(keyPrefersFlats(4, "major")).toBe(false); // E major
  });
  it("minor keys borrow the relative major's signature", () => {
    expect(keyPrefersFlats(2, "minor")).toBe(true);  // Dm -> rel F major -> flats
    expect(keyPrefersFlats(9, "minor")).toBe(false); // Am -> rel C major -> sharps
    expect(keyPrefersFlats(7, "minor")).toBe(true);  // Gm -> rel Bb major -> flats
  });
});

describe("spellPc", () => {
  it("spells pc 10 as Bb in F major, A# in E major", () => {
    expect(spellPc(10, { tonic: 5, mode: "major" })).toBe("Bb");
    expect(spellPc(10, { tonic: 4, mode: "major" })).toBe("A#");
  });
  it("spells pc 3 as Eb in Bb major", () => {
    expect(spellPc(3, { tonic: 10, mode: "major" })).toBe("Eb");
  });
  it("defaults to sharps with no key context", () => {
    expect(spellPc(6, null)).toBe("F#");
  });
});

describe("spellChord", () => {
  it("spells a chord for a flat key", () => {
    const bb = buildChord(10, "");      // pc 10 major
    expect(spellChord(bb, { tonic: 5, mode: "major" })).toBe("Bb");
  });
  it("spells slash chords for the key", () => {
    const c = parseChord("C/E");        // E bass
    expect(spellChord(c, { tonic: 5, mode: "major" })).toBe("C/E");
    const ab = buildChord(8, "maj7", 3); // pc8 maj7 over pc3 bass, flat key
    expect(spellChord(ab, { tonic: 3, mode: "major" })).toBe("Abmaj7/Eb");
  });
});

describe("respell", () => {
  it("rewrites rootName/bassName/raw for the key without changing pitch", () => {
    const cap = buildChord(8, "");      // Ab/G# pc 8
    const r = respell(cap, { tonic: 3, mode: "major" }); // Eb major -> flats
    expect(r.rootName).toBe("Ab");
    expect(r.raw).toBe("Ab");
    expect(r.rootSemitone).toBe(8);     // pitch unchanged
  });
  it("is a no-op on pitch classes with natural names", () => {
    const c = buildChord(0, "m7");
    const r = respell(c, { tonic: 5, mode: "major" });
    expect(r.rootName).toBe("C");
    expect(r.raw).toBe("Cm7");
  });
});

describe("spellDegreePc — flat degrees always spell flat", () => {
  const C = { tonic: 0, mode: "major" };
  const G = { tonic: 7, mode: "major" };
  it("spells the borrowed flat degrees of C major with flats", () => {
    expect(spellDegreePc(3, C)).toBe("Eb");   // ♭3
    expect(spellDegreePc(10, C)).toBe("Bb");  // ♭7
    expect(spellDegreePc(8, C)).toBe("Ab");   // ♭6
    expect(spellDegreePc(1, C)).toBe("Db");   // ♭2
  });
  it("keeps diatonic sharps in sharp keys", () => {
    expect(spellDegreePc(6, G)).toBe("F#");   // leading tone of G
    expect(spellDegreePc(1, { tonic: 4, mode: "major" })).toBe("C#"); // 6th of E
  });
  it("flows through respell for chords", () => {
    expect(respell(parseChord("D#"), C).raw).toBe("Eb");
    expect(respell(parseChord("A#"), C).raw).toBe("Bb");
    expect(respell(parseChord("F#m"), G).raw).toBe("F#m"); // diatonic vii stays sharp
  });
});
