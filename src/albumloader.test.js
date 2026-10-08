import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAlbumCharts } from "./albumloader.js";

afterEach(() => vi.useRealTimers());

describe("album chart loading", () => {
  it("keeps album order while using at most four concurrent requests", async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ title: `${index}` }));
    let active = 0, peak = 0;
    const songs = await loadAlbumCharts(rows, { loadSong: async (row) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, Number(row.title) % 3));
      active--;
      return { body: row.title };
    } });
    expect(peak).toBe(4);
    expect(songs.map((song) => song.body)).toEqual(rows.map((row) => row.title));
  });

  it("rejects unavailable or empty charts instead of returning a partial album", async () => {
    await expect(loadAlbumCharts([{ title: "Missing" }], { loadSong: async () => null })).rejects.toThrow("Could not load Missing");
    await expect(loadAlbumCharts([{ title: "Empty" }], { loadSong: async () => ({ body: "  " }) })).rejects.toThrow("Could not load Empty");
  });

  it("enforces a deadline even if a loader ignores cancellation", async () => {
    vi.useFakeTimers();
    let signal;
    const pending = loadAlbumCharts([{ title: "Slow" }], { timeoutMs: 20, loadSong: (_, options) => { signal = options.signal; return new Promise(() => {}); } });
    const check = expect(pending).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(20);
    await check;
    expect(signal.aborted).toBe(true);
  });

  it("cancels active requests and never starts another worker after leaving", async () => {
    const controller = new AbortController();
    const loadSong = vi.fn(() => new Promise(() => {}));
    const pending = loadAlbumCharts(Array.from({ length: 7 }, () => ({ title: "X" })), { loadSong, signal: controller.signal });
    const check = expect(pending).rejects.toThrow("cancelled");
    controller.abort();
    await check;
    expect(loadSong).toHaveBeenCalledTimes(4);
    expect(loadSong.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  });

  it("does not fetch if the parent request was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const loadSong = vi.fn();
    await expect(loadAlbumCharts([{ title: "X" }], { loadSong, signal: controller.signal })).rejects.toThrow("cancelled");
    expect(loadSong).not.toHaveBeenCalled();
  });
});
