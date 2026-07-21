# Handwritten Setlists and Continuous Perform Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Bench Book into a handwritten, entry-based setlist and add a separate Perform Set mode that continuously loads each full chord/tab chart without changing the normal Song-opening behavior.

**Architecture:** Normalize the existing flat `keylit.bench.v1` data into a flat `keylit.bench.v2` envelope whose setlist rows have stable entry IDs. Keep the v1 data as read-only fallback. Build performance pages through pure functions, then let a dedicated run controller load and cache pages by an exact music/setup key while a reusable page component renders one complete chart at a time.

**Tech Stack:** React 18, Vite 6, Vitest 2, existing corpus/user-song loaders, existing pure chart/retab modules, React Testing Library/jsdom added by the Write plan, and a self-hosted OFL-licensed Caveat face.

## Global Constraints

- Clicking a handwritten title always opens the ordinary Song room.
- `Perform set` is an explicit separate action; it must not overload ordinary Song navigation.
- A setlist row is an occurrence, not a unique song. Repeated songs are allowed and every occurrence has its own `entryId` and note.
- Persist the exact flat envelope `{ version: 2, setlists, log }` at `keylit.bench.v2`; do not add a second nested schema.
- Read v2 first, fall back to v1 only when v2 is absent/invalid, and never delete or rewrite `keylit.bench.v1` during migration.
- Existing backup format remains `keylit: 2`; sanitize both legacy `songs` rows and v2 `entries` rows into the v2 entry shape.
- A performance page key is exactly `entryId + sheet hash + target tuning + target capo + transpose`.
- Retab output belongs to one keyed page. A late result for an old key is discarded.
- Continuous scroll may preload the next page, but it must not auto-start audio or share one global play cursor across pages.
- Fullscreen targets the complete Perform Set stage, not a single chart slab.
- Keep the current semantic accent palette and dark performance surface. The handwritten treatment belongs to the paper setlist only.
- Accessibility, touch targets, keyboard operation, print, reduced motion, and graceful song-load errors are release gates.
- Follow red-green-refactor. Each task ends with focused tests and a commit.

---

## File Structure

### Create

- `src/lib/setlists.js` — v1/v2 setlist normalization and immutable entry operations.
- `src/lib/setlists.test.js` — migration, repeat, entry-note, and undo invariants.
- `src/lib/performpage.js` — exact page keys, immutable page models, and stale-load reducer.
- `src/lib/performpage.test.js` — page-key and request-race invariants.
- `src/songloader.js` — non-navigating source resolver plus latest-only normal-song request controller.
- `src/songloader.test.js` — concrete source identity and out-of-order acceptance tests.
- `src/components/SetlistPaper.jsx` — controlled handwritten paper sheet.
- `src/components/SetlistPaper.test.jsx` — normal-open, entry operations, and accessible controls.
- `src/components/PerformSongPage.jsx` — one full performance page and its status boundary.
- `src/components/PerformSet.test.jsx` — continuous load/observer/Walk/fullscreen behavior.
- `public/fonts/Caveat-Variable.woff2` — self-hosted handwriting face from the official Google Fonts Caveat distribution.
- `public/fonts/Caveat-OFL.txt` — upstream SIL Open Font License text shipped with the font.

### Modify

- `src/storage.js` — entry-based v2 Bench Book with v1 fallback.
- `src/storage.test.js` — v2 envelope, repeated songs, restore, and v1 preservation.
- `src/lib/backup.js` — whitelist v2 entry fields and accept legacy setlist rows.
- `src/lib/backup.test.js` — repeat/order/note preservation and named local-wins report.
- `src/components/BenchBook.jsx` — use `SetlistPaper` and expose separate normal/performance actions.
- `src/components/AddToSetlist.jsx` — add a new occurrence instead of deduping by song key.
- `src/components/Library.jsx` — batch-add entry occurrences and keep destination behavior.
- `src/components/Perform.jsx` — single-song/continuous-run shell and run-owned Walk controls.
- `src/components/PerformChart.jsx` — keep reusable chart rendering page-scoped.
- `src/App.jsx` — race-safe song resolution, explicit `startPerformSet`, and Perform Set state.
- `src/ui/bench.css` — handwritten paper, print repair, continuous stage, mobile, focus, and reduced motion.

---

### Task 1: Pure Setlist Entry Model

**Files:**
- Create: `src/lib/setlists.js`
- Create: `src/lib/setlists.test.js`
- Read: `src/lib/bench.js`, `src/storage.js:68-140`

**Interfaces:**

```js
normalizeSetlistEntry(value, { setlistId, index, makeId })
normalizeSetlist(value, { makeId })
normalizeBenchState(value, { makeId })
addEntry(state, setlistId, song, { makeId })
updateEntry(state, setlistId, entryId, patch)
moveEntry(state, setlistId, entryId, toIndex)
removeEntry(state, setlistId, entryId) // => { state, removed: { entry, index } | null }
restoreEntry(state, setlistId, entry, index)
```

The normalized row is exactly:

```js
{
  entryId,
  songKey,
  source: string | null,
  id: string | null,
  title,
  artist: string | null,
  key: string | null,
  note: string,
  tuning: string | null,
  capo: number | null,
}
```

- [ ] **Step 1: Write failing migration and occurrence tests**

