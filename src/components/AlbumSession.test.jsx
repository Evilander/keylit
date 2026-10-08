// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../test/render.js";
import AlbumSession from "./AlbumSession.jsx";
import { loadSong } from "../corpus.js";
import { benchBook } from "../storage.js";

vi.mock("../corpus.js", () => ({ loadSong: vi.fn(), SOURCE_LABEL: { fan: "Fan archive", ug: "UG" } }));
vi.mock("../storage.js", () => ({ benchBook: { saveSetlistSongs: vi.fn() } }));

const album = { key: "record", artist: "Band", album: "Record", year: 2000, songs: [
  { id: "first-chords", source: "fan", title: "First", artist: "Band", format: "chords", trackNumber: 1, capo: 0, tuningId: "standard" },
  { id: "first-tab", source: "ug", title: "First", artist: "Band", format: "tab", trackNumber: 1, capo: 2, tuningId: "dropD" },
  { id: "last", source: "fan", title: "Last", artist: "Band", format: "mixed", trackNumber: 2 },
  { id: "hidden", source: "fan", title: "Hidden", artist: "Band", format: "tab", trackNumber: 2, albumTrackKind: "hidden" },
] };

function Session(props) {
  const [session, setSession] = useState({});
  return <AlbumSession album={album} session={session} onChange={setSession} {...props} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSong.mockImplementation(async (row) => ({ body: row.id === "last" ? "Capo 3\nC G" : `C G\n${row.id}`, sourceUrl: "https://example.org/chart" }));
  benchBook.saveSetlistSongs.mockImplementation(({ songs, name }) => ({ id: "saved", name, entries: songs }));
});

describe("album sessions", () => {
  it("switches preferences without discarding an explicit choice and preserves source provenance", async () => {
    render(<Session />);
    await screen.findByLabelText("First chart preview");
    expect(screen.getByRole("radio", { name: /UG/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Fan archive/ }));
    await waitFor(() => expect(screen.getByLabelText("First chart preview")).toHaveTextContent("first-chords"));
    fireEvent.click(screen.getByRole("button", { name: "Chords first" }));
    fireEvent.click(screen.getByRole("button", { name: "Tabs first" }));
    expect(screen.getByRole("radio", { name: /Fan archive/ })).toBeChecked();
    expect(screen.getByRole("link", { name: "View source" })).toHaveAttribute("href", "https://example.org/chart");
  });

  it("saves just the included tracks in order with each chosen setup before entering Perform", async () => {
    const onPerform = vi.fn();
    render(<Session onPerform={onPerform} />);
    fireEvent.click(screen.getByRole("button", { name: "Save & perform" }));
    await waitFor(() => expect(onPerform).toHaveBeenCalledOnce());
    const setlist = onPerform.mock.calls[0][0];
    expect(setlist.entries.map((entry) => entry.title)).toEqual(["First", "Last"]);
    expect(setlist.entries[0]).toMatchObject({ source: "ug", id: "first-tab", tuning: "dropD", capo: 2 });
    expect(setlist.entries[1]).toMatchObject({ tuning: "standard", capo: 3 });
    expect(benchBook.saveSetlistSongs).toHaveBeenCalledOnce();
  });

  it("includes hidden tracks only when selected and can exclude individual main tracks", async () => {
    const onSetlist = vi.fn();
    render(<Session onSetlist={onSetlist} />);
    expect(screen.getByRole("checkbox", { name: "Include Hidden" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include hidden & bonus tracks" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include First" }));
    fireEvent.click(screen.getByRole("button", { name: "Create setlist" }));
    await waitFor(() => expect(onSetlist).toHaveBeenCalledOnce());
    expect(onSetlist.mock.calls[0][0].entries.map((entry) => entry.title)).toEqual(["Last", "Hidden"]);
  });

  it("keeps the session usable after a chart failure and never saves a partial record", async () => {
    loadSong.mockImplementation(async (row) => row.id === "last" ? null : { body: "C G" });
    render(<Session onPerform={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save & perform" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load Last");
    expect(benchBook.saveSetlistSongs).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save & perform" })).toBeEnabled();
    loadSong.mockResolvedValue({ body: "C G" });
    fireEvent.click(screen.getByRole("button", { name: "Save & perform" }));
    await waitFor(() => expect(benchBook.saveSetlistSongs).toHaveBeenCalledOnce());
  });

  it("retains choices and reports a quota failure without navigating", async () => {
    benchBook.saveSetlistSongs.mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    const onSetlist = vi.fn();
    render(<Session onSetlist={onSetlist} />);
    fireEvent.click(screen.getByRole("button", { name: "Create setlist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage is full");
    expect(onSetlist).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /UG/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Create setlist" })).toBeEnabled();
  });

  it("prevents a late chart load from saving after the session is closed", async () => {
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    loadSong.mockReturnValue(delayed);
    const { unmount } = render(<Session onPerform={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save & perform" }));
    unmount();
    release({ body: "C G" });
    await delayed;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(benchBook.saveSetlistSongs).not.toHaveBeenCalled();
  });

  it("does not link unsafe source URLs and leaves the old preview behind when changing track", async () => {
    loadSong.mockResolvedValue({ body: "First body", sourceUrl: "javascript:alert(1)" });
    render(<Session />);
    await screen.findByLabelText("First chart preview");
    expect(screen.queryByRole("link", { name: "View source" })).toBeNull();
    loadSong.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(within(screen.getByRole("group", { name: "Album tracks" })).getByRole("button", { name: /Last/ }));
    expect(screen.queryByLabelText("First chart preview")).toBeNull();
    expect(screen.getByRole("button", { name: "Open chart" })).toBeDisabled();
  });
});
