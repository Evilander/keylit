import { describe, it, expect } from "vitest";
import { createLibrary, createBenchBook } from "./storage.js";

function fakeBackend() {
  let v = "";
  return { getItem: () => v, setItem: (_k, val) => { v = val; } };
}

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
  const song = (t) => ({ songKey: t.toLowerCase(), title: t, artist: "Artist" });

  it("creates, renames and removes setlists", () => {
    const bb = createBenchBook(fakeBackend());
    const sl = bb.createSetlist("Tonight", 100);
    expect(bb.setlists()).toHaveLength(1);
    bb.renameSetlist(sl.id, "Porch set");
    expect(bb.setlists()[0].name).toBe("Porch set");
    bb.removeSetlist(sl.id);
    expect(bb.setlists()).toEqual([]);
  });

  it("adds songs once, removes them, reorders them", () => {
    const bb = createBenchBook(fakeBackend());
    const sl = bb.createSetlist("Tonight", 100);
    bb.addToSetlist(sl.id, song("Candle"));
    bb.addToSetlist(sl.id, song("Harvest"));
    bb.addToSetlist(sl.id, song("Candle"));            // dupe ignored
    expect(bb.setlists()[0].songs.map((s) => s.title)).toEqual(["Candle", "Harvest"]);
    bb.moveInSetlist(sl.id, 1, -1);                     // Harvest up
    expect(bb.setlists()[0].songs.map((s) => s.title)).toEqual(["Harvest", "Candle"]);
    bb.removeFromSetlist(sl.id, "candle");
    expect(bb.setlists()[0].songs.map((s) => s.title)).toEqual(["Harvest"]);
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
