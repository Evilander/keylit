import { describe, expect, it } from "vitest";
import { createDraft } from "./composition.js";
import {
  contrastEvidence,
  mergeDeepIdeas,
  paletteForKey,
  scoreCandidate,
  suggestForIntent,
  validateSuggestionEvidence,
  verifyExternalIdea,
} from "./composerSuggestions.js";
import { parseChord } from "./theory.js";

const makeDraft = (tonic, mode, symbols) => createDraft({
  id: "d",
  name: "D",
  key: { tonic, mode },
  sections: [{
    id: "s",
    name: "Verse",
    chords: symbols.map((symbol, i) => ({ id: `c${i}`, symbol })),
  }],
});

const canonicalWhy = (symbols, evidence) => {
  const iiV = evidence.find((flag) => flag.startsWith("ii-V:"));
  if (iiV) {
    return `${symbols.join("–")} pulls into ${iiV.slice(5)} through its verified ii–V; ranking also checks voice leading and bass motion.`;
  }
  const dominant = evidence.find((flag) => flag.startsWith("secondary-dominant:"));
  if (dominant) {
    return `${symbols.join("–")} contains the verified applied dominant of ${dominant.slice(19)}; ranking also checks voice leading and bass motion.`;
  }
  const passing = evidence.find((flag) => flag.startsWith("passing-diminished:"));
  if (passing) {
    const [, left, right] = passing.split(":");
    return `${symbols.join("–")} is the verified diminished passing step from ${left} to ${right}, ranked with measured voice leading.`;
  }
  const borrowing = evidence.find((flag) => flag.startsWith("modal-borrowing:"));
  if (borrowing) {
    return `${symbols.join("–")} is verified vocabulary from the parallel ${borrowing.slice(16)}, ranked with measured voice leading and bass motion.`;
  }
  const contrasts = evidence
    .filter((flag) => flag.startsWith("contrast:"))
    .map((flag) => flag.slice(9));
  if (contrasts.length) {
    return `${symbols.join("–")} changes the section through verified ${contrasts.join(" and ")} contrast, with deterministic motion scoring.`;
  }
  const fn = evidence.find((flag) => flag.startsWith("function:"));
  return `${symbols.join("–")} follows the verified ${fn ? fn.slice(9) : "?"} function path, ranked by measured cadence, voice leading, and bass motion.`;
};

