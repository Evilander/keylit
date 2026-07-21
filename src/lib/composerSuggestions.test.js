import { describe, expect, it } from "vitest";
import { createDraft } from "./composition.js";
import {
  contrastEvidence,
  paletteForKey,
  scoreCandidate,
  suggestForIntent,
  validateSuggestionEvidence,
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
      why: "verified fixture",
    }, context).ok).toBe(true));
    const falseDominant = {
      symbols: ["F7", "Dm"],
      chords: ["F7", "Dm"].map(parseChord),
      evidence: ["secondary-dominant:Dm", "target:Dm"],
      why: "false fixture",
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
      why: "verified fixture",
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
      why: "false fixture",
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
});
