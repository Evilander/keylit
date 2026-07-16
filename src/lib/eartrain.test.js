import { describe, it, expect } from "vitest";
import { parseSheet, detectKey } from "./theory.js";
import { mkQuestion, levelFor, LEVELS, FALLBACK } from "./eartrain.js";

const { progression } = parseSheet("[Verse]\nC Am F G C\n[Chorus]\nF G C F C");
const k = detectKey(progression);
const key = { tonic: k.tonic, mode: k.mode };
const seeded = (seq) => { let i = 0; return () => seq[i++ % seq.length]; };

describe("mkQuestion — drills built from the actual song", () => {
  for (const level of [1, 2, 3, 4]) {
    it(`level ${level}: exactly one correct option, real chords to play`, () => {
      const q = mkQuestion(seeded([0.1, 0.5, 0.9, 0.3, 0.7]), { progression, key, level });
      expect(q, `level ${level}`).not.toBeNull();
      expect(q.play.length).toBeGreaterThan(0);
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.explain.length).toBeGreaterThan(10);
      for (const ch of q.play) expect(ch.intervals?.length).toBeGreaterThan(1);
    });
  }

  it("is deterministic under a seeded rand", () => {
    const a = mkQuestion(seeded([0.2, 0.4, 0.6]), { progression, key, level: 3 });
    const b = mkQuestion(seeded([0.2, 0.4, 0.6]), { progression, key, level: 3 });
    expect(a.options.map((o) => o.label)).toEqual(b.options.map((o) => o.label));
  });

  it("degrades to null on unsupportable input, never throws", () => {
    expect(mkQuestion(seeded([0.5]), { progression: [], key, level: 1 })).toBeNull();
    const oneChord = parseSheet("C C C").progression;
    expect(mkQuestion(seeded([0.5]), { progression: oneChord, key, level: 3 })).toBeNull();
  });

  it("cadence questions only offer landings the song actually makes", () => {
    const q = mkQuestion(seeded([0.05, 0.5]), { progression, key, level: 4 });
    expect(q).not.toBeNull();
    expect(q.play).toHaveLength(2);
  });

  it("bright-or-dark never asks about a chord with no third", () => {
    // sus/power chords have nothing bright or dark about the third — the old
    // question forced them into "major" and claimed "the third sits high"
    const susOnly = parseSheet("Csus4 Gsus4 C5 Dsus2").progression;
    expect(mkQuestion(seeded([0.1, 0.6]), { progression: susOnly, key, level: 1 })).toBeNull();
    // mixed progressions only draw from the chords that HAVE a third
    const mixed = parseSheet("Csus4 Am Gsus4 F").progression;
    for (const r of [0.01, 0.3, 0.6, 0.99]) {
      const q = mkQuestion(seeded([r, 0.5]), { progression: mixed, key, level: 1 });
      expect(q).not.toBeNull();
      expect(["Am", "F"]).toContain(q.play[0].raw);
    }
  });

  it("a ii → I landing is its OWN side door, never mislabeled 4 → 1", () => {
    // Dm → C in C major: subdominant function landing home from degree 2
    const p = parseSheet("C Dm C").progression;
    const q = mkQuestion(seeded([0.1, 0.5]), { progression: p, key: { tonic: 0, mode: "major" }, level: 4 });
    expect(q).not.toBeNull();
    const correct = q.options.find((o) => o.correct);
    expect(correct.label).toContain("2 → 1");
    expect(correct.label).not.toContain("4 → 1");
  });
});

describe("levels", () => {
  it("gate by best streak", () => {
    expect(levelFor(0).id).toBe(1);
    expect(levelFor(5).id).toBe(2);
    expect(levelFor(20).id).toBe(4);
    expect(LEVELS).toHaveLength(4);
  });
  it("the fallback palette parses", () => {
    expect(parseSheet(FALLBACK.sheet).progression.length).toBeGreaterThan(2);
  });
});
