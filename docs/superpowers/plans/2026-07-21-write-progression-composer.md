# Write Progression Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Write's split sheet/Lab state with a canonical, section-aware chord draft, an unrestricted hybrid chord picker, and verified context-aware songwriting suggestions.

**Architecture:** Add a pure composition document module and a separate pure suggestion engine. Persist v2 drafts by stable ID while retaining the legacy sketch store as read-only recovery input. App owns the active draft and derives every Write surface from it; controlled composer components edit the draft through ID-based operations.

**Tech Stack:** React 18, Vite 6, Vitest 2, existing pure theory/voicing/spelling modules, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, and jsdom for component tests only.

## Global Constraints

- Keep `src/lib/` pure: no React, DOM, audio, storage, or network access.
- Do not change `parseSheet` repeat-collapse behavior; Write drafts must preserve exact repeated slots independently.
- Stored chord symbols are source data. Parsed chords, spelling, voicings, and sheet text are derived.
- Every chord accepted by the composer must pass `parseChord`; invalid input never mutates the draft.
- The chart-spelling dialect applies to chord-reading surfaces; key names remain conventionally spelled.
- Deep mode supplements verified offline suggestions and cannot mutate a draft from a stale response.
- Preserve legacy `keylit.songs.v1` data and write new drafts to `keylit.write.drafts.v2`.
- No new runtime dependency or UI framework. DOM testing dependencies are dev-only.
- Functional components and hooks only; audio initialization remains inside user gestures.
- Accessibility, keyboard editing, focus restoration, mobile layout, and reduced motion are release gates.
- Follow red-green-refactor. Each task ends with focused tests and a commit.

---

## File Structure

### Create

- `src/lib/composition.js` — canonical draft schema, exact derivation, legacy adaptation, and immutable edit operations.
- `src/lib/composition.test.js` — exact-order, migration, validation, and operation invariants.
- `src/lib/composerSuggestions.js` — candidate generation, scoring, evidence, five intents, and contrast proof.
- `src/lib/composerSuggestions.test.js` — 12-tonic × two-mode and target-resolution invariants.
- `src/lib/llm.test.js` — Deep progression response parsing and graceful failure.
- `src/components/ProgressionComposer.jsx` — section and chord-strip editor.
- `src/components/ComposerPicker.jsx` — In key, Color, Any chord, and intent results.
- `src/components/ProgressionComposer.test.jsx` — keyboard/pointer editing and focus behavior.
- `src/components/WriteDesk.test.jsx` — canonical save/open/Spark/Reverse/Hum/MIDI behavior.
- `src/test/render.js` — React Testing Library exports plus explicit Vitest cleanup.

### Modify

- `src/storage.js` — add `createDraftBook`/`draftBook`; leave the legacy `library` API intact.
- `src/storage.test.js` — stable-ID v2 persistence, same-name drafts, corruption, and v1 recovery.
- `src/App.jsx` — own active draft/selection/history and derive Write views from it.
- `src/components/WriteDesk.jsx` — controlled draft, composer-first layout, and collapsible secondary tools.
- `src/components/ChordLab.jsx` — stable chord targeting and stale Deep response rejection.
- `src/components/HumHarmony.jsx` — emit selected chords to a draft operation instead of global Lab state.
- `src/components/MirrorPanel.jsx` — read serialized v2 drafts as well as legacy `.sheet` sketches.
- `src/lib/llm.js` — add parsed whole-progression Deep ideas.
- `api/analyze.js` — add the structured `compose` proxy task.
- `src/ui/bench.css` — composer strip, drawer, responsive, focus, and reduced-motion styles.
- `package.json`, `package-lock.json` — dev-only DOM test packages.

---

### Task 1: Canonical Composition Document

**Files:**
- Create: `src/lib/composition.js`
- Create: `src/lib/composition.test.js`
- Read: `src/lib/theory.js`, `src/lib/chartlines.js`

**Interfaces:**
- Consumes: `parseChord`, `parseSheet`, `chordSymbol`, and `chartOutline`.
- Produces:
  - `createDraft(input)` → normalized v2 draft.
  - `adaptLegacySketch(sketch)` → deterministic v2 draft.
  - `validateDraft(draft)` → `{ ok, errors }`.
  - `deriveProgression(draft)` → `{ progression, invalid }` preserving repeated slots.
  - `serializeDraft(draft)` → sectioned chord sheet.
  - `flattenDraft(draft)` → `[{ sectionId, chordId, sectionIndex, chordIndex, symbol, chord }]`.
  - `applyCompositionOp(draft, op, { makeId })` → new draft or unchanged draft for invalid operations.
  - `suggestionToCompositionOp({ suggestion, sectionId, targetSlotId, gapIndex, transpose })` → a stable-ID operation with display transpose inverted for stored symbols.
  - `deriveActiveDocument({ writeDraft, baseSheet, labProg, baseProg })` → the one sheet/progression pair App may consume.
  - `replaceDraftInSession(session, draft, { historyMode })` → one validated atomic draft/history/selection/revision transition.

- [ ] **Step 1: Write failing schema and exact-order tests**

```js
import { describe, expect, it } from "vitest";
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/lib/composition.test.js`

Expected: FAIL because `src/lib/composition.js` does not exist.

- [ ] **Step 3: Implement the exact draft model and operations**

Use this operation vocabulary without aliases:

```js
// Draft-changing operations accepted by applyCompositionOp:
// { type: "draft/name", name }
// { type: "draft/lyrics", lyrics }
// { type: "draft/key", key: { tonic, mode } }
// { type: "section/add", id?, name, index? }
// { type: "section/rename", sectionId, name }
// { type: "section/duplicate", sectionId, name? }
// { type: "section/delete", sectionId }
// { type: "section/move", sectionId, toIndex }
// { type: "section/reverse", sectionId }
// { type: "chord/insert", sectionId, index, id?, symbol }
// { type: "chord/replace", sectionId, chordId, symbol }
// { type: "chord/duplicate", sectionId, chordId }
// { type: "chord/delete", sectionId, chordId }
// { type: "chord/move", sectionId, chordId, toIndex }
// { type: "suggestion/apply", sectionId, targetId?, gapIndex?, kind, symbols, sectionName? }
```

Implementation rules:

```js
const cleanKey = (key) => ({
  tonic: ((Number(key?.tonic) || 0) % 12 + 12) % 12,
  mode: key?.mode === "minor" ? "minor" : "major",
});

const validSymbol = (value) => {
  const symbol = String(value || "").trim();
  return symbol && parseChord(symbol) ? symbol : null;
};

export function deriveProgression(draft) {
  const progression = [], invalid = [];
  for (const section of draft?.sections || []) {
    for (const slot of section.chords || []) {
      const chord = parseChord(slot.symbol);
      if (!chord) invalid.push({ sectionId: section.id, chordId: slot.id, symbol: slot.symbol });
      else progression.push({ ...chord, section: section.name, slotId: slot.id, sectionId: section.id });
    }
  }
  return { progression, invalid };
}

export function serializeDraft(draft) {
  return (draft?.sections || [])
    .map((section) => `[${section.name}]\n${section.chords.map((c) => c.symbol).join(" ")}`)
    .join("\n\n");
}
```