```js
import { describe, expect, it } from "vitest";
import {
  addEntry, moveEntry, normalizeBenchState, removeEntry, restoreEntry, updateEntry,
} from "./setlists.js";

const ids = (() => { let n = 0; return () => `entry-${++n}`; })();
const legacy = {
  setlists: [{ id: "sl", name: "Open mic", songs: [
    { songKey: "user:a", source: "user", id: "a", title: "Closer", artist: null, key: "C", capo: 0 },
    { songKey: "user:a", source: "user", id: "a", title: "Closer", artist: null, capo: 0 },
  ], notes: "short set", createdAt: 1 }],
  log: [],
};

describe("setlist entries", () => {
  it("migrates legacy songs to distinct stable occurrences and preserves capo zero", () => {
    const state = normalizeBenchState(legacy, { makeId: ids });
    const entries = state.setlists[0].entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].entryId).not.toBe(entries[1].entryId);
    expect(entries.map((entry) => entry.capo)).toEqual([0, 0]);
    expect(entries[0].key).toBe("C");
    expect(state.setlists[0].songs).toBeUndefined();
    expect(normalizeBenchState(state, { makeId: ids })).toEqual(state);
  });

  it("retains a title/songKey-only legacy row as unresolved evidence", () => {
    const state = normalizeBenchState({ setlists: [{ id: "sl", name: "Old", songs: [{ songKey: "old:key", title: "Still Here" }] }], log: [] }, { makeId: ids });
    expect(state.setlists[0].entries[0]).toMatchObject({ songKey: "old:key", title: "Still Here", source: null, id: null });
  });

  it("adds the same song twice and edits only the targeted occurrence", () => {
    let state = normalizeBenchState({ version: 2, setlists: [{ id: "sl", name: "Set", entries: [] }], log: [] }, { makeId: ids });
    state = addEntry(state, "sl", { songKey: "user:a", source: "user", id: "a", title: "Closer" }, { makeId: ids });
    state = addEntry(state, "sl", { songKey: "user:a", source: "user", id: "a", title: "Closer" }, { makeId: ids });
    const [first, second] = state.setlists[0].entries;
    state = updateEntry(state, "sl", second.entryId, { note: "drop to D" });
    expect(state.setlists[0].entries.map((entry) => entry.note)).toEqual(["", "drop to D"]);
    expect(first.entryId).not.toBe(second.entryId);
  });

  it("moves, removes, and restores by entry id without disturbing repeats", () => {
    let state = normalizeBenchState(legacy, { makeId: ids });
    const [first, second] = state.setlists[0].entries;
    state = moveEntry(state, "sl", second.entryId, 0);
    expect(state.setlists[0].entries[0].entryId).toBe(second.entryId);
    const out = removeEntry(state, "sl", first.entryId);
    expect(out.removed.index).toBe(1);
    state = restoreEntry(out.state, "sl", out.removed.entry, out.removed.index);
    expect(state.setlists[0].entries.map((entry) => entry.entryId)).toEqual([second.entryId, first.entryId]);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/lib/setlists.test.js`

Expected: FAIL because `src/lib/setlists.js` does not exist.

- [ ] **Step 3: Implement deterministic normalization and immutable operations**

Use `value.capo ?? null`, never `value.capo || null`. If a v2 row already has a non-empty `entryId`, keep it. Legacy deterministic fallback IDs use `legacy-${setlistId}-${index}-${slugSongKey(row)}`; if that collides inside the same setlist, append `-${occurrence}`. Runtime adds receive `makeId("entry")` from storage/UI.

Rows with `title` plus `source` and `id` remain directly resolvable. A legacy row that has only `songKey` and `title` remains as an unresolved entry with `source: null` and `id: null`; it stays visible, printable, reorderable, and recoverable instead of disappearing. Whitelist only the fields in the row shape. Preserve setlist `id`, `name`, `notes`, and `createdAt`. Pure operations return the original state for absent IDs, boundary indexes, unchanged indexes, or invalid patches. `updateEntry` accepts only `note`, `key`, `tuning`, and `capo`.

- [ ] **Step 4: Run pure setlist and bench tests**

Run: `npx vitest run src/lib/setlists.test.js src/lib/bench.test.js`

Expected: PASS with repeated occurrences retained.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/setlists.js src/lib/setlists.test.js
git commit -m "feat(setlists): add stable entry model"
```

---

### Task 2: V2 Bench Storage with V1 Fallback

**Files:**
- Modify: `src/storage.js:68-140`
- Modify: `src/storage.test.js:48-108`
- Test: `src/storage.test.js`

**Interfaces:**

```js
createBenchBook(backend, { makeId = defaultId, now = Date.now } = {})
```

Existing public APIs remain, with these entry-based signatures:

```js
addToSetlist(setlistId, song) // => created entry
setEntryNote(setlistId, entryId, note)
moveInSetlist(setlistId, entryId, toIndex)
removeFromSetlist(setlistId, entryId) // => { entry, index } | null
restoreToSetlist(setlistId, entry, index)
raw() // normalized `{ version: 2, setlists, log }` for backup export
```

- [ ] **Step 1: Replace index/song-key expectations with failing entry-ID tests**

First make the storage-test backend key-aware so this plan runs independently:

```js
function fakeBackend(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? "",
    setItem: (key, value) => data.set(key, value),
    snapshot: () => Object.fromEntries(data),
  };
}
const sequenceIds = () => { let n = 0; return (prefix = "id") => `${prefix}-${++n}`; };
```

```js
it("writes a flat v2 envelope while leaving v1 untouched", () => {
  const v1 = JSON.stringify({ setlists: [{ id: "old", name: "Old", songs: [] }], log: [] });
  const be = fakeBackend({ "keylit.bench.v1": v1 });
  const bb = createBenchBook(be, { makeId: sequenceIds(), now: () => 20 });
  const made = bb.createSetlist("New", 20);
  bb.addToSetlist(made.id, { songKey: "user:a", source: "user", id: "a", title: "A", capo: 0 });
  const stored = JSON.parse(be.snapshot()["keylit.bench.v2"]);
  expect(stored.version).toBe(2);
  expect(stored.setlists.find((item) => item.id === made.id).entries[0].capo).toBe(0);
  expect(be.snapshot()["keylit.bench.v1"]).toBe(v1);
});

