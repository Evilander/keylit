import { describe, expect, it } from "vitest";
import { parseChord } from "./theory.js";
import {
  adaptLegacySketch, applyCompositionOp, createDraft,
  deriveActiveDocument, deriveProgression, flattenDraft, serializeDraft,
  replaceDraftInSession, suggestionToCompositionOp, validateDraft,
} from "./composition.js";

const ids = (() => { let n = 0; return () => `new-${++n}`; })();
const draft = () => createDraft({
  id: "draft-1", name: "New song", key: { tonic: 0, mode: "major" },
  sections: [{ id: "verse", name: "Verse", chords: [
    { id: "c1", symbol: "C" }, { id: "c2", symbol: "C" },
    { id: "c3", symbol: "F" }, { id: "c4", symbol: "G7" },
  ] }], lyrics: "line one", savedAt: 1,
});

describe("composition draft", () => {
  it("preserves consecutive repeated chords instead of parseSheet collapse", () => {
    expect(deriveProgression(draft()).progression.map((c) => c.raw))
      .toEqual(["C", "C", "F", "G7"]);
    expect(flattenDraft(draft()).map((x) => x.chordId))
      .toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("serializes named sections without losing exact order", () => {
    expect(serializeDraft(draft())).toBe("[Verse]\nC C F G7");
  });

  it("rejects an unparseable insert without mutating the input", () => {
    const before = draft();
    const after = applyCompositionOp(before, {
      type: "chord/insert", sectionId: "verse", index: 1, symbol: "H13",
    }, { makeId: ids });
    expect(after).toBe(before);
    expect(validateDraft(after).ok).toBe(true);
  });

  it("supports add, replace, duplicate, move, delete, reverse and section duplication", () => {
    let d = draft();
    d = applyCompositionOp(d, { type: "chord/replace", sectionId: "verse", chordId: "c1", symbol: "Cmaj7" }, { makeId: ids });
    expect(d.sections[0].chords[0].symbol).toBe("Cmaj7");
    d = applyCompositionOp(d, { type: "chord/duplicate", sectionId: "verse", chordId: "c3" }, { makeId: ids });
    expect(d.sections[0].chords.map((c) => c.symbol)).toEqual(["Cmaj7", "C", "F", "F", "G7"]);
    d = applyCompositionOp(d, { type: "chord/move", sectionId: "verse", chordId: "c4", toIndex: 0 }, { makeId: ids });
    expect(d.sections[0].chords[0].symbol).toBe("G7");
    const duplicatedF = d.sections[0].chords.find((slot) => slot.id !== "c3" && slot.symbol === "F");
    d = applyCompositionOp(d, { type: "chord/delete", sectionId: "verse", chordId: duplicatedF.id }, { makeId: ids });
    d = applyCompositionOp(d, { type: "section/reverse", sectionId: "verse" }, { makeId: ids });
    expect(d.sections[0].chords.at(-1).symbol).toBe("G7");
    d = applyCompositionOp(d, { type: "section/duplicate", sectionId: "verse", name: "Chorus" }, { makeId: ids });
    expect(d.sections).toHaveLength(2);
    expect(new Set(d.sections.flatMap((s) => [s.id, ...s.chords.map((c) => c.id)])).size)
      .toBe(2 + d.sections.reduce((n, s) => n + s.chords.length, 0));
    d = applyCompositionOp(d, { type: "suggestion/apply", sectionId: "verse", kind: "newSection", sectionName: "Bridge", symbols: ["Am", "E7"] }, { makeId: ids });
    expect(d.sections.at(-1)).toMatchObject({ name: "Bridge", chords: [{ symbol: "Am" }, { symbol: "E7" }] });
  });

  it("adapts a legacy sectioned sketch deterministically and idempotently", () => {
    const legacy = { id: "old", name: "Old", sheet: "[Verse]\nC C F\n[Chorus]\nAm G", lyrics: "words", savedAt: 4 };
    expect(adaptLegacySketch(legacy)).toEqual(adaptLegacySketch(legacy));
    expect(deriveProgression(adaptLegacySketch(legacy)).progression.map((c) => c.raw))
      .toEqual(["C", "C", "F", "Am", "G"]);
  });

  it("preserves empty and single-chord sections plus slash and altered symbols", () => {
    const edge = createDraft({
      id: "edge", name: "Edges", key: { tonic: 1, mode: "minor" },
      sections: [
        { id: "intro", name: "Intro", chords: [] },
        { id: "verse", name: "Verse", chords: [{ id: "slash", symbol: "C#m9/G#" }] },
        { id: "bridge", name: "Bridge", chords: [{ id: "altered", symbol: "C7#9" }] },
      ],
    });
    expect(validateDraft(edge).ok).toBe(true);
    expect(serializeDraft(edge)).toBe("[Intro]\n\n\n[Verse]\nC#m9/G#\n\n[Bridge]\nC7#9");
    expect(deriveProgression(edge).progression.map((chord) => chord.raw)).toEqual(["C#m9/G#", "C7#9"]);
  });

  it("transposes stored symbols when the tonic changes and relabels only when mode changes", () => {
    let d = draft();
    d = applyCompositionOp(d, { type: "draft/key", key: { tonic: 2, mode: "major" } }, { makeId: ids });
    expect(d.sections[0].chords.map((slot) => slot.symbol)).toEqual(["D", "D", "G", "A7"]);
    d = applyCompositionOp(d, { type: "draft/key", key: { tonic: 2, mode: "minor" } }, { makeId: ids });
    expect(d.sections[0].chords.map((slot) => slot.symbol)).toEqual(["D", "D", "G", "A7"]);
    expect(d.key).toEqual({ tonic: 2, mode: "minor" });
  });

  it("makes the Write draft win atomically over base sheet and Lab progression", () => {
    const active = deriveActiveDocument({ writeDraft: draft(), baseSheet: "Dm A", labProg: [parseChord("F#")], baseProg: [parseChord("Dm"), parseChord("A")] });
    expect(active.source).toBe("write");
    expect(active.sheet).toBe("[Verse]\nC C F G7");
    expect(active.progression.map((chord) => chord.raw)).toEqual(["C", "C", "F", "G7"]);
  });

  it("replaces a complete draft atomically with push or reset history semantics", () => {
    const current = { draft: draft(), selection: { sectionId: "verse", chordId: "c2" }, history: [], revision: 4 };
    const nextDraft = createDraft({ id: "next", name: "Next", key: { tonic: 2, mode: "major" }, sections: [{ id: "chorus", name: "Chorus", chords: [{ id: "d", symbol: "D" }] }] });
    const pushed = replaceDraftInSession(current, nextDraft, { historyMode: "push" });
    expect(pushed).toMatchObject({ draft: nextDraft, selection: { sectionId: "chorus", chordId: "d" }, revision: 5 });
    expect(pushed.history).toEqual([current.draft]);
    const reset = replaceDraftInSession(current, nextDraft, { historyMode: "reset" });
    expect(reset.history).toEqual([]);
    expect(reset.revision).toBe(5);
  });
});