For legacy adaptation, walk `chartOutline(sketch.sheet)` so exact chord tokens and section boundaries survive. If that produces no chord tokens, fall back to `parseSheet` grouped by `chord.section`. Deterministic IDs are `legacy-${sketch.id}-s${sectionIndex}` and `legacy-${sketch.id}-s${sectionIndex}-c${chordIndex}`. Never call time, randomness, crypto, storage, or the DOM in this module.

For every edit, copy only the affected draft/section/chord arrays. Return the original object when a target ID is absent, an index is out of range, a section delete would remove the final section, or a chord symbol does not parse. Duplicates and new sections use `op.id || makeId(prefix)` and must mint fresh chord IDs.

An empty chord array is a valid section and must serialize with its header. A draft must contain at least one named section; `createDraft` normalizes a missing/empty `sections` array to one empty `Section`. This makes empty-section behavior explicit without permitting a structurally unusable document.

When `createDraft` must synthesize that section, its deterministic ID is `${draftId}-section-0`. For `suggestion/apply`, `replace` replaces the target with the ordered symbols, `insertBefore`/`insertAfter` insert around the stable target, a gap inserts at `gapIndex`, and `newSection` appends a fresh section named `sectionName || "Contrast"` with fresh chord IDs. Any missing target, invalid symbol, or out-of-range gap returns the original draft.

`draft/key` matches the existing Song semantics: changing tonic transposes every stored chord symbol, including slash basses, by the tonic delta; changing mode with the same tonic is a relabel lens and leaves pitches unchanged. The operation reparses every transposed symbol before committing atomically. This one rule keeps the displayed sequence, playback, voicings, and MIDI export aligned.

`deriveActiveDocument` returns serialized draft text plus `deriveProgression(draft).progression` when a draft exists. Otherwise it returns `baseSheet` plus `labProg || baseProg`. App must consume both fields from this one return value; it may not select sheet and progression through separate conditionals.

`replaceDraftInSession` rejects an invalid draft by returning the original session. For a valid draft, it changes draft, selection, history, and monotonically incremented revision in one returned object. `historyMode: "push"` records the prior draft for Spark/Hum/full-progression edits; `historyMode: "reset"` starts a clean document session when opening a saved or migrated sketch.

- [ ] **Step 4: Run focused and neighboring pure tests**

Run: `npx vitest run src/lib/composition.test.js src/lib/theory.test.js src/lib/chartlines.test.js`

Expected: PASS, including the existing `parseSheet` collapse tests unchanged.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/composition.js src/lib/composition.test.js
git commit -m "feat(write): add canonical composition document"
```

---

### Task 2: Stable Draft Persistence and Legacy Recovery

**Files:**
- Modify: `src/storage.js:5-38`
- Modify: `src/storage.test.js:1-46`
- Test: `src/storage.test.js`

**Interfaces:**
- Consumes: `adaptLegacySketch`, `createDraft`, and `validateDraft` from Task 1.
- Produces:
  - `createDraftBook(backend)` with `list()`, `get(id)`, `save(draft)`, `remove(id)`, and `legacy()`.
  - `draftBook`, the browser-backed singleton.
- Leaves `createLibrary` and `library` intact for backward compatibility and recovery.

- [ ] **Step 1: Make the fake backend key-aware and write failing v2 tests**

```js
function fakeBackend(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? "",
    setItem: (key, value) => data.set(key, value),
    snapshot: () => Object.fromEntries(data),
  };
}

it("upserts v2 drafts by stable id and permits repeated names", () => {
  const be = fakeBackend();
  const book = createDraftBook(be);
  book.save(createDraft({ id: "a", name: "Untitled", sections: [{ id: "a-section", name: "Section", chords: [] }] }));
  book.save(createDraft({ id: "b", name: "Untitled", sections: [{ id: "b-section", name: "Section", chords: [] }] }));
  book.save(createDraft({ id: "a", name: "Changed", sections: [{ id: "a-section", name: "Section", chords: [] }] }));
  expect(book.list().map((d) => d.id)).toEqual(["a", "b"]);
  expect(book.get("a").name).toBe("Changed");
});

it("keeps v1 recovery data untouched", () => {
  const legacy = JSON.stringify([{ id: "old", name: "Old", sheet: "C G", savedAt: 1 }]);
  const be = fakeBackend({ "keylit.songs.v1": legacy });
  const book = createDraftBook(be);
  expect(book.legacy()[0].id).toBe("old");
  book.save(adaptLegacySketch(book.legacy()[0]));
  expect(be.snapshot()["keylit.songs.v1"]).toBe(legacy);
  expect(JSON.parse(be.snapshot()["keylit.write.drafts.v2"]).drafts).toHaveLength(1);
});

it("ignores corrupt v2 data and still exposes legacy recovery", () => {
  const be = fakeBackend({
    "keylit.write.drafts.v2": "{broken",
    "keylit.songs.v1": JSON.stringify([{ id: "old", name: "Old", sheet: "C" }]),
  });
  const book = createDraftBook(be);
  expect(book.list()).toEqual([]);
  expect(book.legacy()).toHaveLength(1);
});

it("filters valid JSON whose draft schema, IDs, or chord symbols are invalid", () => {
  const be = fakeBackend({
    "keylit.write.drafts.v2": JSON.stringify({ version: 2, drafts: [
      { id: "bad-chord", name: "Bad", key: { tonic: 0, mode: "major" }, sections: [{ id: "s", name: "Verse", chords: [{ id: "c", symbol: "H13" }] }] },
      { id: "dup", name: "Dup", key: { tonic: 0, mode: "major" }, sections: [{ id: "s", name: "Verse", chords: [{ id: "same", symbol: "C" }, { id: "same", symbol: "G" }] }] },
    ] }),
  });
  expect(createDraftBook(be).list()).toEqual([]);
});
```

- [ ] **Step 2: Run the storage test and verify RED**

Run: `npx vitest run src/storage.test.js`

Expected: FAIL because `createDraftBook` is not exported and the old fake backend is not key-aware.

- [ ] **Step 3: Add the v2 store**

Use the exact storage envelope `{ version: 2, drafts: [] }`. Every read filters entries through strict `validateDraft` before returning a normalized copy; valid JSON with malformed sections, duplicate IDs, invalid chords, or invalid keys is ignored rather than reaching React. `save` validates and throws `Error("Invalid Write draft")` rather than persisting malformed data. `list` sorts by `savedAt` descending; `get` returns `null` when absent. `legacy()` reads `keylit.songs.v1` through the existing library reader but does not auto-write or delete it.

```js
const DRAFT_KEY = "keylit.write.drafts.v2";

