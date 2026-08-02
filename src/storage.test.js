import { describe, it, expect } from "vitest";
import { createDraftBook, createLibrary, createBenchBook } from "./storage.js";
import { adaptLegacySketch, createDraft } from "./lib/composition.js";

function fakeBackend(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? "",
    setItem: (key, value) => data.set(key, value),
    snapshot: () => Object.fromEntries(data),
  };
}

describe("Write draft book", () => {
  const draft = (id, input = {}) => createDraft({ id, name: id, ...input });

  it("upserts v2 drafts by stable id and permits repeated names", () => {
    const be = fakeBackend();
    const book = createDraftBook(be);
    book.save(createDraft({ id: "a", name: "Untitled", sections: [{ id: "a-section", name: "Section", chords: [] }] }));
    book.save(createDraft({ id: "b", name: "Untitled", sections: [{ id: "b-section", name: "Section", chords: [] }] }));
    book.save(createDraft({ id: "a", name: "Changed", sections: [{ id: "a-section", name: "Section", chords: [] }] }));
    expect(book.list().map((draft) => draft.id)).toEqual(["a", "b"]);
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

  it("falls back from partial browser storage without aliasing v2 and v1 keys", () => {
    const partialStorage = { getItem: () => { throw new Error("must not be used"); } };
    const book = createDraftBook(null, partialStorage);
    book.save(draft("fallback"));
    expect(book.list().map((item) => item.id)).toEqual(["fallback"]);
    expect(book.legacy()).toEqual([]);
  });

  it("rejects a v2 envelope with duplicate valid draft IDs", () => {
    const first = draft("same", { savedAt: 1 });
    const second = draft("same", { savedAt: 2 });
    const be = fakeBackend({
      "keylit.write.drafts.v2": JSON.stringify({ version: 2, drafts: [first, second] }),
    });
    expect(createDraftBook(be).list()).toEqual([]);
  });

  it("writes the exact v2 envelope", () => {
    const be = fakeBackend();
    const saved = draft("exact", { savedAt: 4 });
    createDraftBook(be).save(saved);
    expect(JSON.parse(be.snapshot()["keylit.write.drafts.v2"])).toEqual({ version: 2, drafts: [saved] });
  });

  it("rejects valid JSON with the wrong envelope version", () => {
    const be = fakeBackend({
      "keylit.write.drafts.v2": JSON.stringify({ version: 1, drafts: [draft("old")] }),
    });
    expect(createDraftBook(be).list()).toEqual([]);
  });

  it("filters persisted drafts with malformed keys or sections", () => {
    const valid = draft("good");
    const be = fakeBackend({
      "keylit.write.drafts.v2": JSON.stringify({ version: 2, drafts: [
        { ...draft("bad-key"), key: { tonic: 12, mode: "major" } },
        { ...draft("bad-sections"), sections: "not an array" },
        valid,
      ] }),
    });
    expect(createDraftBook(be).list()).toEqual([valid]);
  });

  it("rejects invalid saves without writing", () => {
    const be = fakeBackend();
    const invalid = { ...draft("invalid"), key: { tonic: 12, mode: "major" } };
    const book = createDraftBook(be);
    expect(() => book.save(invalid)).toThrow("Invalid Write draft");
    expect(be.snapshot()).toEqual({});
  });

  it("lists drafts newest-first by savedAt", () => {
    const be = fakeBackend();
    const book = createDraftBook(be);
    book.save(draft("old", { savedAt: 1 }));
    book.save(draft("new", { savedAt: 2 }));
    expect(book.list().map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("returns null for a missing draft ID", () => {
    const book = createDraftBook(fakeBackend());
    expect(book.get("missing")).toBeNull();
  });

  it("removes drafts by ID", () => {
    const book = createDraftBook(fakeBackend());
    book.save(draft("old", { savedAt: 1 }));
    book.save(draft("new", { savedAt: 2 }));
    book.remove("new");
    expect(book.list().map((item) => item.id)).toEqual(["old"]);
  });

  it("rejects envelopes with unexpected own top-level keys but accepts the exact keys in either order", () => {
    const stored = draft("stored");
    const extra = fakeBackend({
      "keylit.write.drafts.v2": JSON.stringify({ drafts: [stored], version: 2, extra: true }),
    });
    const reordered = fakeBackend({
      "keylit.write.drafts.v2": JSON.stringify({ drafts: [stored], version: 2 }),
    });
    expect(createDraftBook(extra).list()).toEqual([]);
    expect(createDraftBook(reordered).list()).toEqual([stored]);
  });
});

describe("song library", () => {
  it("saves and lists songs newest-first", () => {
    const lib = createLibrary(fakeBackend());
    lib.save({ name: "Song A", sheet: "C G Am F", savedAt: 1 });
    lib.save({ name: "Song B", sheet: "Dm G C", savedAt: 2 });
    const list = lib.list();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Song B"); // newer first
  });

  it("round-trips a saved song by id", () => {
    const lib = createLibrary(fakeBackend());
    const saved = lib.save({ name: "My Tune", sheet: "Em C G D", savedAt: 5 });
    expect(lib.get(saved.id).sheet).toBe("Em C G D");
  });

  it("replaces a same-name song instead of duplicating", () => {
    const lib = createLibrary(fakeBackend());
    lib.save({ name: "Draft", sheet: "C", savedAt: 1 });
    lib.save({ name: "Draft", sheet: "C F", savedAt: 2 });
    const list = lib.list();
    expect(list).toHaveLength(1);
    expect(list[0].sheet).toBe("C F");
  });

  it("removes a song", () => {
    const lib = createLibrary(fakeBackend());
    const s = lib.save({ name: "Temp", sheet: "C", savedAt: 1 });
    lib.remove(s.id);
    expect(lib.list()).toHaveLength(0);
  });

  it("survives a corrupt backend value", () => {
    const be = { getItem: () => "not json{", setItem: () => {} };
    const lib = createLibrary(be);
    expect(lib.list()).toEqual([]);
  });
});

describe("bench book — setlists", () => {
  const song = (t) => ({ songKey: t.toLowerCase(), source: "user", id: t.toLowerCase(), title: t, artist: "Artist" });
  const sequenceIds = () => { let n = 0; return (prefix = "id") => `${prefix}-${++n}`; };

  it("creates, renames and removes setlists", () => {
    const bb = createBenchBook(fakeBackend());
    const sl = bb.createSetlist("Tonight", 100);
    expect(bb.setlists()).toHaveLength(1);
    bb.renameSetlist(sl.id, "Porch set");
    expect(bb.setlists()[0].name).toBe("Porch set");
    bb.removeSetlist(sl.id);
    expect(bb.setlists()).toEqual([]);
  });

  it("writes a flat v2 envelope while leaving v1 untouched", () => {
    const v1 = JSON.stringify({ setlists: [{ id: "old", name: "Old", songs: [] }], log: [] });
    const be = fakeBackend({ "keylit.bench.v1": v1 });
    const bb = createBenchBook(be, { makeId: sequenceIds(), now: () => 20 });
    const made = bb.createSetlist("New", 20);
    expect(made.createdAt).toBe(20);
    bb.addToSetlist(made.id, { songKey: "user:a", source: "user", id: "a", title: "A", capo: 0 });
    const stored = JSON.parse(be.snapshot()["keylit.bench.v2"]);
    expect(stored.version).toBe(2);
    expect(stored.setlists.find((item) => item.id === made.id).entries[0].capo).toBe(0);
    expect(be.snapshot()["keylit.bench.v1"]).toBe(v1);
  });

  it("uses v1 only as in-memory recovery when v2 is malformed", () => {
    const v1 = JSON.stringify({ setlists: [{ id: "old", name: "Old", songs: [{ songKey: "old:a", title: "Old A" }] }], log: [] });
    const be = fakeBackend({ "keylit.bench.v1": v1, "keylit.bench.v2": JSON.stringify({ version: 3, setlists: [], log: [] }) });
    const bb = createBenchBook(be, { makeId: sequenceIds(), now: () => 1 });
    expect(bb.setlists()[0].entries[0].title).toBe("Old A");
    expect(be.snapshot()["keylit.bench.v2"]).toBe(JSON.stringify({ version: 3, setlists: [], log: [] }));
  });

  it("normalizes an imported bench state through restore", () => {
    const be = fakeBackend();
    const bb = createBenchBook(be, { makeId: sequenceIds(), now: () => 1 });
    bb.restore({ setlists: [{ id: "old", name: "Old", songs: [{ songKey: "old:a", title: "A" }] }], log: [] });
    expect(JSON.parse(be.snapshot()["keylit.bench.v2"])).toMatchObject({
      version: 2,
      setlists: [{ id: "old", entries: [{ songKey: "old:a", title: "A" }] }],
    });
  });

  it("removes and restores one repeated occurrence", () => {
    const bb = createBenchBook(fakeBackend(), { makeId: sequenceIds(), now: () => 1 });
    const sl = bb.createSetlist("Set", 1);
    const first = bb.addToSetlist(sl.id, song("Candle"));
    const second = bb.addToSetlist(sl.id, song("Candle"));
    const removed = bb.removeFromSetlist(sl.id, first.entryId);
    expect(bb.setlists()[0].entries.map((entry) => entry.entryId)).toEqual([second.entryId]);
    bb.restoreToSetlist(sl.id, removed.entry, removed.index);
    expect(bb.setlists()[0].entries.map((entry) => entry.entryId)).toEqual([first.entryId, second.entryId]);
  });

  it("adds, moves, updates, and removes stable occurrences", () => {
    const bb = createBenchBook(fakeBackend(), { makeId: sequenceIds(), now: () => 100 });
    const sl = bb.createSetlist("Tonight", 100);
    const candle = bb.addToSetlist(sl.id, song("Candle"));
    const harvest = bb.addToSetlist(sl.id, song("Harvest"));
    bb.moveInSetlist(sl.id, harvest.entryId, 0);
    bb.setEntryNote(sl.id, candle.entryId, "hold the last chord");
    expect(bb.setlists()[0].entries.map((s) => s.title)).toEqual(["Harvest", "Candle"]);
    expect(bb.setlists()[0].entries[1].note).toBe("hold the last chord");
    expect(bb.removeFromSetlist(sl.id, candle.entryId)).toMatchObject({ entry: { entryId: candle.entryId }, index: 1 });
    expect(bb.setlists()[0].entries.map((s) => s.title)).toEqual(["Harvest"]);
  });

  it("persists an occurrence's playing setup and rejects junk", () => {
    const bb = createBenchBook(fakeBackend(), { makeId: sequenceIds(), now: () => 100 });
    const sl = bb.createSetlist("Tonight", 100);
    const candle = bb.addToSetlist(sl.id, song("Candle"));
    bb.setEntrySetup(sl.id, candle.entryId, { tuning: "openD", capo: 2 });
    expect(bb.setlists()[0].entries[0]).toMatchObject({ tuning: "openD", capo: 2 });
    bb.setEntrySetup(sl.id, candle.entryId, { capo: 0 });
    expect(bb.setlists()[0].entries[0]).toMatchObject({ tuning: "openD", capo: 0 });
    expect(bb.setEntrySetup(sl.id, candle.entryId, {})).toBeNull();
    expect(bb.setEntrySetup(sl.id, candle.entryId, { capo: "third" })).toBeNull();
    expect(bb.setlists()[0].entries[0].capo).toBe(0);
  });

  it("keeps per-setlist notes", () => {
    const bb = createBenchBook(fakeBackend());
    const sl = bb.createSetlist("Tonight", 100);
    bb.setSetlistNotes(sl.id, "start slow; capo on 2 for the closer");
    expect(bb.setlists()[0].notes).toMatch(/capo on 2/);
  });
});

describe("bench book — practice log", () => {
  it("appends entries and lists newest-first, filterable by song", () => {
    const bb = createBenchBook(fakeBackend());
    bb.logPractice({ songKey: "candle", title: "Candle", at: 10, kind: "playalong", accuracy: 0.5 });
    bb.logPractice({ songKey: "harvest", title: "Harvest", at: 20, kind: "ran-it" });
    bb.logPractice({ songKey: "candle", title: "Candle", at: 30, kind: "playalong", accuracy: 0.9 });
    expect(bb.log()).toHaveLength(3);
    expect(bb.log()[0].at).toBe(30);
    expect(bb.log("candle")).toHaveLength(2);
  });

  it("caps the log so localStorage never bloats", () => {
    const bb = createBenchBook(fakeBackend());
    for (let i = 0; i < 620; i++) bb.logPractice({ songKey: "x", title: "X", at: i, kind: "ran-it" });
    expect(bb.log().length).toBeLessThanOrEqual(500);
    expect(bb.log()[0].at).toBe(619);                  // newest survive
  });

  it("survives a corrupt backend value", () => {
    const be = { getItem: () => "{broken", setItem: () => {} };
    const bb = createBenchBook(be);
    expect(bb.setlists()).toEqual([]);
    expect(bb.log()).toEqual([]);
  });
});
