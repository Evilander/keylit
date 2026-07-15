import { describe, it, expect } from "vitest";
import { parseSheet, parseChord } from "./theory.js";
import { chordTension, tensionCurve, sectionTension, tensionDiagnosis } from "./tension.js";

const KEY_C = { tonic: 0, mode: "major" };
const t = (sym) => chordTension(parseChord(sym), KEY_C);

describe("chordTension — the model orders things the ear orders", () => {
  it("rest < motion < pull < chromatic", () => {
    expect(t("C")).toBeLessThan(t("F"));
    expect(t("F")).toBeLessThan(t("G"));
    expect(t("G")).toBeLessThan(t("Ab"));
  });
  it("a seventh raises its own chord", () => {
    expect(t("G7")).toBeGreaterThan(t("G"));
    expect(t("Cmaj7")).toBeGreaterThan(t("C"));
  });
  it("diminished out-tenses a plain dominant triad", () => {
    expect(t("Bdim")).toBeGreaterThan(t("G"));
  });
  it("an inversion is less settled than root position", () => {
    expect(t("C/E")).toBeGreaterThan(t("C"));
  });
  it("stays inside [0,1]", () => {
    for (const s of ["C", "G7", "Bdim7", "Abmaj7", "F#7", "Caug"]) {
      const v = t(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("tensionCurve — markers land where expectation bends", () => {
  it("a V after quiet Is reads as surprise; the landing reads as release", () => {
    const { progression } = parseSheet("[Verse]\nC Am C G7 C");
    const { points, markers } = tensionCurve(progression, KEY_C);
    expect(points).toHaveLength(5);
    expect(markers.some((m) => m.kind === "surprise" && points[m.i].fn === "D")).toBe(true);
    expect(markers.some((m) => m.kind === "release" && points[m.i].fn === "T")).toBe(true);
  });
});

describe("sectionTension + diagnosis — sentences, not furniture", () => {
  it("hears a chorus that doesn't lift", () => {
    const { progression } = parseSheet("[Verse]\nC F C F\n[Chorus]\nC F C F");
    const advice = tensionDiagnosis(progression, KEY_C);
    expect(advice.join(" ")).toMatch(/chorus doesn't sit above the verse/i);
  });
  it("credits a chorus that does lift", () => {
    const { progression } = parseSheet("[Verse]\nC Am C Am\n[Chorus]\nF G7 F G7");
    const advice = tensionDiagnosis(progression, KEY_C);
    expect(advice.join(" ")).toMatch(/genuinely lifts/i);
  });
  it("flags a song with no dominant at all", () => {
    const { progression } = parseSheet("[Verse]\nC F Am F");
    const advice = tensionDiagnosis(progression, KEY_C);
    expect(advice.join(" ")).toMatch(/no pull chord/i);
  });
  it("notices an unresolved ending", () => {
    const { progression } = parseSheet("[Verse]\nC F G");
    const advice = tensionDiagnosis(progression, KEY_C);
    expect(advice.join(" ")).toMatch(/ends away from home/i);
  });
  it("section means come back in chart order", () => {
    const { progression } = parseSheet("[Intro]\nC\n[Verse]\nF G\n[Chorus]\nAm");
    const { points } = tensionCurve(progression, KEY_C);
    expect(sectionTension(points).map((s) => s.section)).toEqual(["Intro", "Verse", "Chorus"]);
  });
});
