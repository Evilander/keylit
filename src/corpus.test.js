import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invalidateManifest, loadSong } from "./corpus.js";

beforeEach(() => invalidateManifest());
afterEach(() => vi.unstubAllGlobals());

it("does not fetch a chart when its request has already been cancelled", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  controller.abort();
  expect(await loadSong({ source: "test", id: "cancelled" }, { signal: controller.signal })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("passes cancellation to fetch and does not cache a late cancelled response", async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const fetch = vi.fn().mockReturnValueOnce(response).mockResolvedValueOnce({ ok: true, json: async () => ({ body: "fresh" }) });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const row = { source: "test", id: "late" };
  const pending = loadSong(row, { signal: controller.signal });
  expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  controller.abort();
  release({ ok: true, json: async () => ({ body: "old" }) });
  expect(await pending).toBeNull();
  expect(await loadSong(row)).toEqual({ body: "fresh" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps source and chart identifiers within their URL segments", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ body: "C G" }) });
  vi.stubGlobal("fetch", fetch);
  await loadSong({ source: "fan", id: "song#rhythm" });
  expect(fetch.mock.calls[0][0]).toBe("/corpus/fan/song%23rhythm.json");
});

it("bulk reads bypass the chart cache", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ body: "C" }) });
  vi.stubGlobal("fetch", fetch);
  const row = { source: "test", id: "bulk" };
  await loadSong(row, { cache: false });
  await loadSong(row);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("bounds cached charts during ordinary browsing", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ body: "C" }) });
  vi.stubGlobal("fetch", fetch);
  for (let id = 0; id <= 100; id++) await loadSong({ source: "test", id: String(id) });
  await loadSong({ source: "test", id: "100" });
  expect(fetch).toHaveBeenCalledTimes(101);
  await loadSong({ source: "test", id: "0" });
  expect(fetch).toHaveBeenCalledTimes(102);
});
