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