export function createDraftBook(backend) {
  const be = backend || (typeof localStorage !== "undefined" ? localStorage : memoryBackend());
  const read = () => {
    try {
      const raw = JSON.parse(be.getItem(DRAFT_KEY) || "{}");
      return raw?.version === 2 && Array.isArray(raw.drafts)
        ? raw.drafts.filter((draft) => validateDraft(draft).ok).map((draft) => createDraft(draft))
        : [];
    } catch { return []; }
  };
  const write = (drafts) => be.setItem(DRAFT_KEY, JSON.stringify({ version: 2, drafts }));
  return {
    list: () => read().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
    get: (id) => read().find((draft) => draft.id === id) || null,
    save(draft) {
      if (!validateDraft(draft).ok) throw new Error("Invalid Write draft");
      const next = read().filter((item) => item.id !== draft.id).concat(draft);
      write(next);
      return draft;
    },
    remove(id) { write(read().filter((draft) => draft.id !== id)); },
    legacy() { return createLibrary(be).list(); },
  };
}

export const draftBook = createDraftBook();
```

- [ ] **Step 4: Run storage and composition tests**

Run: `npx vitest run src/storage.test.js src/lib/composition.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/storage.js src/storage.test.js
git commit -m "feat(write): persist stable composition drafts"
```

---

### Task 3: Context-Aware Offline Suggestion Engine

**Files:**
- Create: `src/lib/composerSuggestions.js`
- Create: `src/lib/composerSuggestions.test.js`
- Read: `src/lib/suggest.js`, `src/lib/theory.js`, `src/lib/voicing.js`

**Interfaces:**
- Consumes: `flattenDraft`, existing chord builders/suggesters, `harmonicFunction`, `sameChordSound`, and voicing helpers.
- Produces:
  - `paletteForKey(key, { sevenths })` → seven diatonic choices.
  - `suggestForIntent({ intent, draft, sectionId, chordId, gapIndex, style, boldness })`.
  - `contrastEvidence(sourceChords, seedChords, key)` → `{ groups, jaccard, profileDistance, rejectedReason }`.
  - `validateSuggestionEvidence(suggestion, context)` → `{ ok, errors }` using the same predicates that generated the explanation.
  - `scoreCandidate({ contextChords, candidatePath, target, key })` → `{ score, terms, evidence }`.
- Suggestion shape:

```js
{
  id,
  intent: "next" | "lead-in" | "between" | "turnaround" | "contrast",
  kind: "insertBefore" | "insertAfter" | "replace" | "newSection",
  symbols: ["Dm7", "G7"],
  chords: [/* parsed chords */],
  why: "Dm7–G7 pulls into C through its ii–V.",
  evidence: ["target:dominant", "function:S>D>T"],
  score,
  source: "offline"
}
```

- [ ] **Step 1: Write failing cross-key and target tests**

```js
import { describe, expect, it } from "vitest";
import { createDraft } from "./composition.js";
import { contrastEvidence, paletteForKey, scoreCandidate, suggestForIntent, validateSuggestionEvidence } from "./composerSuggestions.js";
import { parseChord } from "./theory.js";

const makeDraft = (tonic, mode, symbols) => createDraft({
  id: "d", name: "D", key: { tonic, mode },
  sections: [{ id: "s", name: "Verse", chords: symbols.map((symbol, i) => ({ id: `c${i}`, symbol })) }],
});

for (const mode of ["major", "minor"]) {
  for (let tonic = 0; tonic < 12; tonic++) {
    it(`returns only parseable evidenced ideas in ${tonic} ${mode}`, () => {
      const draft = makeDraft(tonic, mode, paletteForKey({ tonic, mode }).slice(0, 3).map((x) => x.symbol));
      for (const intent of ["next", "lead-in", "between", "turnaround", "contrast"]) {
        const out = suggestForIntent({ intent, draft, sectionId: "s", chordId: "c1", gapIndex: 1 });
        expect(out.length).toBeGreaterThan(0);
        for (const item of out) {
          expect(item.symbols.every((symbol) => parseChord(symbol))).toBe(true);
          expect(item.why.length).toBeGreaterThan(12);
          expect(item.evidence.length).toBeGreaterThan(0);
          expect(validateSuggestionEvidence(item, { draft, sectionId: "s", chordId: "c1", gapIndex: 1 }).ok).toBe(true);
          if (intent === "lead-in" || intent === "turnaround") expect(item.evidence.some((flag) => flag.startsWith("target:"))).toBe(true);
          if (intent === "contrast") {
            const source = draft.sections[0].chords.map((slot) => parseChord(slot.symbol));
            expect(contrastEvidence(source, item.chords, draft.key).groups.length).toBeGreaterThanOrEqual(2);
          }
        }
      }
    });
  }
}

it("lead-in and turnaround evidence names the real destination", () => {
  const draft = makeDraft(0, "major", ["C", "F", "G7", "C"]);
  const lead = suggestForIntent({ intent: "lead-in", draft, sectionId: "s", chordId: "c3" });
  expect(lead.some((x) => x.symbols.join(" ") === "Dm7 G7" || x.symbols.includes("G7"))).toBe(true);
  expect(lead.every((x) => x.evidence.some((e) => e.startsWith("target:")))).toBe(true);
});

it("contrast requires two independent groups and rejects copies/rotations/reversals", () => {
  const key = { tonic: 0, mode: "major" };
  const source = ["C", "G", "Am", "F"].map(parseChord);
  expect(contrastEvidence(source, ["G", "Am", "F", "C"].map(parseChord), key).rejectedReason).toBe("rotation");
  const contrast = contrastEvidence(source, ["Am", "Dm", "F", "E7"].map(parseChord), key);
  expect(contrast.groups.length).toBeGreaterThanOrEqual(2);
});

it("validates the defining predicates behind every named harmonic explanation", () => {
  const draft = makeDraft(0, "major", ["C", "F", "G7", "C"]);
  const all = ["next", "lead-in", "between", "turnaround", "contrast"]
    .flatMap((intent) => suggestForIntent({ intent, draft, sectionId: "s", chordId: "c2", gapIndex: 2 }));
  const named = all.filter((item) => item.evidence.some((flag) => /^(secondary-dominant|ii-V|modal-borrowing|passing-diminished|function:)/.test(flag)));
  expect(named.length).toBeGreaterThan(0);
  for (const item of named) {
    expect(validateSuggestionEvidence(item, { draft, sectionId: "s", chordId: "c2", gapIndex: 2 }).ok).toBe(true);
  }
});

it("accepts true and rejects false named-family evidence", () => {
  const context = { draft: makeDraft(0, "major", ["C", "F", "G7", "C"]), sectionId: "s", chordId: "c3", gapIndex: 3 };
  const trueCases = [
    { symbols: ["A7", "Dm"], chords: ["A7", "Dm"].map(parseChord), evidence: ["secondary-dominant:Dm", "target:Dm"] },
    { symbols: ["Dm7", "G7", "C"], chords: ["Dm7", "G7", "C"].map(parseChord), evidence: ["ii-V:C", "target:C"] },
    { symbols: ["Fm"], chords: [parseChord("Fm")], evidence: ["modal-borrowing:minor"] },
    { symbols: ["C#dim"], chords: [parseChord("C#dim")], evidence: ["passing-diminished:C:Dm"] },
  ];
  trueCases.forEach((item) => expect(validateSuggestionEvidence({ ...item, why: "verified fixture" }, context).ok).toBe(true));
  const falseDominant = { symbols: ["F7", "Dm"], chords: ["F7", "Dm"].map(parseChord), evidence: ["secondary-dominant:Dm", "target:Dm"], why: "false fixture" };
  expect(validateSuggestionEvidence(falseDominant, context).ok).toBe(false);
});