it("removes and restores one repeated occurrence", () => {
  const bb = createBenchBook(fakeBackend(), { makeId: sequenceIds(), now: () => 1 });
  const sl = bb.createSetlist("Set", 1);
  const first = bb.addToSetlist(sl.id, songA);
  const second = bb.addToSetlist(sl.id, songA);
  const removed = bb.removeFromSetlist(sl.id, first.entryId);
  expect(bb.setlists()[0].entries.map((entry) => entry.entryId)).toEqual([second.entryId]);
  bb.restoreToSetlist(sl.id, removed.entry, removed.index);
  expect(bb.setlists()[0].entries.map((entry) => entry.entryId)).toEqual([first.entryId, second.entryId]);
});
```

- [ ] **Step 2: Run storage tests and verify RED**

Run: `npx vitest run src/storage.test.js`

Expected: FAIL because storage still uses `keylit.bench.v1`, `songs`, indexes, and song-key removal.

- [ ] **Step 3: Implement the v2 reader/writer and compatibility boundary**

Read `keylit.bench.v2`; if missing, invalid JSON, wrong version, or structurally invalid, normalize `keylit.bench.v1` in memory. Every mutation writes `{ version: 2, setlists, log }` only to `keylit.bench.v2`. Existing `raw()` returns normalized v2 data so Library backup export does not break; `restore(state)` normalizes before writing. Do not silently persist merely by calling `setlists()`, `log()`, or `raw()`.

Pass all row mutations through Task 1. `createSetlist` uses injected `makeId("setlist")` rather than array length, stores injected `now()`, and returns the created setlist. Return created/removed entries so the UI can restore them. Existing practice-log behavior and caps remain unchanged.

- [ ] **Step 4: Run storage, setlist, and backup neighbors**

Run: `npx vitest run src/storage.test.js src/lib/setlists.test.js src/lib/backup.test.js`

Expected: PASS; backup tests may still exercise legacy `songs` until Task 3.

- [ ] **Step 5: Commit**

```powershell
git add src/storage.js src/storage.test.js
git commit -m "feat(setlists): migrate the bench book to v2 entries"
```

---

### Task 3: Backup Compatibility and Named Merge Reporting

**Files:**
- Modify: `src/lib/backup.js:17-160`
- Modify: `src/lib/backup.test.js`

**Interfaces:**
- Backup envelope stays `{ keylit: 2, songs, setlists, log, prefs, exportedAt }`.
- `cleanSetlist` accepts `setlist.entries` or legacy `setlist.songs` and emits `entries` only.
- `mergeBackup` remains local-wins by setlist ID and adds `report.setlistNamesSkipped`.

- [ ] **Step 1: Write failing compatibility and report tests**

```js
it("normalizes legacy songs and v2 entries without dropping repeats or per-entry notes", () => {
  const parsed = parseBackup({ keylit: 2, songs: [], setlists: [{
    id: "sl", name: "Tonight", songs: [
      { songKey: "user:a", source: "user", id: "a", title: "A", key: "Eb", capo: 0 },
      { songKey: "user:a", source: "user", id: "a", title: "A", note: "encore" },
    ],
  }] });
  expect(parsed.ok).toBe(true);
  expect(parsed.data.setlists[0].entries).toHaveLength(2);
  expect(parsed.data.setlists[0].entries[0].capo).toBe(0);
  expect(parsed.data.setlists[0].entries[0].key).toBe("Eb");
  expect(parsed.data.setlists[0].entries[1].note).toBe("encore");
});

it("names local-wins setlists skipped during merge", () => {
  const incoming = { songs: [], setlists: [{ id: "same", name: "Incoming", entries: [] }], log: [], prefs: {} };
  const current = { songs: [], setlists: [{ id: "same", name: "My Open Mic", entries: [] }], log: [] };
  const out = mergeBackup(current, incoming);
  expect(out.report.setlistNamesSkipped).toEqual(["My Open Mic"]);
  expect(reportLine(out.report)).toMatch(/My Open Mic/);
});

it("normalizes a backup containing legacy and v2 setlists in one file", () => {
  const parsed = parseBackup({ keylit: 2, songs: [], setlists: [
    { id: "old", name: "Old", songs: [{ songKey: "legacy:key", title: "Legacy" }] },
    { id: "new", name: "New", entries: [{ entryId: "e", songKey: "user:a", source: "user", id: "a", title: "A", key: "F#", capo: 0, note: "count four" }] },
  ] });
  expect(parsed.ok).toBe(true);
  expect(parsed.data.setlists.map((setlist) => setlist.entries.length)).toEqual([1, 1]);
  expect(parsed.data.setlists[1].entries[0]).toMatchObject({ key: "F#", capo: 0, note: "count four" });
});
```

- [ ] **Step 2: Run backup tests and verify RED**

Run: `npx vitest run src/lib/backup.test.js`

Expected: FAIL because `cleanSetlist` emits `songs` and the report has counts only.

- [ ] **Step 3: Implement strict sanitization**

Reuse `normalizeSetlist` with a deterministic backup ID factory. Before normalization, whitelist setlist fields and cap entry count using the current backup limits. Never retain unknown object keys. A crafted `entryId` is accepted only when it is a bounded string; missing/colliding IDs are deterministically replaced. Preserve order and repeated songs.

For local-wins collisions, push the retained local setlist name into `setlistNamesSkipped`. Keep the existing numeric `setlistsSkipped` for compatibility, and append the bounded names to `reportLine`.

- [ ] **Step 4: Run storage and backup gates**

Run: `npx vitest run src/lib/backup.test.js src/storage.test.js src/lib/setlists.test.js`

Expected: PASS for both legacy and v2 backup fixtures.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/backup.js src/lib/backup.test.js
git commit -m "fix(setlists): preserve v2 entries through backup"
```

---

### Task 4: Handwritten Setlist Paper and Normal Song Opening

**Files:**
- Create: `src/components/SetlistPaper.jsx`
- Create: `src/components/SetlistPaper.test.jsx`
- Modify: `src/components/BenchBook.jsx`
- Modify: `src/components/AddToSetlist.jsx`
- Modify: `src/components/Library.jsx`
- Modify: `src/ui/bench.css:262-280`
- Add: `public/fonts/Caveat-Variable.woff2`, `public/fonts/Caveat-OFL.txt`

**Controlled component contract:**

```jsx
<SetlistPaper
  setlist={active}
  onOpenSong={(entry, context) => {}}
  onPerformSet={(setlist) => {}}
  onRunFrom={(setlist, entryId) => {}}
  onMarkPracticed={(entry) => {}}
  searchResults={[]}
  onSearch={(query) => {}}
  onAppendSong={(song) => {}}
  onRename={(name) => {}}
  onDeleteSetlist={(setlistId) => {}}
  onSetNotes={(notes) => {}}
  onSetEntryNote={(entryId, note) => {}}
  onMove={(entryId, toIndex) => {}}
  onRemove={(entryId) => {}}
  onRestore={(entry, index) => {}}
/>
```

- [ ] **Step 1: Add the official font assets and license**

Download the variable Caveat face and its OFL text from the official `googlefonts/caveat` distribution. Verify the font file opens as WOFF2 and the license begins with `SIL OPEN FONT LICENSE Version 1.1`. Do not fetch the font at runtime.

- [ ] **Step 2: Write failing paper interaction tests**

