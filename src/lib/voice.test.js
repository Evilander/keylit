import { describe, it, expect } from "vitest";
import { PERSONA, CONCEPTS, reaction, buildSuggestionChips } from "./voice.js";
import { buildChord, parseChord } from "./theory.js";

const REQUIRED_CONCEPT_KEYS = [
  "scale-formula",
  "why-one-sharp",
  "half-steps",
  "degrees",
  "diatonic-qualities",
  "function-tsd",
  "pedal",
  "nashville-roman",
];

describe("PERSONA", () => {
  it("is a non-empty string", () => {
    expect(typeof PERSONA).toBe("string");
    expect(PERSONA.trim().length).toBeGreaterThan(0);
  });
});

describe("CONCEPTS", () => {
  it("has every required key", () => {
    for (const k of REQUIRED_CONCEPT_KEYS) {
      expect(CONCEPTS).toHaveProperty(k);
    }
  });
  it("gives each concept a non-empty line and bridge", () => {
    for (const k of REQUIRED_CONCEPT_KEYS) {
      const c = CONCEPTS[k];
      expect(typeof c.line).toBe("string");
      expect(c.line.trim().length).toBeGreaterThan(0);
      expect(typeof c.bridge).toBe("string");
      expect(c.bridge.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("reaction", () => {
  it("is deterministic for a given seed", () => {
    expect(reaction(true, 2)).toBe(reaction(true, 2));
    expect(reaction(false, 3)).toBe(reaction(false, 3));
  });
  it("gives different lines for different seeds (variants exist)", () => {
    expect(reaction(true, 0)).not.toBe(reaction(true, 1));
  });
  it("returns distinct pools for correct vs incorrect", () => {
    expect(reaction(true, 0)).not.toBe(reaction(false, 0));
  });
  it("wraps the seed past the pool length and handles negatives", () => {
    expect(reaction(true, 0)).toBe(reaction(true, 5)); // 5 wraps to 0 (5 variants)
    expect(typeof reaction(true, -1)).toBe("string");
    expect(reaction(true, -1).length).toBeGreaterThan(0);
  });
  it("always returns a non-empty string", () => {
    expect(reaction(true).length).toBeGreaterThan(0);
    expect(reaction(false).length).toBeGreaterThan(0);
  });
});

describe("buildSuggestionChips", () => {
  const cMajor = { tonic: 0, mode: "major" };
  const aMinor = { tonic: 9, mode: "minor" };

  it("returns at most 4 chips", () => {
    expect(buildSuggestionChips({ key: cMajor }).length).toBeLessThanOrEqual(4);
    expect(buildSuggestionChips({ key: cMajor, chord: parseChord("F") }).length)
      .toBeLessThanOrEqual(4);
  });

  it("always includes a diatonic and a relative chip", () => {
    const intents = buildSuggestionChips({ key: cMajor }).map((c) => c.intent);
    expect(intents).toContain("diatonic");
    expect(intents).toContain("relative");
  });

  it("keeps diatonic and relative even when a chord fills a slot", () => {
    const intents = buildSuggestionChips({ key: cMajor, chord: parseChord("F") })
      .map((c) => c.intent);
    expect(intents).toContain("diatonic");
    expect(intents).toContain("relative");
  });

  it("labels the relative chip by mode", () => {
    const majRel = buildSuggestionChips({ key: cMajor }).find((c) => c.intent === "relative");
    const minRel = buildSuggestionChips({ key: aMinor }).find((c) => c.intent === "relative");
    expect(majRel.label).toMatch(/relative minor/i);
    expect(minRel.label).toMatch(/relative major/i);
  });

  it("names the key in the diatonic chip, spelled for the key", () => {
    const fMajor = buildSuggestionChips({ key: { tonic: 5, mode: "major" } })
      .find((c) => c.intent === "diatonic");
    expect(fMajor.label).toContain("F major");
  });

  it("includes a pedal chip only when a chord is present", () => {
    expect(buildSuggestionChips({ key: cMajor }).some((c) => c.intent === "pedal"))
      .toBe(false);
    const withChord = buildSuggestionChips({ key: cMajor, chord: buildChord(0, "") });
    expect(withChord.some((c) => c.intent === "pedal")).toBe(true);
  });

  it("names the chord in the pedal chip label", () => {
    const chip = buildSuggestionChips({ key: cMajor, chord: parseChord("G") })
      .find((c) => c.intent === "pedal");
    expect(chip.label).toContain("G");
  });

  it("uses only the fixed intent vocabulary", () => {
    const allowed = new Set(["diatonic", "relative", "degree-drill", "numbers", "pedal", "scale"]);
    for (const chip of buildSuggestionChips({ key: cMajor, chord: parseChord("F") })) {
      expect(allowed.has(chip.intent)).toBe(true);
    }
  });

  it("gives every chip a non-empty label and unique id", () => {
    const chips = buildSuggestionChips({ key: cMajor, chord: parseChord("F") });
    for (const chip of chips) {
      expect(typeof chip.label).toBe("string");
      expect(chip.label.trim().length).toBeGreaterThan(0);
    }
    const ids = chips.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to a default key when none is given", () => {
    const chips = buildSuggestionChips();
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.some((c) => c.intent === "diatonic")).toBe(true);
  });
});