it("includes cadence, voice-leading, and bass-motion terms in deterministic ranking", () => {
  const key = { tonic: 0, mode: "major" }, target = parseChord("C");
  const strong = scoreCandidate({ contextChords: [parseChord("C"), parseChord("Dm7")], candidatePath: [parseChord("G7"), target], target, key });
  const weak = scoreCandidate({ contextChords: [parseChord("C"), parseChord("Dm7")], candidatePath: [parseChord("F#7"), target], target, key });
  expect(strong.terms.cadence).toBeGreaterThan(0);
  expect(strong.terms.voiceLeading).toBeLessThanOrEqual(0);
  expect(strong.terms.bassMotion).toBeLessThanOrEqual(0);
  expect(strong.score).toBeCloseTo(Object.values(strong.terms).reduce((sum, value) => sum + value, 0), 8);
  expect(strong.score).toBeGreaterThan(weak.score);
  expect(strong.evidence).toEqual(expect.arrayContaining([expect.stringMatching(/^cadence:/), expect.stringMatching(/^voice-leading:/), expect.stringMatching(/^bass-motion:/)]));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/lib/composerSuggestions.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement candidate pools, scoring, and evidence**

Build candidates from:

1. all seven diatonic triads/sevenths via `diatonicChord`;
2. `suggestionsFor` around the previous or target chord;
3. `insertBeforeChord(target)` for lead-in/turnaround;
4. `passingDimBetween(previous, next)` and target approaches for between;
5. explicit mode-safe colors produced through `buildChord`, then validated through `parseChord`.

Use these deterministic score terms:

```js
const TRANSITION = {
  T: { T: 0.5, S: 2.0, D: 1.5, "?": 0 },
  S: { T: 0.5, S: 0.25, D: 2.5, "?": 0 },
  D: { T: 3.0, S: -1.0, D: 0.25, "?": 0 },
  "?": { T: 1.0, S: 0.5, D: 0.5, "?": 0 },
};

const terms = {
  functionMotion: TRANSITION[previousFn]?.[candidateFn] ?? 0,
  commonTones: sharedPitchClasses(previous, candidate) * 0.35,
  cadence: cadenceStrength(candidatePath, target, key) * 1.25,
  voiceLeading: -voiceLeadingCost(previous, candidate) * 0.08,
  bassMotion: -bassMotion(previous, candidate) * 0.06,
  repetition: -recentSameSoundCount(candidate, context) * 1.25,
  targetResolution: resolvesToTarget(candidatePath, target) ? 4 : 0,
};
const score = Object.values(terms).reduce((sum, value) => sum + value, 0);
```

`voiceLeadingCost` compares `smoothUpper(candidate, rootPositionUpper(previous))` with the previous upper voicing and sums absolute voice motion after equalizing voice counts through the existing reduction rules. `bassMotion` is the minimum pitch-class distance between effective basses (slash bass when present, otherwise root). `cadenceStrength` returns 0–3 only from verified function/root relationships into the required destination. All three values are included in machine-readable evidence so the explanation and rank can be audited.

`resolvesToTarget` may return true only for an applied dominant whose root is a perfect fifth above the target, a tested ii–V path into the target, a chromatic diminished approach whose definition matches `passingDimBetween`, or a diatonic functional approach supported by the key. Generate `why` from the evidence flags used in scoring; do not maintain separate prose claims.

`validateSuggestionEvidence` calls those exact predicates again. Named evidence flags are `secondary-dominant:<target>`, `ii-V:<target>`, `modal-borrowing:<mode>`, `passing-diminished:<left>:<right>`, and `function:<path>`. A candidate that fails revalidation is filtered out before ranking, so UI prose cannot outrun the music proof.

For contrast, canonicalize chord sounds from root, interval set, and bass. Compute Jaccard as `intersection / union` with empty-union similarity `1`. Opening counts once for changed starting sound or function; vocabulary counts once for Jaccard `<= 0.5` or a verified new color; trajectory counts when L1 distance between normalized T/S/D profiles is `>= 0.5`. Reject identity, rotations, and reversal before scoring. Keep only seeds with at least two groups.

Build four-chord contrast seeds with a bounded beam: maximum pool 12, beam width 16, four steps, keep the top 5 unique seeds. This bounds work and prevents UI stalls.

- [ ] **Step 4: Run the music gates**

Run: `npx vitest run src/lib/composerSuggestions.test.js src/lib/suggest.test.js src/lib/theory.test.js src/lib/voicing.test.js`

Expected: PASS across all 24 key/mode combinations and existing suggestion tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/composerSuggestions.js src/lib/composerSuggestions.test.js
git commit -m "feat(write): add contextual progression suggestions"
```

---

### Task 3B: Verified Whole-Progression Deep Ideas

**Files:**
- Modify: `src/lib/composerSuggestions.js`
- Modify: `src/lib/composerSuggestions.test.js`
- Modify: `src/lib/llm.js`
- Create: `src/lib/llm.test.js`
- Modify: `api/analyze.js`

**Interfaces:**

```js
deepProgressionIdeas({ progression, key, intent, context }, { signal })
verifyExternalIdea(rawIdea, context) // pure; returns verified suggestion or null
mergeDeepIdeas(offlineIdeas, rawIdeas, context) // offline first, then unique verified Deep ideas
```

- [ ] **Step 1: Write failing parse, target, order, and failure tests**

```js
it("parses whole-progression ideas but drops every invalid symbol", async () => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ideas: [
    { intent: "contrast", kind: "newSection", symbols: ["Am", "Dm", "F", "E7"], rationale: "new center" },
    { intent: "next", kind: "insertAfter", symbols: ["H13"], rationale: "invalid" },
  ] }) }));
  const out = await deepProgressionIdeas({ progression: ["C", "G", "Am", "F"], key: "C major", intent: "contrast", context: {} });
  expect(out.ok).toBe(true);
  expect(out.data.ideas.map((idea) => idea.symbols)).toEqual([["Am", "Dm", "F", "E7"]]);
});