describe("context-aware offline composer suggestions", () => {
  for (const mode of ["major", "minor"]) {
    for (let tonic = 0; tonic < 12; tonic++) {
      it(`returns only parseable evidenced ideas in ${tonic} ${mode}`, () => {
        const draft = makeDraft(
          tonic,
          mode,
          paletteForKey({ tonic, mode }).slice(0, 3).map((x) => x.symbol),
        );
        for (const intent of ["next", "lead-in", "between", "turnaround", "contrast"]) {
          const out = suggestForIntent({
            intent,
            draft,
            sectionId: "s",
            chordId: "c1",
            gapIndex: 1,
          });
          expect(out.length).toBeGreaterThan(0);
          for (const item of out) {
            expect(item.symbols.every((symbol) => parseChord(symbol))).toBe(true);
            expect(item.why.length).toBeGreaterThan(12);
            expect(item.evidence.length).toBeGreaterThan(0);
            expect(validateSuggestionEvidence(item, {
              draft,
              sectionId: "s",
              chordId: "c1",
              gapIndex: 1,
            }).ok).toBe(true);
            if (intent === "lead-in" || intent === "turnaround") {
              expect(item.evidence.some((flag) => flag.startsWith("target:"))).toBe(true);
            }
            if (intent === "contrast") {
              const source = draft.sections[0].chords.map((slot) => parseChord(slot.symbol));
              expect(contrastEvidence(source, item.chords, draft.key).groups.length)
                .toBeGreaterThanOrEqual(2);
            }
          }
        }
      });
    }
  }

  it("lead-in and turnaround evidence names the real destination", () => {
    const draft = makeDraft(0, "major", ["C", "F", "G7", "C"]);
    const lead = suggestForIntent({ intent: "lead-in", draft, sectionId: "s", chordId: "c3" });
    expect(lead.some((x) => x.symbols.join(" ") === "Dm7 G7" || x.symbols.includes("G7")))
      .toBe(true);
    expect(lead.every((x) => x.evidence.some((e) => e.startsWith("target:")))).toBe(true);
  });

  it("contrast requires two independent groups and rejects copies/rotations/reversals", () => {
    const key = { tonic: 0, mode: "major" };
    const source = ["C", "G", "Am", "F"].map(parseChord);
    expect(contrastEvidence(source, ["G", "Am", "F", "C"].map(parseChord), key).rejectedReason)
      .toBe("rotation");
    const contrast = contrastEvidence(source, ["Am", "Dm", "F", "E7"].map(parseChord), key);
    expect(contrast.groups.length).toBeGreaterThanOrEqual(2);
  });

  it("does not count a length change as opening contrast by itself", () => {
    const key = { tonic: 0, mode: "major" };
    const source = ["C", "G", "Am"].map(parseChord);
    const seed = ["C", "F", "G", "Am"].map(parseChord);
    expect(contrastEvidence(source, seed, key).groups).not.toContain("opening");
  });

  it("validates the defining predicates behind every named harmonic explanation", () => {
    const draft = makeDraft(0, "major", ["C", "F", "G7", "C"]);
    const all = ["next", "lead-in", "between", "turnaround", "contrast"]
      .flatMap((intent) => suggestForIntent({
        intent,
        draft,
        sectionId: "s",
        chordId: "c2",
        gapIndex: 2,
      }));
    const named = all.filter((item) => item.evidence.some(
      (flag) => /^(secondary-dominant|ii-V|modal-borrowing|passing-diminished|function:)/.test(flag),
    ));
    expect(named.length).toBeGreaterThan(0);
    for (const item of named) {
      expect(validateSuggestionEvidence(item, {
        draft,
        sectionId: "s",
        chordId: "c2",
        gapIndex: 2,
      }).ok).toBe(true);
    }
  });

  it("accepts true and rejects false named-family evidence", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c3",
      gapIndex: 3,
    };
    const trueCases = [
      {
        symbols: ["A7", "Dm"],
        chords: ["A7", "Dm"].map(parseChord),
        evidence: ["secondary-dominant:Dm", "target:Dm"],
      },
      {
        symbols: ["Dm7", "G7", "C"],
        chords: ["Dm7", "G7", "C"].map(parseChord),
        evidence: ["ii-V:C", "target:C"],
      },
      {
        symbols: ["Fm"],
        chords: [parseChord("Fm")],
        evidence: ["modal-borrowing:minor"],
      },
      {
        symbols: ["C#dim"],
        chords: [parseChord("C#dim")],
        evidence: ["passing-diminished:C:Dm"],
      },
    ];
    trueCases.forEach((item) => expect(validateSuggestionEvidence({
      ...item,
      why: canonicalWhy(item.symbols, item.evidence),
    }, context).ok).toBe(true));
    const falseDominant = {
      symbols: ["F7", "Dm"],
      chords: ["F7", "Dm"].map(parseChord),
      evidence: ["secondary-dominant:Dm", "target:Dm"],
      why: canonicalWhy(["F7", "Dm"], ["secondary-dominant:Dm", "target:Dm"]),
    };
    expect(validateSuggestionEvidence(falseDominant, context).ok).toBe(false);
  });

  it("validates standalone function evidence from the supplied chord path", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c3",
    };
    const item = {
      symbols: ["Dm7", "G7", "C"],
      chords: ["Dm7", "G7", "C"].map(parseChord),
      evidence: ["function:S>D>T"],
      why: canonicalWhy(["Dm7", "G7", "C"], ["function:S>D>T"]),
    };
    expect(validateSuggestionEvidence(item, context).ok).toBe(true);
  });

  it("rejects a target flag that names a non-destination chord", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c3",
    };
    const item = {
      symbols: ["Dm", "C"],
      chords: ["Dm", "C"].map(parseChord),
      evidence: ["target:Dm"],
      why: canonicalWhy(["Dm", "C"], ["target:Dm"]),
    };
    expect(validateSuggestionEvidence(item, context).ok).toBe(false);
  });

  it("includes cadence, voice-leading, and bass-motion terms in deterministic ranking", () => {
    const key = { tonic: 0, mode: "major" };
    const target = parseChord("C");
    const strong = scoreCandidate({
      contextChords: [parseChord("C"), parseChord("Dm7")],
      candidatePath: [parseChord("G7"), target],
      target,
      key,
    });
    const weak = scoreCandidate({
      contextChords: [parseChord("C"), parseChord("Dm7")],
      candidatePath: [parseChord("F#7"), target],
      target,
      key,
    });
    expect(strong.terms.cadence).toBeGreaterThan(0);
    expect(strong.terms.voiceLeading).toBeLessThanOrEqual(0);
    expect(strong.terms.bassMotion).toBeLessThanOrEqual(0);
    expect(strong.score).toBeCloseTo(
      Object.values(strong.terms).reduce((sum, value) => sum + value, 0),
      8,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.evidence).toEqual(expect.arrayContaining([
      expect.stringMatching(/^cadence:/),
      expect.stringMatching(/^voice-leading:/),
      expect.stringMatching(/^bass-motion:/),
    ]));
  });

  it("builds independent major and minor palettes in every key", () => {
    const expected = {
      major: {
        roots: [0, 2, 4, 5, 7, 9, 11],
        triads: ["maj", "min", "min", "maj", "maj", "min", "dim"],
        sevenths: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7♭5"],
      },
      minor: {
        roots: [0, 2, 3, 5, 7, 8, 10],
        triads: ["min", "dim", "maj", "min", "min", "maj", "maj"],
        sevenths: ["m7", "m7♭5", "maj7", "m7", "m7", "maj7", "7"],
      },
    };
    for (const mode of ["major", "minor"]) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const triads = paletteForKey({ tonic, mode });
        const sevenths = paletteForKey({ tonic, mode }, { sevenths: true });
        expect(triads.map((item) => item.chord.rootSemitone))
          .toEqual(expected[mode].roots.map((offset) => (tonic + offset) % 12));
        expect(triads.map((item) => item.chord.quality)).toEqual(expected[mode].triads);
        expect(sevenths.map((item) => item.chord.quality)).toEqual(expected[mode].sevenths);
        expect([...triads, ...sevenths].every((item) => parseChord(item.symbol))).toBe(true);
      }
    }
  });

  it("normalizes tonic only from finite numeric values", () => {
    const cMajorRoots = [0, 2, 4, 5, 7, 9, 11];
    for (const tonic of [NaN, Infinity, -Infinity, "7", "nope", {}, null, undefined]) {
      const palette = paletteForKey({ tonic, mode: "major" });
      expect(palette.map((item) => item.chord.rootSemitone)).toEqual(cMajorRoots);
      expect(palette.every((item) => typeof item.symbol === "string" && parseChord(item.symbol)))
        .toBe(true);
    }
    expect(paletteForKey({ tonic: 2.5, mode: "major" })[0].chord.rootSemitone).toBe(2);
    expect(paletteForKey({ tonic: -1, mode: "major" })[0].chord.rootSemitone).toBe(11);
  });

  it("addresses raw gaps without collapsing invalid slots", () => {
    const draft = makeDraft(0, "major", ["C", "not-a-chord", "G"]);
    const atStart = suggestForIntent({ intent: "between", draft, sectionId: "s", gapIndex: 0 });
    expect(atStart.some((item) => item.evidence.includes("secondary-dominant:C"))).toBe(true);
    expect(atStart.every((item) => item.evidence.includes("voice-leading:0")
      && item.evidence.includes("bass-motion:0"))).toBe(true);

    const afterInvalid = suggestForIntent({ intent: "between", draft, sectionId: "s", gapIndex: 2 });
    expect(afterInvalid.some((item) => item.evidence.includes("secondary-dominant:G"))).toBe(true);
    expect(afterInvalid.every((item) => item.evidence.includes("voice-leading:0")
      && item.evidence.includes("bass-motion:0"))).toBe(true);

    expect(suggestForIntent({ intent: "between", draft, sectionId: "s", gapIndex: 3 }))
      .toEqual([]);
    expect(suggestForIntent({ intent: "next", draft, sectionId: "s", chordId: "c2", gapIndex: 3 }).length)
      .toBeGreaterThan(0);
  });

  it("rejects malformed section, slot, and raw-gap context", () => {
    const draft = makeDraft(0, "major", ["C", "not-a-chord", "G"]);
    const invalidContexts = [
      { sectionId: "missing", chordId: "c0" },
      { sectionId: "s", chordId: "missing" },
      { sectionId: "s", chordId: "c1" },
      { sectionId: "s", chordId: "c0", gapIndex: -1 },
      { sectionId: "s", chordId: "c0", gapIndex: 4 },
      { sectionId: "s", chordId: "c0", gapIndex: 1.5 },
    ];
    for (const invalid of invalidContexts) {
      for (const intent of ["next", "lead-in", "between", "turnaround", "contrast"]) {
        expect(suggestForIntent({ intent, draft, ...invalid })).toEqual([]);
      }
    }
  });

  it("fails closed for structurally malformed drafts and suggestions", () => {
    const malformedDrafts = [
      null,
      {},
      { key: { tonic: 0, mode: "major" }, sections: {} },
      { key: { tonic: 0, mode: "major" }, sections: [{ id: "s", chords: {} }] },
    ];
    for (const draft of malformedDrafts) {
      expect(() => suggestForIntent({ intent: "next", draft, sectionId: "s", chordId: "c0" }))
        .not.toThrow();
      expect(suggestForIntent({ intent: "next", draft, sectionId: "s", chordId: "c0" }))
        .toEqual([]);
    }
    const context = { draft: makeDraft(0, "major", ["C"]), sectionId: "s", chordId: "c0" };
    expect(validateSuggestionEvidence(null, context).ok).toBe(false);
    expect(validateSuggestionEvidence({ symbols: null, evidence: null }, context).ok).toBe(false);
    expect(() => suggestForIntent(null)).not.toThrow();
    expect(suggestForIntent(null)).toEqual([]);
    expect(contrastEvidence(null, null, { tonic: 0, mode: "major" }).rejectedReason)
      .toBe("no-source");
    expect(Number.isFinite(scoreCandidate({
      contextChords: null,
      candidatePath: null,
      key: { tonic: Infinity, mode: "major" },
    }).score)).toBe(true);
  });

  it("does not invent missing lead-in or turnaround destinations", () => {
    const empty = makeDraft(0, "major", []);
    expect(suggestForIntent({ intent: "lead-in", draft: empty, sectionId: "s", gapIndex: 0 }))
      .toEqual([]);
    expect(suggestForIntent({ intent: "turnaround", draft: empty, sectionId: "s", gapIndex: 0 }))
      .toEqual([]);
    expect(suggestForIntent({ intent: "contrast", draft: empty, sectionId: "s", gapIndex: 0 }))
      .toEqual([]);

    const invalidEnd = makeDraft(0, "major", ["C", "not-a-chord"]);
    expect(suggestForIntent({ intent: "lead-in", draft: invalidEnd, sectionId: "s", gapIndex: 1 }))
      .toEqual([]);
    expect(suggestForIntent({ intent: "lead-in", draft: invalidEnd, sectionId: "s", gapIndex: 2 }))
      .toEqual([]);
    const invalidOpening = makeDraft(0, "major", ["not-a-chord", "G"]);
    expect(suggestForIntent({ intent: "turnaround", draft: invalidOpening, sectionId: "s", chordId: "c1" }))
      .toEqual([]);
  });

  it("recognizes functional chord families through slash-bass inversions", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c3",
      gapIndex: 3,
    };
    const fixtures = [
      {
        symbols: ["Dm/F", "G7", "C"],
        evidence: ["ii-V:C", "target:C"],
      },
      {
        symbols: ["Fm/Ab"],
        evidence: ["modal-borrowing:minor"],
      },
      {
        symbols: ["A7/C#", "Dm"],
        evidence: ["secondary-dominant:Dm", "target:Dm"],
      },
    ];
    for (const fixture of fixtures) {
      expect(validateSuggestionEvidence({
        ...fixture,
        chords: fixture.symbols.map(parseChord),
        why: canonicalWhy(fixture.symbols, fixture.evidence),
      }, context).ok).toBe(true);
    }
  });

  it("keeps contrast identity and bass motion inversion-sensitive", () => {
    const key = { tonic: 0, mode: "major" };
    const first = scoreCandidate({
      contextChords: [parseChord("C/E")],
      candidatePath: [parseChord("G/B")],
      key,
    });
    const second = scoreCandidate({
      contextChords: [parseChord("C/E")],
      candidatePath: [parseChord("G/D")],
      key,
    });
    expect(first.terms.bassMotion).toBeCloseTo(-0.3, 8);
    expect(second.terms.bassMotion).toBeCloseTo(-0.12, 8);
    expect(first.terms.bassMotion).not.toBe(second.terms.bassMotion);

    const contrast = contrastEvidence(
      [parseChord("C/E"), parseChord("G")],
      [parseChord("C/G"), parseChord("G")],
      key,
    );
    expect(contrast.rejectedReason).not.toBe("identity");
    expect(contrast.jaccard).toBeCloseTo(1 / 3, 8);
  });

  it("uses symbols as canonical validation truth", () => {
    const context = { draft: makeDraft(0, "major", ["C"]), sectionId: "s", chordId: "c0" };
    expect(validateSuggestionEvidence({
      chords: [parseChord("C")],
      evidence: ["function:T"],
      why: "invalid",
    }, context).ok).toBe(false);
    expect(validateSuggestionEvidence({
      symbols: ["C"],
      evidence: ["function:T"],
      why: canonicalWhy(["C"], ["function:T"]),
    }, context).ok).toBe(true);
    expect(validateSuggestionEvidence({
      symbols: ["C/E"],
      chords: [parseChord("C/G")],
      evidence: ["function:T"],
      why: canonicalWhy(["C/E"], ["function:T"]),
    }, context).ok).toBe(false);
    expect(validateSuggestionEvidence({
      symbols: ["A7", "Dm"],
      chords: [
        { ...parseChord("A7"), intervals: [0] },
        parseChord("Dm"),
      ],
      evidence: ["secondary-dominant:Dm", "target:Dm"],
      why: canonicalWhy(["A7", "Dm"], ["secondary-dominant:Dm", "target:Dm"]),
    }, context).ok).toBe(false);
  });

  it("rejects non-finite scores and contradictory full-suggestion prose", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c2",
      gapIndex: 2,
    };
    for (const score of [Infinity, -Infinity, NaN]) {
      expect(validateSuggestionEvidence({
        symbols: ["C"],
        evidence: ["function:T"],
        why: canonicalWhy(["C"], ["function:T"]),
        score,
      }, context).ok).toBe(false);
    }
    const generated = suggestForIntent({ intent: "next", ...context })[0];
    expect(validateSuggestionEvidence({
      ...generated,
      why: "This prose claims a tritone substitution that the evidence never proves.",
    }, context).ok).toBe(false);
  });

  it("rejects false named-family evidence independently", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c3",
      gapIndex: 3,
    };
    const falseCases = [
      { symbols: ["F7", "Dm"], evidence: ["secondary-dominant:Dm", "target:Dm"] },
      { symbols: ["Em7", "G7", "C"], evidence: ["ii-V:C", "target:C"] },
      { symbols: ["F"], evidence: ["modal-borrowing:minor"] },
      { symbols: ["D#dim"], evidence: ["passing-diminished:C:Dm"] },
      { symbols: ["Dm7", "G7", "C"], evidence: ["function:T>D>T"] },
      { symbols: ["Dm", "C"], evidence: ["target:Dm"] },
    ];
    for (const fixture of falseCases) {
      expect(validateSuggestionEvidence({
        ...fixture,
        chords: fixture.symbols.map(parseChord),
        why: canonicalWhy(fixture.symbols, fixture.evidence),
      }, context).ok).toBe(false);
    }

    const contrastDraft = makeDraft(0, "major", ["C", "G", "Am", "F"]);
    expect(validateSuggestionEvidence({
      intent: "contrast",
      symbols: ["C", "G", "Am", "F"],
      chords: ["C", "G", "Am", "F"].map(parseChord),
      evidence: ["contrast:opening"],
      why: canonicalWhy(["C", "G", "Am", "F"], ["contrast:opening"]),
    }, { draft: contrastDraft, sectionId: "s" }).ok).toBe(false);
  });

  it("rejects false machine-readable metric evidence", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c2",
      gapIndex: 2,
    };
    const generated = suggestForIntent({ intent: "next", ...context })[0];
    for (const family of ["cadence", "voice-leading", "bass-motion"]) {
      const evidence = generated.evidence.map((flag) =>
        flag.startsWith(`${family}:`) ? `${family}:999` : flag);
      expect(validateSuggestionEvidence({ ...generated, evidence }, context).ok).toBe(false);
    }
  });

  it("rejects empty contrast inputs and empty-draft contrast generation", () => {
    const key = { tonic: 0, mode: "major" };
    expect(contrastEvidence([], [parseChord("C")], key)).toMatchObject({
      groups: [],
      rejectedReason: "no-source",
    });
    expect(contrastEvidence([parseChord("C")], [], key)).toMatchObject({
      groups: [],
      rejectedReason: "no-seed",
    });
    expect(contrastEvidence([], [], key).groups).toEqual([]);
    const empty = makeDraft(0, "major", []);
    expect(suggestForIntent({ intent: "contrast", draft: empty, sectionId: "s" })).toEqual([]);
  });

  it("shares contextual path construction for an existing ii and suggested V", () => {
    const draft = makeDraft(0, "major", ["Dm7", "C"]);
    const context = { draft, sectionId: "s", gapIndex: 1 };
    const suggestions = suggestForIntent({ intent: "between", ...context });
    const dominant = suggestions.find((item) => item.symbols.join(" ") === "G7");
    expect(dominant).toBeTruthy();
    expect(dominant.symbols).toEqual(["G7"]);
    expect(dominant.evidence).toContain("ii-V:C");
    expect(validateSuggestionEvidence(dominant, context).ok).toBe(true);
  });

  it("applies the exact score weights and equalizes unequal voice counts", () => {
    const key = { tonic: 0, mode: "major" };
    const weighted = scoreCandidate({
      contextChords: [parseChord("C")],
      candidatePath: [parseChord("G")],
      key,
    });
    const voiceCost = Number(weighted.evidence.find((flag) => flag.startsWith("voice-leading:")).split(":")[1]);
    expect(weighted.terms.functionMotion).toBe(1.5);
    expect(weighted.terms.commonTones).toBeCloseTo(0.35, 8);
    expect(weighted.terms.cadence).toBe(0);
    expect(weighted.terms.voiceLeading).toBeCloseTo(-voiceCost * 0.08, 8);
    expect(weighted.terms.bassMotion).toBeCloseTo(-5 * 0.06, 8);
    expect(weighted.terms.repetition).toBeCloseTo(0, 8);
    expect(weighted.terms.targetResolution).toBe(0);

    const unequal = scoreCandidate({
      contextChords: [parseChord("C5")],
      candidatePath: [parseChord("C13")],
      key,
    });
    const unequalCost = Number(unequal.evidence.find((flag) => flag.startsWith("voice-leading:")).split(":")[1]);
    expect(Number.isFinite(unequalCost)).toBe(true);
    expect(unequal.terms.voiceLeading).toBeCloseTo(-unequalCost * 0.08, 8);
  });

  it("returns stable deterministic ordering, IDs, and scores", () => {
    const draft = makeDraft(0, "major", ["C", "F", "G7", "C"]);
    const context = { intent: "contrast", draft, sectionId: "s", chordId: "c2", gapIndex: 2 };
    const first = suggestForIntent(context);
    const second = suggestForIntent(context);
    expect(second.map(({ id, symbols, score }) => ({ id, symbols, score })))
      .toEqual(first.map(({ id, symbols, score }) => ({ id, symbols, score })));
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
  });

  it("keeps offline ideas first and rejects Deep claims that miss their target", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c3",
      gapIndex: 3,
      intent: "lead-in",
    };
    const bad = {
      intent: "lead-in",
      kind: "insertBefore",
      symbols: ["F#"],
      rationale: "leads to C",
      evidence: ["target:C"],
    };
    const good = {
      intent: "lead-in",
      kind: "insertBefore",
      symbols: ["Dm7", "G7"],
      rationale: "ii-V to C",
      evidence: ["made up by the model"],
    };

    expect(verifyExternalIdea(bad, context)).toBeNull();
    const verified = verifyExternalIdea(good, context);
    expect(verified).toMatchObject({
      source: "ai",
      symbols: ["Dm7", "G7"],
      rationale: "ii-V to C",
      evidence: expect.arrayContaining(["ii-V:C", "target:C"]),
    });
    expect(verified.evidence).not.toContain("made up by the model");
    expect(verified.why).toMatch(/verified ii–V/i);

    const offline = [{ id: "offline", source: "offline", symbols: ["G7"] }];
    const merged = mergeDeepIdeas(offline, [bad, good], context);
    expect(merged[0]).toBe(offline[0]);
    expect(merged.some((idea) => idea.source === "ai"
      && idea.symbols.join(" ") === "Dm7 G7")).toBe(true);
    expect(merged.some((idea) => idea.symbols.includes("F#"))).toBe(false);
  });

  it("deduplicates enharmonic Deep sequences by sound and appends at most three", () => {
    const context = {
      draft: makeDraft(0, "major", ["C", "F", "G7", "C"]),
      sectionId: "s",
      chordId: "c2",
      intent: "next",
    };
    const offline = [{ id: "offline", source: "offline", symbols: ["G#"] }];
    const raw = [
      { intent: "next", kind: "insertAfter", symbols: ["Ab"], rationale: "duplicate" },
      { intent: "next", kind: "insertAfter", symbols: ["C"], rationale: "one" },
      { intent: "next", kind: "insertAfter", symbols: ["Dm"], rationale: "two" },
      { intent: "next", kind: "insertAfter", symbols: ["Em"], rationale: "three" },
      { intent: "next", kind: "insertAfter", symbols: ["F"], rationale: "four" },
    ];

    const merged = mergeDeepIdeas(offline, raw, context);
    expect(merged.slice(0, offline.length)).toEqual(offline);
    expect(merged.filter((idea) => idea.source === "ai")).toHaveLength(3);
    expect(merged.some((idea) => idea.source === "ai" && idea.symbols[0] === "Ab"))
      .toBe(false);
  });

  it("returns the offline list unchanged for missing or malformed Deep output", () => {
    const offline = [{ id: "offline", source: "offline", symbols: ["C"] }];
    const context = {
      draft: makeDraft(0, "major", ["C"]),
      sectionId: "s",
      chordId: "c0",
      intent: "next",
    };
    expect(mergeDeepIdeas(offline, null, context)).toEqual(offline);
    expect(mergeDeepIdeas(offline, { ideas: "bad" }, context)).toEqual(offline);
  });
});
