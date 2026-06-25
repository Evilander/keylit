import { describe, it, expect } from "vitest";
import { chordSymbol } from "./theory.js";
import { TEMPLATES, realizeTemplate, generateProgression, GEN_STYLES } from "./generate.js";

const syms = (chords) => chords.map(chordSymbol);

describe("realizeTemplate", () => {
  it("realises I–V–vi–IV in C major as C G Am F", () => {
    const t = TEMPLATES.pop[0];
    expect(syms(realizeTemplate(t, 0, "major"))).toEqual(["C", "G", "Am", "F"]);
  });
  it("realises I–V–vi–IV in G major as G D Em C", () => {
    const t = TEMPLATES.pop[0];
    expect(syms(realizeTemplate(t, 7, "major"))).toEqual(["G", "D", "Em", "C"]);
  });
  it("realises a jazz ii–V–I with sevenths in C: Dm7 G7 Cmaj7 A7", () => {
    const t = TEMPLATES.jazz[0]; // ii–V–I–VI turnaround
    expect(syms(realizeTemplate(t, 0, "major"))).toEqual(["Dm7", "G7", "Cmaj7", "A7"]);
  });
  it("honors a major-V override in a minor key (i–VII–VI–V → V is major)", () => {
    const t = TEMPLATES.cinematic[1]; // i–VII–VI–V with V major
    const out = realizeTemplate(t, 9, "minor"); // A minor
    expect(chordSymbol(out[out.length - 1])).toBe("E"); // major V, not Em
  });
  it("gives the jazz turnaround a functional dominant V in a minor key", () => {
    const out = realizeTemplate(TEMPLATES.jazz[0], 9, "minor"); // A minor ii–V–i–VI
    expect(chordSymbol(out[1])).toBe("E7"); // dominant V7 with the leading tone, not Em7
    expect(out[0].quality).toBe("m7♭5");    // iiø7
  });
  it("keeps the jazz turnaround unchanged in a major key", () => {
    expect(syms(realizeTemplate(TEMPLATES.jazz[0], 0, "major"))).toEqual(["Dm7", "G7", "Cmaj7", "A7"]);
  });
});

describe("generateProgression", () => {
  it("is deterministic when given a pick index", () => {
    const a = generateProgression({ tonic: 0, mode: "major", style: "pop", pick: 0 });
    const b = generateProgression({ tonic: 0, mode: "major", style: "pop", pick: 0 });
    expect(syms(a.chords)).toEqual(syms(b.chords));
    expect(syms(a.chords)).toEqual(["C", "G", "Am", "F"]);
  });
  it("returns chords for every style without throwing", () => {
    for (const style of GEN_STYLES) {
      const { chords } = generateProgression({ tonic: 2, mode: style === "cinematic" ? "minor" : "major", style, pick: 0 });
      expect(chords.length).toBeGreaterThan(2);
      for (const ch of chords) expect(typeof ch.rootSemitone).toBe("number");
    }
  });
});