it("keeps offline ideas first and rejects Deep claims that miss their target", () => {
  const context = { draft: makeDraft(0, "major", ["C", "F", "G7", "C"]), sectionId: "s", chordId: "c3", gapIndex: 3, intent: "lead-in" };
  const bad = { intent: "lead-in", kind: "insertBefore", symbols: ["F#"], rationale: "leads to C" };
  const good = { intent: "lead-in", kind: "insertBefore", symbols: ["Dm7", "G7"], rationale: "ii-V to C" };
  const merged = mergeDeepIdeas([{ id: "offline", source: "offline", symbols: ["G7"] }], [bad, good], context);
  expect(merged[0].source).toBe("offline");
  expect(merged.some((idea) => idea.source === "ai" && idea.symbols.join(" ") === "Dm7 G7")).toBe(true);
  expect(merged.some((idea) => idea.symbols.includes("F#"))).toBe(false);
});

it("returns a stable offline error for proxy rejection, timeout, or malformed JSON", async () => {
  global.fetch = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
  const out = await deepProgressionIdeas({ progression: ["C"], key: "C major", intent: "next", context: {} });
  expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/offline ideas still work/i) });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/lib/llm.test.js src/lib/composerSuggestions.test.js`

Expected: FAIL because the Deep progression client and verifier do not exist.

- [ ] **Step 3: Implement the structured proxy task and client boundary**

Add `task: "compose"` to `api/analyze.js` with a strict JSON schema: `ideas[]` contains only `intent`, `kind`, `symbols`, and `rationale`; cap ideas at 8 and symbols per idea at 8. The server prompt receives the complete current section/progression, key/mode, selected stable context expressed as chord symbols, and the requested intent. It may propose ideas but may not assign music-theory evidence.

`deepProgressionIdeas` sends that payload, applies the existing proxy error pattern, caps strings/arrays, reparses every symbol with `parseChord`, and drops an entire idea if any symbol fails. `verifyExternalIdea` recomputes targets, functions, contrast groups, and explanation evidence through the offline predicates; it returns `null` if the requested intent cannot be proven. It creates `why` from verified evidence and treats the model rationale only as optional secondary text.

`mergeDeepIdeas` deduplicates by same-sounding ordered chord sequence, keeps all offline results first, and appends at most three verified Deep ideas. Timeout, abort, malformed output, and missing proxy return the offline list unchanged.

- [ ] **Step 4: Run Deep and offline music gates**

Run: `npx vitest run src/lib/llm.test.js src/lib/composerSuggestions.test.js src/lib/suggest.test.js src/lib/theory.test.js src/lib/voicing.test.js`

Expected: PASS with no unverified Deep claim or symbol reaching the composer.

- [ ] **Step 5: Commit**

```powershell
git add api/analyze.js src/lib/llm.js src/lib/llm.test.js src/lib/composerSuggestions.js src/lib/composerSuggestions.test.js
git commit -m "feat(write): add verified Deep progression ideas"
```

---

### Task 4: Composer UI and DOM Test Harness

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/test/render.js`
- Create: `src/components/ProgressionComposer.jsx`
- Create: `src/components/ComposerPicker.jsx`
- Create: `src/components/ProgressionComposer.test.jsx`
- Modify: `src/ui/bench.css`

**Interfaces:**
- Consumes: Task 1 operations and Task 3 palette/suggestions.
- Produces controlled components:

```js
<ProgressionComposer
  draft={draft}
  selection={{ sectionId, chordId, gapIndex } | null}
  spelling="sharps"
  documentId={draft.id}
  revision={0}
  canUndo={false}
  onSelect={(selection) => {}}
  onEdit={(operation) => {}}
  onUndo={() => {}}
  onAudition={(chords) => {}}
/>
```

- [ ] **Step 1: Install dev-only test support and create explicit cleanup**

Run: `npm install --save-dev @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom`

Create `src/test/render.js`:

```js
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
afterEach(() => cleanup());
export * from "@testing-library/react";
```

Keep Vite's global test environment as Node. Component tests start with `// @vitest-environment jsdom`. This follows the official Vitest per-file environment and Testing Library cleanup patterns.

- [ ] **Step 2: Write failing user-interaction tests**

```jsx
// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../test/render.js";
import ProgressionComposer from "./ProgressionComposer.jsx";
import { createDraft } from "../lib/composition.js";

const draft = createDraft({
  id: "d", name: "Song", key: { tonic: 0, mode: "major" },
  sections: [{ id: "verse", name: "Verse", chords: [{ id: "c1", symbol: "C" }, { id: "c2", symbol: "G" }] }],
});
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

it("adds any parseable chord and rejects invalid input", () => {
  const onEdit = vi.fn();
  render(<ProgressionComposer draft={draft} selection={{ sectionId: "verse", gapIndex: 2 }} spelling="sharps" onEdit={onEdit} onSelect={() => {}} onAudition={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /any chord/i }));
  fireEvent.change(screen.getByLabelText(/chord symbol/i), { target: { value: "C#m9/G#" } });
  fireEvent.click(screen.getByRole("button", { name: /add c#m9\/g#/i }));
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ type: "chord/insert", symbol: "C#m9/G#" }));
  fireEvent.change(screen.getByLabelText(/chord symbol/i), { target: { value: "H13" } });
  expect(screen.getByText("chord not recognized")).toBeTruthy();
});

it("supports duplicate, move, delete and keyboard alternatives", () => {
  const onEdit = vi.fn();
  render(<ProgressionComposer draft={draft} selection={null} spelling="sharps" onEdit={onEdit} onSelect={() => {}} onAudition={() => {}} />);
  const c = screen.getByRole("button", { name: /^C · chord 1/i });
  fireEvent.keyDown(c, { key: "ArrowRight", altKey: true });
  expect(onEdit).toHaveBeenCalledWith({ type: "chord/move", sectionId: "verse", chordId: "c1", toIndex: 1 });
  fireEvent.click(screen.getByRole("button", { name: /duplicate C/i }));
  expect(onEdit).toHaveBeenCalledWith({ type: "chord/duplicate", sectionId: "verse", chordId: "c1" });
});

it("adds and duplicates named sections with fresh operation targets", () => {
  const onEdit = vi.fn();
  render(<ProgressionComposer draft={draft} selection={null} spelling="sharps" onEdit={onEdit} onSelect={() => {}} onAudition={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /add section/i }));
  fireEvent.click(screen.getByRole("button", { name: "Chorus" }));
  expect(onEdit).toHaveBeenCalledWith({ type: "section/add", name: "Chorus" });
});

it("adds a custom-named section and exposes Undo after a delete", () => {
  const onEdit = vi.fn(), onUndo = vi.fn();
  render(<ProgressionComposer draft={draft} selection={null} spelling="sharps" canUndo onEdit={onEdit} onUndo={onUndo} onSelect={() => {}} onAudition={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /add section/i }));
  fireEvent.click(screen.getByRole("button", { name: /custom/i }));
  fireEvent.change(screen.getByLabelText(/custom section name/i), { target: { value: "Middle Eight" } });
  fireEvent.click(screen.getByRole("button", { name: /add Middle Eight/i }));
  expect(onEdit).toHaveBeenCalledWith({ type: "section/add", name: "Middle Eight" });
  fireEvent.click(screen.getByRole("button", { name: /delete G/i }));
  fireEvent.click(screen.getByRole("button", { name: /undo last edit/i }));
  expect(onUndo).toHaveBeenCalledTimes(1);
});

it("shows chart-dialect chord names while key and degree labels stay conventional", () => {
  const flatDraft = createDraft({ id: "flat", name: "Flat", key: { tonic: 8, mode: "major" }, sections: [{ id: "s", name: "Verse", chords: [{ id: "ab", symbol: "Ab" }] }] });
  render(<ProgressionComposer draft={flatDraft} selection={null} spelling="sharps" onEdit={() => {}} onUndo={() => {}} onSelect={() => {}} onAudition={() => {}} />);
  expect(screen.getByRole("button", { name: /G# · chord 1/i })).toHaveAttribute("title", expect.stringMatching(/piano says A♭|piano says Ab/i));
  fireEvent.click(screen.getByRole("button", { name: /in key/i }));
  expect(screen.getAllByText(/1|I/).length).toBeGreaterThan(0);
});

it("discards a late Deep result after the draft revision changes", async () => {
  const pending = deferred();
  const requestDeep = vi.fn(() => pending.promise);
  const props = { draft, selection: { sectionId: "verse", chordId: "c2" }, spelling: "sharps", documentId: "d", canUndo: false, onEdit: () => {}, onUndo: () => {}, onSelect: () => {}, onAudition: () => {}, requestDeep };
  const view = render(<ProgressionComposer {...props} revision={1} />);
  fireEvent.click(screen.getByRole("button", { name: /Deep ideas/i }));
  view.rerender(<ProgressionComposer {...props} revision={2} />);
  pending.resolve({ ok: true, data: { ideas: [{ intent: "next", kind: "insertAfter", symbols: ["Am"], rationale: "late idea" }] } });
  await waitFor(() => expect(screen.queryByText(/late idea/i)).toBeNull());
});
```

