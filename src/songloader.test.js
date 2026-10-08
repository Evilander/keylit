import { expect, it, vi } from "vitest";
import { createLatestSongLoader, resolveSongData } from "./songloader.js";

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

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