```jsx
// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "../test/render.js";
import SetlistPaper from "./SetlistPaper.jsx";

const setlist = { id: "sl", name: "Open mic", notes: "10 minutes", entries: [
  { entryId: "e1", songKey: "user:a", source: "user", id: "a", title: "First", artist: "Tyler", note: "capo 2" },
  { entryId: "e2", songKey: "user:a", source: "user", id: "a", title: "First", artist: "Tyler", note: "encore" },
] };

it("opens a handwritten title in normal Song context", () => {
  const onOpenSong = vi.fn();
  render(<SetlistPaper setlist={setlist} onOpenSong={onOpenSong} onPerformSet={() => {}} onRunFrom={() => {}} onMarkPracticed={() => {}} searchResults={[]} onSearch={() => {}} onAppendSong={() => {}} onRename={() => {}} onSetNotes={() => {}} onSetEntryNote={() => {}} onMove={() => {}} onRemove={() => {}} onRestore={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: /open First in Song/i })[1]);
  expect(onOpenSong).toHaveBeenCalledWith(setlist.entries[1], { name: "Open mic", rows: setlist.entries, idx: 1 });
});

it("starts the complete set or a selected entry only from explicit run controls", () => {
  const onPerformSet = vi.fn(), onRunFrom = vi.fn();
  render(<SetlistPaper setlist={setlist} onOpenSong={() => {}} onPerformSet={onPerformSet} onRunFrom={onRunFrom} onMarkPracticed={() => {}} searchResults={[]} onSearch={() => {}} onAppendSong={() => {}} onRename={() => {}} onSetNotes={() => {}} onSetEntryNote={() => {}} onMove={() => {}} onRemove={() => {}} onRestore={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /perform set/i }));
  expect(onPerformSet).toHaveBeenCalledWith(setlist);
  fireEvent.click(within(screen.getByTestId("setlist-entry-e2")).getByRole("button", { name: /run from here/i }));
  expect(onRunFrom).toHaveBeenCalledWith(setlist, "e2");
});

it("edits and removes by occurrence id, then offers an undo", () => {
  const onSetEntryNote = vi.fn(), onRemove = vi.fn(() => ({ entry: setlist.entries[1], index: 1 })), onRestore = vi.fn();
  render(<SetlistPaper setlist={setlist} onOpenSong={() => {}} onPerformSet={() => {}} onRunFrom={() => {}} onMarkPracticed={() => {}} searchResults={[]} onSearch={() => {}} onAppendSong={() => {}} onRename={() => {}} onSetNotes={() => {}} onSetEntryNote={onSetEntryNote} onMove={() => {}} onRemove={onRemove} onRestore={onRestore} />);
  fireEvent.change(screen.getByLabelText("note for setlist item 2, First"), { target: { value: "last song" } });
  expect(onSetEntryNote).toHaveBeenCalledWith("e2", "last song");
  fireEvent.click(within(screen.getByTestId("setlist-entry-e2")).getByRole("button", { name: /remove/i }));
  expect(onRemove).toHaveBeenCalledWith("e2");
  fireEvent.click(screen.getByRole("button", { name: /undo remove/i }));
  expect(onRestore).toHaveBeenCalledWith(setlist.entries[1], 1);
});

it("appends from the blank ruled library line and marks one occurrence practiced", () => {
  const onSearch = vi.fn(), onAppendSong = vi.fn(), onMarkPracticed = vi.fn();
  const result = { source: "user", id: "b", title: "Second", artist: "Tyler" };
  render(<SetlistPaper setlist={setlist} onOpenSong={() => {}} onPerformSet={() => {}} onRunFrom={() => {}} onMarkPracticed={onMarkPracticed} searchResults={[result]} onSearch={onSearch} onAppendSong={onAppendSong} onRename={() => {}} onSetNotes={() => {}} onSetEntryNote={() => {}} onMove={() => {}} onRemove={() => {}} onRestore={() => {}} />);
  fireEvent.change(screen.getByLabelText(/search library to append/i), { target: { value: "Sec" } });
  expect(onSearch).toHaveBeenCalledWith("Sec");
  fireEvent.click(screen.getByRole("button", { name: /append Second/i }));
  expect(onAppendSong).toHaveBeenCalledWith(result);
  fireEvent.click(within(screen.getByTestId("setlist-entry-e1")).getByRole("button", { name: /mark practiced/i }));
  expect(onMarkPracticed).toHaveBeenCalledWith(setlist.entries[0]);
});

it("reorders occurrences by pointer drag through the same stable-ID operation", () => {
  const onMove = vi.fn();
  const data = new Map();
  const dataTransfer = { setData: (type, value) => data.set(type, value), getData: (type) => data.get(type), effectAllowed: "move" };
  render(<SetlistPaper setlist={setlist} onOpenSong={() => {}} onPerformSet={() => {}} onRunFrom={() => {}} onMarkPracticed={() => {}} searchResults={[]} onSearch={() => {}} onAppendSong={() => {}} onRename={() => {}} onSetNotes={() => {}} onSetEntryNote={() => {}} onMove={onMove} onRemove={() => {}} onRestore={() => {}} />);
  fireEvent.dragStart(screen.getByRole("button", { name: /drag setlist item 2/i }), { dataTransfer });
  fireEvent.dragOver(screen.getByTestId("setlist-entry-e1"), { dataTransfer });
  fireEvent.drop(screen.getByTestId("setlist-entry-e1"), { dataTransfer });
  expect(onMove).toHaveBeenCalledWith("e2", 0);
});

it("requires a named confirmation before deleting the whole setlist", () => {
  const onDeleteSetlist = vi.fn();
  render(<SetlistPaper setlist={setlist} onOpenSong={() => {}} onPerformSet={() => {}} onRunFrom={() => {}} onMarkPracticed={() => {}} searchResults={[]} onSearch={() => {}} onAppendSong={() => {}} onRename={() => {}} onDeleteSetlist={onDeleteSetlist} onSetNotes={() => {}} onSetEntryNote={() => {}} onMove={() => {}} onRemove={() => {}} onRestore={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /delete Open mic/i }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Open mic");
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect(onDeleteSetlist).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /delete Open mic/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
  expect(onDeleteSetlist).toHaveBeenCalledWith("sl");
});
```

- [ ] **Step 3: Run the component test and verify RED**