- [ ] **Step 3: Run the component test and verify RED**

Run: `npx vitest run src/components/ProgressionComposer.test.jsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the controlled composer**

`ProgressionComposer` renders section tabs, one ordered chord strip, gap buttons before/between/after chords, and explicit action buttons. React keys are stable section/chord IDs, never indexes. Alt+Arrow moves a focused chord; Delete dispatches delete; Enter auditions; focus moves to the inserted/adjacent stable ID after the parent returns the new draft.

It exposes one-click audition controls for the selected chord, the selected chord plus its immediate neighbor, the current section, and the whole draft. `canUndo` controls an `Undo last edit` button; deletion never becomes irreversible until the session history is cleared by an explicit document load.

`ComposerPicker` has tabs with these accessible names: `In key`, `Color`, `Any chord`, `Ideas`. It calls `paletteForKey`, `suggestForIntent`, and `parseChord`; all mutations are emitted as Task 1 operations. Intent buttons use exactly: `What comes next?`, `Lead into this chord`, `Put something between these`, `Turn this back to the top`, and `Contrast this section`. A `Deep ideas` control calls the injected `requestDeep` (default `deepProgressionIdeas`), captures `{ documentId, revision, selection }`, and merges results only when all three still match. Offline cards render immediately and remain first through loading, failure, or timeout.

Complete the interaction suite with a stateful harness that applies `applyCompositionOp` on `onEdit`. Assert pointer `move right`, Alt+Arrow, section-tab switching, all four audition scopes, deletion plus Undo, focus restoration after insert/delete, and applying the first card from each of the five intent groups. These are named tests with direct operation/audio assertions, not a manual-smoke substitute.

Add CSS classes rather than another inline-style wall:

```css
.write-composer { border-top: 1px solid var(--kl-hair); padding-top: 16px; }
.composer-strip { display: flex; gap: 8px; overflow-x: auto; padding: 10px 2px 14px; scroll-snap-type: x proximity; }
.composer-chord { flex: 0 0 auto; min-width: 64px; scroll-snap-align: start; }
.composer-gap { flex: 0 0 30px; min-height: 44px; }
.write-drawer > summary { cursor: pointer; list-style: none; }
@media (max-width: 700px) { .composer-chord { min-width: 72px; min-height: 48px; } }
@media (prefers-reduced-motion: reduce) { .composer-strip { scroll-behavior: auto; } }
```

- [ ] **Step 5: Run UI and pure composer tests**

Run: `npx vitest run src/components/ProgressionComposer.test.jsx src/lib/composition.test.js src/lib/composerSuggestions.test.js`

Expected: PASS with no act warnings or leaked DOM nodes.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json src/test/render.js src/components/ProgressionComposer.jsx src/components/ComposerPicker.jsx src/components/ProgressionComposer.test.jsx src/ui/bench.css
git commit -m "feat(write): build the section progression composer"
```

---

### Task 5: Canonical App State and Tool Adapters

**Files:**
- Modify: `src/App.jsx:135-150, 200-240, 525-551, 1153-1175`
- Modify: `src/components/ChordLab.jsx`
- Modify: `src/components/HumHarmony.jsx`
- Test: `src/components/WriteDesk.test.jsx`, `src/components/ChordLab.test.jsx`, `src/components/HumHarmony.test.jsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces one active Write draft whose derived progression feeds rail, playback, voicings, Chord Lab, MIDI, and persistence until a different song/chart is explicitly loaded.
- Preserves non-Write `labProg` for Song Coverize and Practice Mirror flows.

- [ ] **Step 1: Write failing integration tests around stable operations**

Test Chord Lab and Hum adapters without mounting all of App:

```jsx
// @vitest-environment jsdom
it("Chord Lab applies to the selected stable slot", () => {
  const onApply = vi.fn();
  render(<ChordLab prog={progression} activeKey={{ tonic: 0, mode: "major" }} documentId="draft-1" revision={1} selectedIdx={1} selectedSlotId="c2" onSelectIdx={() => {}} onAudition={() => {}} onApply={onApply} />);
  fireEvent.click(screen.getAllByTitle("Apply")[0]);
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ targetSlotId: "c2" }));
});

it("Chord Lab discards a Deep response after revision or target changes", async () => {
  const pending = deferred();
  reharmonize.mockReturnValueOnce(pending.promise);
  const base = { prog: progression, activeKey: { tonic: 0, mode: "major" }, documentId: "draft-1", selectedIdx: 1, onSelectIdx: () => {}, onAudition: () => {}, onApply: () => {} };
  const view = render(<ChordLab {...base} revision={1} selectedSlotId="c2" />);
  fireEvent.click(screen.getByRole("button", { name: /Deep mode/i }));
  view.rerender(<ChordLab {...base} revision={2} selectedSlotId="c3" selectedIdx={2} />);
  await act(async () => pending.resolve({ ok: true, data: { suggestions: [{ targetIndex: 1, action: "replace", chords: [parseChord("Am")], rationale: "stale result", source: "ai" }] } }));
  await waitFor(() => expect(screen.queryByText("stale result")).toBeNull());
});

