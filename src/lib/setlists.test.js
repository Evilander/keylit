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

  it("fails closed for invalid patches and no-op moves", () => {
    const state = normalizeBenchState(legacy, { makeId: ids });
    const entry = state.setlists[0].entries[0];
    expect(updateEntry(state, "sl", entry.entryId, { title: "Nope" })).toBe(state);
    expect(moveEntry(state, "sl", entry.entryId, 0)).toBe(state);
    expect(removeEntry(state, "missing", entry.entryId)).toEqual({ state, removed: null });
  });
});