Run: `npx vitest run src/components/SetlistPaper.test.jsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Build the paper and replace the conventional row UI**

The paper uses ruled horizontal lines, a quiet left margin, numbered handwritten titles, compact circled key/capo/tuning annotations, a short note line per occurrence, and one larger set note. Controls appear on hover/focus without turning every row into a card. Each row has a pointer drag handle using entry-ID payloads and drop-to-index operations; up/down buttons and Alt+Arrow call the same `onMove(entryId, toIndex)` path. Add an interaction test that drags `e2` onto the first row and expects `onMove("e2", 0)`. Removing sets a local undo record until the next mutation or unmount.

The bottom rule contains the controlled Library search and append results. `Run from here`, `Mark practiced`, `Open`, and `Remove` are explicit accessible controls. Deleting a whole setlist opens a confirmation dialog naming the setlist; cancellation is tested and must leave storage unchanged.

Bench Book renames the Practice tab to `Setlists`, gives the paper the full primary column, and moves Cold Shelf and Recent Passes below it. On small screens the song title and notes switch to the normal sans/mono fonts when Caveat would reduce legibility. Do not add randomized jitter, torn edges, image-rendered text, or a stack of entry cards.

BenchBook passes `onOpen={onOpenSong}` unchanged for title clicks and receives required `onPerformSet`/`onRunFrom` callbacks. Its blank-line search never filters out a song already present. AddToSetlist and Library always call `addToSetlist` and show confirmation for the new occurrence; do not test membership by `songKey` and do not disable a song already present.

Add:

```css
@font-face {
  font-family: "Caveat";
  src: url("/fonts/Caveat-Variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}

.setlist-paper { background: var(--kl-paper); border: 1px solid var(--kl-line); box-shadow: 0 14px 35px rgba(30, 24, 15, .09); padding: clamp(22px, 4vw, 46px); transform: rotate(-.15deg); }
.setlist-paper__title, .setlist-paper__song { font-family: "Caveat", "Segoe Print", cursive; }
.setlist-paper__song { font-size: clamp(1.5rem, 3vw, 2.1rem); line-height: 1.05; }
.setlist-paper__row:focus-within .setlist-paper__controls,
.setlist-paper__row:hover .setlist-paper__controls { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .setlist-paper { transform: none; } }
```

Repair print by hiding ordinary descendants with `visibility`, not by `display:none` on `.kl-app`, because `.kl-printonly` is inside it:

```css
@media print {
  body * { visibility: hidden !important; }
  .kl-printonly, .kl-printonly * { visibility: visible !important; }
  .kl-printonly { display: block; position: absolute; inset: 0; padding: 24px; }
}
```

- [ ] **Step 5: Run setlist UI and persistence tests**

Run: `npx vitest run src/components/SetlistPaper.test.jsx src/storage.test.js src/lib/setlists.test.js`

Expected: PASS with two occurrences of one song independently editable.

- [ ] **Step 6: Commit**

```powershell
git add public/fonts/Caveat-Variable.woff2 public/fonts/Caveat-OFL.txt src/components/SetlistPaper.jsx src/components/SetlistPaper.test.jsx src/components/BenchBook.jsx src/components/AddToSetlist.jsx src/components/Library.jsx src/ui/bench.css
git commit -m "feat(setlists): build the handwritten bench sheet"
```

---

### Task 5: Pure Perform Page Keys and Race-Safe Load State

**Files:**
- Create: `src/lib/performpage.js`
- Create: `src/lib/performpage.test.js`
- Read: `src/lib/retab.js`, `src/components/RetabPanel.jsx`, `src/components/PerformChart.jsx`

**Interfaces:**

```js
sheetHash(sheet) // deterministic non-cryptographic content hash
performancePageKey({ entryId, sheet, tuning, capo, transpose })
buildPerformPage({ entry, loaded, sheet, outline, progression, anchors, activeKey, keyName, retab, tuning, capo, transpose })
createPerformRun(setlist, { tuning, capo, transpose, startEntryId, runId })
requestPerformPage(run, { runId, index, requestId })
acceptPerformPage(run, { runId, index, requestId, page })
failPerformPage(run, { runId, index, requestId, message })
activePageIndex(run, visibleEntryId)
```

- [ ] **Step 1: Write failing key and stale-result tests**

```js
import { describe, expect, it } from "vitest";
import {
  acceptPerformPage, buildPerformPage, createPerformRun, performancePageKey, requestPerformPage,
} from "./performpage.js";

const entry = { entryId: "e1", source: "user", id: "a", title: "A" };

it("keys a page by occurrence, source sheet, and exact performance setup", () => {
  const base = { entryId: "e1", sheet: "C G", tuning: "standard", capo: 0, transpose: 0 };
  expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, entryId: "e2" }));
  expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, sheet: "C F" }));
  expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, tuning: "dropD" }));
  expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, capo: 2 }));
  expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, transpose: 1 }));
});

it("discards a late completion from an older request", () => {
  let run = createPerformRun({ id: "sl", name: "Set", entries: [entry] }, { tuning: "standard", capo: 0, transpose: 0, runId: "run-1" });
  run = requestPerformPage(run, { runId: "run-1", index: 0, requestId: "request-old" });
  run = requestPerformPage(run, { runId: "run-1", index: 0, requestId: "request-new" });
  const oldPage = buildPerformPage({ entry, loaded: { title: "Old" }, sheet: "C", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, tuning: "standard", capo: 0, transpose: 0 });
  const newPage = buildPerformPage({ entry, loaded: { title: "New" }, sheet: "C G", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, tuning: "standard", capo: 0, transpose: 0 });
  const stale = acceptPerformPage(run, { runId: "run-1", index: 0, requestId: "request-old", page: oldPage });
  expect(stale).toBe(run);
  const current = acceptPerformPage(run, { runId: "run-1", index: 0, requestId: "request-new", page: newPage });
  expect(current.pages[0].page.loaded.title).toBe("New");
});

it("starts from the selected occurrence while preserving remaining order", () => {
  const setlist = { id: "sl", name: "Set", entries: [{ ...entry, entryId: "e1" }, { ...entry, entryId: "e2" }, { ...entry, entryId: "e3" }] };
  const run = createPerformRun(setlist, { tuning: "standard", capo: 0, transpose: 0, startEntryId: "e2", runId: "run-2" });
  expect(run.pages.map((slot) => slot.entry.entryId)).toEqual(["e2", "e3"]);
});

it("rejects a completion from a replaced run even when its slot index matches", () => {
  const oldSet = { id: "old", name: "Old", entries: [{ ...entry, entryId: "old-entry" }] };
  const newSet = { id: "new", name: "New", entries: [{ ...entry, entryId: "new-entry" }] };
  let oldRun = createPerformRun(oldSet, { tuning: "standard", capo: 0, transpose: 0, runId: "old-run" });
  oldRun = requestPerformPage(oldRun, { runId: "old-run", index: 0, requestId: "old-request" });
  const oldPage = buildPerformPage({ entry: oldSet.entries[0], loaded: { title: "Old" }, sheet: "C", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, tuning: "standard", capo: 0, transpose: 0 });
  const replacement = createPerformRun(newSet, { tuning: "standard", capo: 0, transpose: 0, runId: "new-run" });
  expect(acceptPerformPage(replacement, { runId: "old-run", index: 0, requestId: "old-request", page: oldPage })).toBe(replacement);
});