it("Hum-to-Harmony emits chosen chords instead of replacing unrelated state", async () => {
  const onCommitChords = vi.fn();
  render(<HumHarmony activeKey={{ tonic: 0, mode: "major" }} onAudition={() => {}} onCommitChords={onCommitChords} />);
  fireEvent.click(screen.getByRole("button", { name: /Hum-to-Harmony/i }));
  fireEvent.click(screen.getByRole("button", { name: /hum a line/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /done humming/i })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /done humming/i }));
  fireEvent.click(await screen.findByRole("button", { name: /^C$/ }));
  fireEvent.click(screen.getByRole("button", { name: /append to section/i }));
  expect(onCommitChords).toHaveBeenCalledWith({ symbols: ["C"], placement: "append" });
});
```

In `HumHarmony.test.jsx`, mock `segmentMelody` to return `[{ midis: [60] }]`, mock `harmonizeNotes` to return one C-major candidate, install a fake `navigator.mediaDevices.getUserMedia`, `AudioContext`, and RAF, and assert that the fake stream track is stopped. This makes the interaction above deterministic without adding a production-only test seam.

In `ChordLab.test.jsx`, mock `reharmonize` from `../lib/llm.js`, define the same small `deferred()` helper used by the composer test, and import `act`, `waitFor`, plus `parseChord`. The stale-response test resolves inside `await act(...)` so React has no unhandled update warning.

Also add this pure assertion to `composition.test.js`:

```js
expect(suggestionToCompositionOp({
  suggestion: { kind: "replace", chords: [parseChord("D"), parseChord("A7")] },
  sectionId: "verse", targetSlotId: "c2", transpose: 2,
})).toEqual({
  type: "suggestion/apply", sectionId: "verse", targetId: "c2",
  kind: "replace", symbols: ["C", "G7"],
});
```

This proves a Chord Lab suggestion in a +2 display transpose targets a stable slot and stores every symbol back at authored pitch.

- [ ] **Step 2: Run the adapter tests and verify RED**

Run: `npx vitest run src/components/ChordLab.test.jsx src/components/HumHarmony.test.jsx`

Expected: FAIL because stable-slot props and canonical operations do not exist.

- [ ] **Step 3: Wire the active draft without breaking non-Write Lab flows**

Use one atomic session state; do not call one React state setter from inside another setter:

```js
const [writeSession, setWriteSession] = useState(() => ({
  draft: null, selection: null, history: [], revision: 0,
}));
const { draft: writeDraft, selection: writeSelection, history: writeHistory } = writeSession;
const activeDocument = useMemo(
  () => deriveActiveDocument({ writeDraft, baseSheet: sheet, labProg, baseProg }),
  [writeDraft, sheet, labProg, baseProg],
);
const activeSheet = activeDocument.sheet;
const sourceProg = activeDocument.progression;
```

`loadSheet`, `openSong`, shared/imported chart loading, and received-share loading must reset the entire session to `{ draft: null, selection: null, history: [], revision: previous.revision + 1 }`. Changing rooms does not. Entering Write with no draft adapts the current sheet into a new draft once; use stable runtime IDs minted outside `src/lib/`.

Add:

```js
const editWriteDraft = (operation) => {
  setWriteSession((current) => {
    const next = applyCompositionOp(current.draft, operation, { makeId: nextWriteId });
    return next === current.draft ? current : {
      ...current, draft: next,
      history: current.history.concat(current.draft),
      revision: current.revision + 1,
    };
  });
};

const undoWriteDraft = () => setWriteSession((current) => {
  if (!current.history.length) return current;
  const draft = current.history[current.history.length - 1];
  return { ...current, draft, history: current.history.slice(0, -1), revision: current.revision + 1 };
});

const replaceWriteDraft = (draft, { historyMode = "push" } = {}) => {
  setWriteSession((current) => replaceDraftInSession(current, draft, { historyMode }));
};

const loadWriteProgression = (chords, sectionName = "Section") => {
  const next = createDraft({
    id: writeDraft?.id || nextWriteId("draft"),
    name: writeDraft?.name || "Untitled",
    key: activeKey,
    sections: [{ id: nextWriteId("section"), name: sectionName, chords: chords.map((ch) => ({ id: nextWriteId("chord"), symbol: chordSymbol(ch) })) }],
    lyrics: writeDraft?.lyrics || "",
    savedAt: writeDraft?.savedAt || 0,
  });
  replaceWriteDraft(next, { historyMode: "push" });
};
```

Keep existing `loadProgression` for Coverize/Mirror. In Write, Chord Lab emits `targetSlotId`; translate its suggestion with `suggestionToCompositionOp`. Deep requests capture `{ draftId, revision, targetSlotId }` and discard responses when any field no longer matches. Valid Deep candidates are revalidated through `validateSuggestionEvidence`, deduplicated by same-sounding chord sequence, and shown below offline results. Hum emits symbols and an explicit append/replace choice to `editWriteDraft`.

Pass `onReplaceDraft={replaceWriteDraft}` to WriteDesk. Spark calls it with `{ historyMode: "push" }`; opening a saved v2 draft or adapted legacy sketch calls it with `{ historyMode: "reset" }`. The RED `replaceDraftInSession` test from Task 1 proves both paths update selection/history/revision atomically before this wiring lands.

Use `activeSheet` anywhere the active document is read, but do not copy its derived text back into `sheet`. This prevents two writable truths.

- [ ] **Step 4: Run focused integration and music tests**

Run: `npx vitest run src/components/ChordLab.test.jsx src/components/HumHarmony.test.jsx src/lib/composition.test.js src/lib/suggest.test.js src/lib/voicing.test.js src/lib/midi.test.js`

Expected: PASS. Existing Song Coverize and Mirror call sites still compile.

- [ ] **Step 5: Commit**

```powershell
git add src/App.jsx src/components/ChordLab.jsx src/components/ChordLab.test.jsx src/components/HumHarmony.jsx src/components/HumHarmony.test.jsx
git commit -m "refactor(write): make the draft the canonical progression"
```

---

### Task 6: Write Desk Hierarchy, Save/Reopen, and Full Verification

**Files:**
- Modify: `src/components/WriteDesk.jsx`
- Create: `src/components/WriteDesk.test.jsx`
- Modify: `src/components/MirrorPanel.jsx`
- Modify: `src/App.jsx:1153-1175`
- Modify: `src/ui/bench.css`

**Interfaces:**
- Consumes: `draft`, `onEdit`, `onReplaceDraft`, `onAudition`, derived voicings, and `draftBook`.
- Produces exact save/open behavior and a composer-first Write room.

- [ ] **Step 1: Write failing save/reopen and tool-consistency tests**

```jsx
// @vitest-environment jsdom
it("saves and reopens the exact visible draft, including repeats and lyrics", () => {
  const book = createDraftBook(fakeBackend());
  const onReplaceDraft = vi.fn();
  render(<WriteDesk draft={draftWithRepeats} book={book} onEdit={() => {}} onReplaceDraft={onReplaceDraft} voicings={[]} activeKey={draftWithRepeats.key} />);
  fireEvent.click(screen.getByRole("button", { name: /keep sketch/i }));
  const saved = book.list()[0];
  expect(deriveProgression(saved).progression.map((c) => c.raw)).toEqual(["C", "C", "F", "G7"]);
  fireEvent.click(screen.getByRole("button", { name: saved.name }));
  expect(onReplaceDraft).toHaveBeenCalledWith(expect.objectContaining({ id: saved.id, lyrics: saved.lyrics }), { historyMode: "reset" });
});

