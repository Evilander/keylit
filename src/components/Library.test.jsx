// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "../test/render.js";
import Library from "./Library.jsx";
import { loadManifest, loadSong } from "../corpus.js";
import { makeZip } from "../lib/zip.js";
import { benchBook } from "../storage.js";

vi.mock("../corpus.js", async (original) => ({ ...await original(), loadManifest: vi.fn(), loadSong: vi.fn() }));
vi.mock("../lib/zip.js", () => ({ makeZip: vi.fn() }));
vi.mock("../storage.js", () => ({
  userSongbook: { rows: () => [], all: () => [] },
  benchBook: { setlists: () => [], raw: () => ({ setlists: [], log: [] }), saveSetlistSongs: vi.fn() },
}));
vi.mock("./TabHunt.jsx", () => ({ default: () => null }));
vi.mock("./AddSong.jsx", () => ({ default: () => null }));
vi.mock("./Ear.jsx", () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  loadManifest.mockResolvedValue([{ id: "yellow", artist: "Coldplay", title: "Yellow", source: "test", format: "tab" }]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("chart export recovery", () => {
  it("reports unloaded charts and restores the export control without downloading an empty archive", async () => {
    loadSong.mockResolvedValue(null);
    render(<Library />);
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    await screen.findByText("No charts could be loaded for export. Check the connection and try again.");
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
    expect(makeZip).not.toHaveBeenCalled();
  });

  it("recovers from ZIP creation failure and allows another attempt", async () => {
    loadSong.mockResolvedValue({ body: "C G" });
    makeZip.mockImplementationOnce(() => { throw new Error("Allocation failed"); }).mockReturnValue(new Uint8Array());
    const createObjectURL = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Library />);
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    await screen.findByText("The chart export failed. Your library is unchanged; try a smaller selection.");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
    expect(screen.queryByText(/The chart export failed/)).toBeNull();
  });
});

it("opens the whole album from a filtered song result and keeps the filter on return", async () => {
  loadManifest.mockResolvedValue([
    { id: "yellow", artist: "Coldplay", title: "Yellow", source: "test", format: "tab", album: "Parachutes", trackNumber: 5 },
    { id: "panic", artist: "Coldplay", title: "Don't Panic", source: "test", format: "chords", album: "Parachutes", trackNumber: 1 },
  ]);
  loadSong.mockResolvedValue({ body: "C G" });
  render(<Library />);
  const search = await screen.findByRole("textbox", { name: "Search the library" });
  fireEvent.change(search, { target: { value: "Yellow" } });
  fireEvent.click(screen.getByRole("button", { name: /Albums \d+/ }));
  fireEvent.click(screen.getByRole("button", { name: "Work through Parachutes by Coldplay" }));
  expect(screen.getByRole("heading", { name: "Parachutes", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Include Don't Panic" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Include Yellow" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to the library" }));
  expect(screen.getByRole("textbox", { name: "Search the library" })).toHaveValue("Yellow");
});

it("resolves a picked chart's body-declared capo before the atomic setlist save", async () => {
  loadSong.mockResolvedValue({ body: "Capo 3\nC G" });
  benchBook.saveSetlistSongs.mockReturnValue({ id: "saved" });
  const onSetlist = vi.fn();
  render(<Library onSetlist={onSetlist} />);
  fireEvent.click(await screen.findByRole("button", { name: "Setlist", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Artists", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /^Yellow/ }));
  fireEvent.click(screen.getByRole("button", { name: "To the Bench Book" }));
  await waitFor(() => expect(onSetlist).toHaveBeenCalledOnce());
  expect(benchBook.saveSetlistSongs.mock.calls[0][0].songs[0]).toMatchObject({ source: "test", id: "yellow", capo: 3 });
});

it("retains a generic library selection if its atomic save fails", async () => {
  loadSong.mockResolvedValue({ body: "C G" });
  benchBook.saveSetlistSongs.mockImplementation(() => { throw new Error("Storage full"); });
  const onSetlist = vi.fn();
  render(<Library onSetlist={onSetlist} />);
  fireEvent.click(await screen.findByRole("button", { name: "Setlist", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Artists", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /^Yellow/ }));
  fireEvent.click(screen.getByRole("button", { name: "To the Bench Book" }));
  await screen.findByText(/Storage full.*selection is still here/);
  expect(screen.getByText("1 picked")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "To the Bench Book" })).toBeEnabled();
  expect(onSetlist).not.toHaveBeenCalled();
});

it("cancels a pending picker save when entering an album session", async () => {
  loadManifest.mockResolvedValue([{ id: "yellow", artist: "Coldplay", title: "Yellow", source: "test", format: "tab", album: "Parachutes" }]);
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  loadSong.mockReturnValue(delayed);
  const onSetlist = vi.fn();
  render(<Library onSetlist={onSetlist} />);
  fireEvent.click(await screen.findByRole("button", { name: "Setlist", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Artists", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /^Yellow/ }));
  fireEvent.click(screen.getByRole("button", { name: "To the Bench Book" }));
  fireEvent.click(screen.getByRole("button", { name: "Work through Parachutes by Coldplay" }));
  expect(screen.getByRole("heading", { name: "Parachutes", level: 1 })).toBeInTheDocument();
  release({ body: "Capo 3\nC G" });
  await delayed;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(onSetlist).not.toHaveBeenCalled();
  expect(benchBook.saveSetlistSongs).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Back to the library" }));
});

it("pages a broad search while retaining picks across pages", async () => {
  loadManifest.mockResolvedValue(Array.from({ length: 250 }, (_, i) => ({ id: String(i), source: "test", artist: "Coldplay", title: `A song ${i}` })));
  render(<Library />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Search the library" }), { target: { value: "A song" } });
  fireEvent.click(screen.getByRole("button", { name: "Artists", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Setlist", exact: true }));
  expect(screen.getAllByRole("button", { name: /^A song / })).toHaveLength(100);
  fireEvent.click(screen.getByRole("button", { name: /^A song 0chords/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getAllByRole("button", { name: /^A song / })).toHaveLength(100);
  expect(screen.getByText("1 picked")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getAllByRole("button", { name: /^A song / })).toHaveLength(50);
  fireEvent.change(screen.getByRole("textbox", { name: "Search the library" }), { target: { value: "" } });
});

it("cancels export workers on unmount and bypasses the cache", async () => {
  loadManifest.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: String(i), source: "test", artist: "Coldplay", title: `Song ${i}` })));
  let release;
  loadSong.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const view = render(<Library />);
  fireEvent.click(await screen.findByRole("button", { name: "Export" }));
  expect(loadSong).toHaveBeenCalledTimes(8);
  const options = loadSong.mock.calls[0][1];
  expect(options.cache).toBe(false);
  expect(screen.getByRole("button", { name: "Cancel export" })).toBeInTheDocument();
  view.unmount();
  expect(options.signal.aborted).toBe(true);
  release({ body: "C" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(loadSong).toHaveBeenCalledTimes(8);
  expect(makeZip).not.toHaveBeenCalled();
});

it("opens the backup chooser from a named native button", async () => {
  render(<Library />);
  const button = await screen.findByRole("button", { name: "import a backup" });
  const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  expect(screen.getByText(/Backups include library songs/)).toBeInTheDocument();
});

it("times out a stalled export and restores controls", async () => {
  loadSong.mockReturnValue(new Promise(() => {}));
  render(<Library />);
  const button = await screen.findByRole("button", { name: "Export" });
  vi.useFakeTimers();
  try {
    fireEvent.click(button);
    const { act } = await import("../test/render.js");
    await act(() => vi.advanceTimersByTimeAsync(120000));
    expect(loadSong.mock.calls[0][1].signal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
    expect(screen.getByText(/Export timed out/)).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it("exports all matching charts beyond the visible page", async () => {
  loadManifest.mockResolvedValue(Array.from({ length: 105 }, (_, i) => ({ id: String(i), source: "test", artist: "Coldplay", title: `A song ${i}` })));
  loadSong.mockResolvedValue({ body: "C" });
  makeZip.mockReturnValue(new Uint8Array());
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<Library />);
  fireEvent.click(await screen.findByRole("button", { name: "Export" }));
  await waitFor(() => expect(makeZip).toHaveBeenCalledOnce());
  expect(makeZip.mock.calls[0][0]).toHaveLength(105);
  expect(loadSong).toHaveBeenCalledTimes(105);
});

it("a cancelled export cannot clear a newer export's progress", async () => {
  let releaseOld;
  loadSong.mockReturnValueOnce(new Promise(resolve => { releaseOld = resolve; })).mockReturnValue(new Promise(() => {}));
  render(<Library />);
  fireEvent.click(await screen.findByRole("button", { name: "Export" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  const { act } = await import("../test/render.js");
  await act(async () => releaseOld({ body: "C" }));
  expect(screen.getByRole("button", { name: "Cancel export" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /zipping 0\/1/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
});

it("keeps the complete collapsed artist index and whole album actions", async () => {
  const songs = Array.from({ length: 102 }, (_, i) => ({ id: String(i), source: "test", artist: "Coldplay", title: `Track ${i}`, album: "Parachutes", trackNumber: i + 1 }));
  loadManifest.mockResolvedValue([...songs, { id: "last", source: "test", artist: "The Beatles", title: "Last" }]);
  render(<Library />);
  await screen.findByRole("textbox", { name: "Search the library" });
  expect(screen.getByRole("button", { name: /The Beatles1 song/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Coldplay102 songs/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Albums \d+/ }));
  fireEvent.click(screen.getByRole("button", { name: /LPColdplayParachutes/ }));
  expect(screen.getAllByRole("button", { name: "Work through Parachutes by Coldplay" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Work through Parachutes by Coldplay" }));
  expect(screen.getByRole("checkbox", { name: "Include Track 101" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to the library" }));
  fireEvent.click(screen.getByRole("button", { name: "Artists", exact: true }));
});

it("keeps alternate charts together across search page boundaries", async () => {
  const songs = Array.from({ length: 101 }, (_, i) => ({ id: String(i), source: "test", artist: "Coldplay", title: `A song ${i}` }));
  loadManifest.mockResolvedValue([...songs, { ...songs[0], id: "alternate", source: "other", format: "tab" }]);
  render(<Library />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Search the library" }), { target: { value: "A song" } });
  expect(screen.getByRole("button", { name: "Show arrangements of A song 0" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.queryByRole("button", { name: "Show arrangements of A song 0" })).toBeNull();
  expect(screen.getAllByRole("button", { name: /^A song / })).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Search the library" }), { target: { value: "" } });
});