it("rejects a page whose sheet/refret key no longer matches its slot setup", () => {
  const setlist = { id: "sl", name: "Set", entries: [entry] };
  let run = createPerformRun(setlist, { tuning: "standard", capo: 0, transpose: 0, runId: "run" });
  run = requestPerformPage(run, { runId: "run", index: 0, requestId: "request" });
  const wrongSetupPage = buildPerformPage({ entry, loaded: { title: "Wrong" }, sheet: "C", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: { text: "wrong retab" }, tuning: "dropD", capo: 0, transpose: 0 });
  expect(acceptPerformPage(run, { runId: "run", index: 0, requestId: "request", page: wrongSetupPage })).toBe(run);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/lib/performpage.test.js`

Expected: FAIL because `src/lib/performpage.js` does not exist.

- [ ] **Step 3: Implement immutable page/run state**

`createPerformRun` requires a runtime-minted `runId`, snapshots the ordered entries from `startEntryId` (or the first entry), and captures the exact setup; later setlist edits do not silently reorder an active performance. Each page slot is `{ entry, setup, status: "idle"|"loading"|"ready"|"error", requestId, page, error }`. Request, accept, and fail return new objects only for an in-range matching request and matching `runId` action.

`sheetHash` operates on UTF-16 code units with a documented 32-bit FNV-1a implementation. `performancePageKey` joins escaped fields and uses `capo ?? "none"`; explicit zero must differ from null. `buildPerformPage` computes its key from its own `entry.entryId`, `sheet`, `tuning`, `capo`, and `transpose` and returns those exact inputs with immutable chart/progression/anchor/retab data. `acceptPerformPage` rejects a page when its entry ID or setup differs from the slot, or when recomputing its key does not equal `page.key`.

- [ ] **Step 4: Run page and retab tests**

Run: `npx vitest run src/lib/performpage.test.js src/lib/retab.test.js src/components/RetabPanel.test.jsx`

Expected: PASS, including current retab stale-action guards.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/performpage.js src/lib/performpage.test.js
git commit -m "feat(perform): add keyed performance pages"
```

---

### Task 6: Continuous Perform Set Stage

**Files:**
- Create: `src/components/PerformSongPage.jsx`
- Create: `src/components/PerformSet.test.jsx`
- Modify: `src/components/Perform.jsx`
- Modify: `src/components/PerformChart.jsx`
- Modify: `src/ui/bench.css`

**New Perform contract:**

```jsx
<Perform
  singleSong={singleSongProps | null}
  run={performRun | null}
  onRequestPage={(index) => Promise<void>}
  onExitSet={() => {}}
  onPickSong={() => {}}
  onPlayPageChord={({ pageKey, chordIndex, chord }) => {}}
  onStopPageWalk={() => {}}
/>
```

- [ ] **Step 1: Write failing continuous-stage tests**

```jsx
// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import Perform from "./Perform.jsx";
import { parseChord } from "../lib/theory.js";

const entry = (entryId, title) => ({ entryId, songKey: `user:${entryId}`, source: "user", id: entryId, title, artist: "Tyler", note: "" });
const setup = { tuning: "standard", capo: 0, transpose: 0 };
const readySlot = (entryId, title, symbols = ["C", "G"]) => ({
  entry: entry(entryId, title), setup, status: "ready", requestId: `request-${entryId}`, error: null,
  page: {
    key: `page-${entryId}`, entry: entry(entryId, title), loaded: { title, artist: "Tyler" },
    sheet: symbols.join(" "), outline: [], progression: symbols.map(parseChord),
    anchors: symbols.map((_, index) => ({ line: index, chord: index })),
    activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, retabTag: null,
    tuning: "standard", capo: 0, transpose: 0,
  },
});
const idleSlot = (entryId, title) => ({ entry: entry(entryId, title), setup, status: "idle", requestId: null, page: null, error: null });
const errorSlot = (entryId, title, error) => ({ entry: entry(entryId, title), setup, status: "error", requestId: `request-${entryId}`, page: null, error });
const run = (pages) => ({ runId: "run", setlistId: "sl", name: "Open mic", pages });
const runWithReadyFirstAndIdleSecond = run([readySlot("e1", "First"), idleSlot("e2", "Second")]);
const readyRun = run([readySlot("e1", "First"), readySlot("e2", "Second")]);
const readyRunWithOneChordPerPage = run([readySlot("e1", "First", ["C"]), readySlot("e2", "Second", ["G"])]);
const runWithFirstErrorAndIdleSuccessor = run([errorSlot("e1", "Missing first", "not found"), idleSlot("e2", "Second")]);

let observers;
beforeEach(() => {
  observers = [];
  global.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
  };
});

it("renders ready full charts in order and requests the next idle page", () => {
  const onRequestPage = vi.fn();
  render(<Perform run={runWithReadyFirstAndIdleSecond} onRequestPage={onRequestPage} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={() => {}} onStopPageWalk={() => {}} />);
  expect(screen.getAllByRole("article").map((node) => node.dataset.entryId)).toEqual(["e1", "e2"]);
  expect(onRequestPage).toHaveBeenCalledWith(1);
  observers.find((observer) => observer.options.rootMargin === "-35% 0px -64% 0px").callback([{ isIntersecting: true, intersectionRatio: 1, target: screen.getByTestId("perform-page-e1") }]);
  observers.find((observer) => observer.options.rootMargin === "0px 0px -25% 0px").callback([{ isIntersecting: true, target: screen.getByTestId("preload-sentinel-e1") }]);
  expect(onRequestPage).toHaveBeenCalledWith(1);
});

it("marks the visible page without starting audio", () => {
  const onPlayPageChord = vi.fn();
  render(<Perform run={readyRun} onRequestPage={() => {}} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={onPlayPageChord} onStopPageWalk={() => {}} />);
  observers.find((observer) => observer.options.rootMargin === "-35% 0px -64% 0px").callback([{ isIntersecting: true, intersectionRatio: .8, target: screen.getByTestId("perform-page-e2") }]);
  expect(screen.getByText(/2 of 2/)).toBeTruthy();
  expect(onPlayPageChord).not.toHaveBeenCalled();
});

it("Walk stops silently at a page boundary until the next explicit Play", () => {
  vi.useFakeTimers();
  const onPlayPageChord = vi.fn(), onStopPageWalk = vi.fn();
  render(<Perform run={readyRunWithOneChordPerPage} onRequestPage={() => {}} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={onPlayPageChord} onStopPageWalk={onStopPageWalk} tempo={600} />);
  fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));
  expect(onPlayPageChord).toHaveBeenLastCalledWith(expect.objectContaining({ pageKey: "page-e1", chordIndex: 0 }));
  vi.advanceTimersByTime(600);
  expect(screen.getByTestId("perform-page-e2")).toHaveAttribute("data-active-chord", "0");
  expect(onStopPageWalk).toHaveBeenCalledTimes(1);
  expect(onPlayPageChord).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));
  expect(onPlayPageChord).toHaveBeenLastCalledWith(expect.objectContaining({ pageKey: "page-e2", chordIndex: 0 }));
  vi.useRealTimers();
});

it("continues loading after an unresolved first or middle song", () => {
  const onRequestPage = vi.fn();
  render(<Perform run={runWithFirstErrorAndIdleSuccessor} onRequestPage={onRequestPage} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={() => {}} onStopPageWalk={() => {}} />);
  expect(screen.getByText(/Skipped: Missing first/i)).toBeTruthy();
  expect(onRequestPage).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npx vitest run src/components/PerformSet.test.jsx`

Expected: FAIL because Perform still accepts one global chart and navigates by opening a new Song.

- [ ] **Step 3: Build the page boundary and continuous controller**

`PerformSongPage` always renders an `<article data-entry-id>` and one of: a loading skeleton with the song title, a retryable error, or the full title/artist/setup header plus `PerformChart`. Every ready page receives its own `outline`, `activeKey`, `transpose`, `retabTag`, line registration, and Walk cursor.

Perform Set always initializes in Roll even if the saved single-song preference is Walk. It creates two observers rooted at the stage scroller: the active-page observer uses `rootMargin: "-35% 0px -64% 0px"` to represent the existing 35% playhead, and a preload observer watches a sentinel placed at the start of each page's final quarter with `rootMargin: "0px 0px -25% 0px"`. At startup request the first and successor idle slots. When the frontier slot becomes terminal (`ready` or `error`) and its preload sentinel approaches, request the following idle slot once. An error at page zero or in the middle is terminal for loading purposes, so it can never block later entries. Also render explicit previous/next page controls as a keyboard/touch fallback.

Roll is one requestAnimationFrame loop over the whole stage scroll container and stops at the document bottom. Space holds/releases Roll anywhere, including dividers. Walk owns `{ pageIndex, chordIndex, playing }` and uses each page's own progression/anchors. Starting or advancing a sounding step calls `onPlayPageChord` with that page key and chord; no global progression cursor is used. At the final chord, the tempo tick moves the silent cursor to `{ nextPage, 0, playing: false }`, scrolls the next page into view, calls `onStopPageWalk`, and waits for a new Play action before sounding the next page. Arrow keys move the silent cursor only. This exact timed boundary is covered with fake timers.

`PerformSongPage` renders a compact skipped-song divider for `error` and still exposes the stored title/reason. The final terminal slot is followed by an explicit `End of set` marker and never wraps. Fullscreen calls `stageRef.current.requestFullscreen()` so every page and the pinned toolbar remain inside. Tear down timers, RAFs, observers, and fullscreen listeners on unmount/run replacement. Do not use array indices as React keys.

- [ ] **Step 4: Add continuous-stage CSS**

```css
.perform-set-stage { position: relative; max-height: calc(100vh - 96px); overflow-y: auto; scroll-snap-type: y proximity; }
.perform-set-toolbar { position: sticky; top: 0; z-index: 4; background: color-mix(in srgb, var(--kl-dark) 92%, transparent); }
.perform-song-page { min-height: 86vh; padding: clamp(18px, 4vw, 46px); scroll-snap-align: start; border-bottom: 1px solid rgba(255,255,255,.14); }
.perform-song-page[aria-current="true"] { border-left: 3px solid var(--kl-root); }
@media (prefers-reduced-motion: reduce) { .perform-set-stage { scroll-behavior: auto; scroll-snap-type: none; } }
```

- [ ] **Step 5: Run continuous UI and pure page tests**

Run: `npx vitest run src/components/PerformSet.test.jsx src/lib/performpage.test.js src/components/RetabPanel.test.jsx`

Expected: PASS with observer cleanup and no audio callback during visibility or Walk changes.

- [ ] **Step 6: Commit**

```powershell
git add src/components/Perform.jsx src/components/PerformChart.jsx src/components/PerformSongPage.jsx src/components/PerformSet.test.jsx src/ui/bench.css
git commit -m "feat(perform): add the continuous set stage"
```

---

### Task 7: Race-Safe App Integration and End-to-End Verification

**Files:**
- Create: `src/songloader.js`
- Create: `src/songloader.test.js`
- Modify: `src/App.jsx:167-240, 619-635, 860-991, 1218`
- Modify: `src/components/BenchBook.jsx`
- Modify: `src/components/Library.jsx`
- Test: `src/lib/performpage.test.js`, `src/components/PerformSet.test.jsx`

**Interfaces:**

```js
resolveSongData(entry, { loadSong }) // returns song data; no navigation/state writes
createLatestSongLoader({ resolveSong, onAccept, onMissing })
startPerformSet(setlist, startEntryId = null)
requestPerformPage(index)
```

- [ ] **Step 1: Write failing concrete-source and normal-open race tests**

`src/songloader.js` lives outside `src/lib/` because the controller owns request identity and invokes injected callbacks. It delegates real source semantics to the existing `corpus.loadSong`. It accepts setlist-addressable `user`, `songbook`, and concrete provider sources such as `dylanchords`; `shared`, `ear`, and source-less recovery rows return `null` because they have no durable loader address.

Write `src/songloader.test.js` before production code:

```js
it("preserves concrete source plus id instead of resolving by slug", async () => {
  const loadSong = vi.fn(async (entry) => ({ id: entry.id, source: entry.source, title: "Same title", body: entry.source }));
  expect((await resolveSongData({ source: "songbook", id: "same" }, { loadSong })).source).toBe("songbook");
  expect((await resolveSongData({ source: "dylanchords", id: "same" }, { loadSong })).source).toBe("dylanchords");
  expect((await resolveSongData({ source: "user", id: "same" }, { loadSong })).source).toBe("user");
  expect(loadSong).toHaveBeenNthCalledWith(1, expect.objectContaining({ source: "songbook", id: "same" }));
});

it("accepts only the latest normal-song request when promises finish out of order", async () => {
  const first = deferred(), second = deferred(), accepted = [];
  const resolveSong = vi.fn((entry) => entry.id === "first" ? first.promise : second.promise);
  const loader = createLatestSongLoader({ resolveSong, onAccept: (song, entry, ctx) => accepted.push([song.id, ctx]), onMissing: vi.fn() });
  const oldOpen = loader.open({ source: "user", id: "first" }, { idx: 0 });
  const newOpen = loader.open({ source: "user", id: "second" }, { idx: 1 });
  second.resolve({ id: "second", body: "G" }); await newOpen;
  first.resolve({ id: "first", body: "C" }); await oldOpen;
  expect(accepted).toEqual([["second", { idx: 1 }]]);
});
```

- [ ] **Step 2: Implement the resolver/controller and verify RED turns GREEN**

`resolveSongData` validates `source`/`id`, calls the injected existing `loadSong(entry)`, and returns a copied resolved song carrying the original address when the loader omits it. `createLatestSongLoader.open` increments a private generation, awaits resolution, and calls `onAccept` only if its generation is still current. `invalidate()` increments the generation when an import/share replaces the active document.

Run: `npx vitest run src/songloader.test.js`

Expected: PASS.

- [ ] **Step 3: Guard normal Song opening against late requests**

App creates one latest-song controller in a ref. Its `onAccept` callback writes `loaded`, `sheet`, key, transpose, `setlistCtx`, and finally `section: "song"` as one accepted action. Import/share flows call `invalidate()` before replacing the document. Clicking an entry from the paper passes `{ name, rows: setlist.entries, idx }`, so previous/next in Song remains a normal explicit song open.

- [ ] **Step 4: Re-run the already-red race gates before App wiring**

Run: `npx vitest run src/lib/performpage.test.js src/songloader.test.js`

Expected: PASS. The replaced-run and wrong-setup cases were written RED in Task 5 before the page reducer existed; keep them unchanged while wiring App.

- [ ] **Step 5: Add explicit Perform Set state and keyed page loading**

`startPerformSet(setlist, startEntryId)` snapshots `createPerformRun(setlist, { ...currentSetup, startEntryId, runId: nextPerformRunId() })`, clears single-song setlist context, and sets `section` to `perform`. It does not call `openSong`. Perform's mount effect owns the initial slot-0/slot-1 requests, so there is one preload owner and duplicate requests cannot race.

`requestPerformPage(index)` captures `{ runId, requestId, entry, setup }`, resolves the song without navigation, derives its source outline/key/transpose, computes retab for that page, verifies `performancePageKey`, and dispatches accept/fail only while `runId`, slot request ID, and page key still match. Page retab uses the captured source sheet/setup, not App's deferred global `sheet`.

Keep single-song Perform working by adapting the existing props to `singleSong`. Switching to Library/Song or starting another set cancels the old run logically by replacing its run ID. Each asynchronous resolver/retab completion dispatches `{ runId, index, requestId, page }`; the reducer rejects it unless all identities and the recomputed page key match.

- [ ] **Step 6: Wire the Bench Book and Library entry points**

Pass `onPerformSet={(setlist) => startPerformSet(setlist, null)}` and `onRunFrom={(setlist, entryId) => startPerformSet(setlist, entryId)}` into BenchBook. Ordinary setlist-title clicks keep `onOpen={openSong}`. If Library offers `open setlist`, route it to Practice/Setlists; only controls explicitly labeled `Perform set` or `Run from here` invoke `startPerformSet`.

- [ ] **Step 7: Run all setlist/perform gates**

Run:

```powershell
npx vitest run src/lib/setlists.test.js src/storage.test.js src/lib/backup.test.js
npx vitest run src/songloader.test.js src/lib/performpage.test.js src/components/SetlistPaper.test.jsx src/components/PerformSet.test.jsx src/components/RetabPanel.test.jsx
```

Expected: PASS with repeats preserved, stale results discarded, and normal Song opening distinct from Perform Set.

- [ ] **Step 8: Run the full automated gates**

Run: `npm test`

Expected: all suites pass with zero failures.

Run: `npm run build`

Expected: Vite production build exits 0 and Caveat is bundled from the local font asset.

- [ ] **Step 9: Browser smoke the full workflow**

Run: `npm run dev`

Verify at desktop and narrow mobile widths:

1. Create an Open Mic set and add one song twice; give each occurrence a different note.
2. Reorder with buttons and Alt+Arrow, remove one occurrence, Undo, reload, and confirm exact order/notes.
3. Click a handwritten title and confirm it opens the ordinary Song room with its full existing tools.
4. Return to the paper, press Perform set, and confirm the first full chart plus next-page loading.
5. Scroll through at least three full mixed chord/tab pages. Confirm page headers, per-page retab/setup labels, previous/next controls, and active count.
6. Change songs quickly in normal Song and start two sets quickly; older async results must never replace the latest selection/run.
7. Exercise Roll, Walk, keyboard arrows, and fullscreen. Crossing pages must not start audio automatically.
8. Force one song resolver failure; the failed page shows Retry and later pages remain reachable.
9. Print the paper. Only the legible setlist and notes appear; the app shell does not blank the page.
10. Enable reduced motion and confirm no rotation/smooth-scroll dependence; keyboard focus remains visible.
11. Export/import a backup containing repeated entries; order and both occurrence notes survive.

- [ ] **Step 10: Commit**

```powershell
git add src/songloader.js src/songloader.test.js src/App.jsx src/components/BenchBook.jsx src/components/Library.jsx
git commit -m "feat(perform): connect setlists to the continuous stage"
```

---

## Plan Completion Gate

Before calling this plan complete:

- Re-read `docs/superpowers/specs/2026-07-21-setlist-perform-write-design.md` and check every Setlists/Perform requirement against Tasks 1–7.
- Run `git diff --check` and confirm only intended files changed.
- Run `npm test` and `npm run build` fresh.
- Confirm `keylit.bench.v2` is flat, `keylit.bench.v1` remains untouched, and every setlist occurrence has a unique stable `entryId`.
- Confirm handwritten title clicks always enter Song and only `Perform set` starts a continuous run.
- Confirm every page cache/retab acceptance is guarded by `entryId + sheet hash + tuning + capo + transpose`.
- Confirm visibility, preload, Walk, and page transitions never auto-start audio.
- Confirm print output is not blank and the Caveat OFL file ships beside the font.
- Record exact test counts, build result, browser scenarios completed, and any residual hardware/browser risk in the handoff.