it("Reverse dispatches section/reverse", () => {
  const onEdit = vi.fn();
  render(<WriteDesk draft={draftWithRepeats} onEdit={onEdit} onReplaceDraft={() => {}} voicings={[[48, 52, 55], [48, 52, 55], [53, 57, 60], [55, 59, 62]]} activeKey={draftWithRepeats.key} />);
  fireEvent.click(screen.getByRole("button", { name: /reverse the section/i }));
  expect(onEdit).toHaveBeenCalledWith({ type: "section/reverse", sectionId: "verse" });
});

it("exports MIDI from the exact derived voicing order", () => {
  const voicings = [[48, 52, 55], [48, 52, 55], [53, 57, 60], [55, 59, 62]];
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<WriteDesk draft={draftWithRepeats} onEdit={() => {}} onReplaceDraft={() => {}} voicings={voicings} activeKey={draftWithRepeats.key} tempoMs={1000} />);
  fireEvent.click(screen.getByRole("button", { name: /export .mid/i }));
  expect(midiBlob).toHaveBeenCalledWith(voicings, expect.objectContaining({ beatsPerChord: 2 }));
});

it("Spark replaces the canonical draft instead of writing Lab state", () => {
  generateProgression.mockReturnValue({ name: "I-V-vi-IV", chords: ["C", "G", "Am", "F"].map(parseChord) });
  const onReplaceDraft = vi.fn();
  render(<WriteDesk draft={draftWithRepeats} onEdit={() => {}} onReplaceDraft={onReplaceDraft} voicings={[]} activeKey={draftWithRepeats.key} />);
  fireEvent.click(screen.getByRole("button", { name: /^Spark$/i }));
  expect(onReplaceDraft).toHaveBeenCalledWith(expect.objectContaining({ sections: [expect.objectContaining({ chords: expect.arrayContaining([expect.objectContaining({ symbol: "C" })]) })] }), { historyMode: "push" });
});
```

At the top of `WriteDesk.test.jsx`, mock `midiBlob` from `../lib/midi.js` and `generateProgression` from `../lib/generate.js` with Vitest module mocks, then import the mocked functions for the assertions above. This makes MIDI/Spark coverage executable rather than inferring behavior from a button click.

- [ ] **Step 2: Run the Write Desk test and verify RED**

Run: `npx vitest run src/components/WriteDesk.test.jsx`

Expected: FAIL because WriteDesk still consumes `sheet` and the legacy `library`.

- [ ] **Step 3: Rebuild WriteDesk around the controlled draft**

Change the prop contract to:

```js
{
  draft, selection, spelling, book = draftBook,
  activeKey, voicings, tempoMs,
  revision, canUndo, onEdit, onUndo, onSelect, onReplaceDraft,
  onImport, onPlay, onAudition,
  midiSupported, midiOutputs, midiOutId, onPickMidiOut, onRefreshMidi,
}
```

Render order:

1. compact One Song Timer;
2. `ProgressionComposer`;
3. draft name + Keep Sketch + saved v2 drafts and legacy recovery imports;
4. collapsed `<details className="write-drawer">` groups for Words, Record/Melody, Exercises, and DAW/Import.

Spark calls `generateProgression` and `onReplaceDraft(createDraft(...), { historyMode: "push" })`; it does not call global `loadProgression`. Reverse dispatches `section/reverse` for the selected section. The lyric pad dispatches `draft/lyrics`. Save writes `{ ...draft, savedAt: nowStamp() }` through `draftBook`. Loading a saved v2 or adapted legacy sketch calls `onReplaceDraft(next, { historyMode: "reset" })`; legacy opening never deletes the v1 record.

Update MirrorPanel's sketch source to one record type:

```js
const mirrorSketches = [
  ...draftBook.list().map((draft) => ({ id: `draft:${draft.id}`, name: draft.name, sheet: serializeDraft(draft), lyrics: draft.lyrics || "", source: "draft" })),
  ...library.list().map((sketch) => ({ id: `legacy:${sketch.id}`, name: sketch.name, sheet: sketch.sheet || "", lyrics: sketch.lyrics || "", source: "legacy" })),
];
```

Filter legacy records whose deterministic migrated draft ID already exists so a sketch is counted once. Mirror continues to consume `.sheet` from this normalized evidence shape.

- [ ] **Step 4: Run all Write-focused tests**

Run:

```powershell
npx vitest run src/lib/composition.test.js src/lib/composerSuggestions.test.js src/storage.test.js
npx vitest run src/components/ProgressionComposer.test.jsx src/components/WriteDesk.test.jsx src/components/ChordLab.test.jsx src/components/HumHarmony.test.jsx
```

Expected: PASS with exact repeat order and no stale Deep mutation.

- [ ] **Step 5: Run the full automated gates**

Run: `npm test`

Expected: all suites pass with zero failures.

Run: `npm run build`

Expected: Vite production build exits 0; no runtime dependency was added.

- [ ] **Step 6: Browser smoke the Write room**

Run: `npm run dev`

Verify at desktop and narrow mobile widths:

1. Enter Write and build `Verse: C C F G7` using In key plus Any chord.
2. Add Chorus and Bridge, reorder with pointer and keyboard, duplicate a chord, delete and Undo.
3. Exercise all five intents; every card auditions and applies to the intended stable slot.
4. Change key/mode and confirm names, Nashville/Roman numbers, playback, and MIDI all follow the same draft.
5. Spark, Reverse, Hum-to-Harmony, and Chord Lab change the visible draft and the saved result identically.
6. Save, leave Write for Piano, return, and reopen; exact sections, repeats, words, rail, and voicings survive.
7. Disable the AI proxy and confirm offline suggestions remain complete.
8. Keyboard-only editing has visible focus; reduced motion has no smooth strip animation.

- [ ] **Step 7: Commit**

```powershell
git add src/components/WriteDesk.jsx src/components/WriteDesk.test.jsx src/components/MirrorPanel.jsx src/App.jsx src/ui/bench.css
git commit -m "feat(write): finish the section-aware songwriting desk"
```

---

## Plan Completion Gate

Before calling the Write plan complete:

- Re-read `docs/superpowers/specs/2026-07-21-setlist-perform-write-design.md` and check every Write requirement against Tasks 1–6.
- Run `git diff --check` and confirm only intended files changed.
- Run `npm test` and `npm run build` fresh.
- Confirm no Write flow still writes `labProg`, saves the base `sheet`, or passes a draft progression through `parseSheet`.
- Confirm old `keylit.songs.v1` data remains present and readable.
- Record exact test counts and any browser-only residual risk in the handoff.
