import { describe, it, expect } from "vitest";
import { createLibrary } from "./storage.js";

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
