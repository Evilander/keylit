// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "../test/render.js";
import SetlistPaper from "./SetlistPaper.jsx";

const setlist = { id: "sl", name: "Open mic", notes: "10 minutes", entries: [
  { entryId: "e1", songKey: "user:a", source: "user", id: "a", title: "First", artist: "Tyler", note: "capo 2" },
  { entryId: "e2", songKey: "user:a", source: "user", id: "a", title: "First", artist: "Tyler", note: "encore" },
] };

const props = (overrides = {}) => ({ setlist, onOpenSong: () => {}, onPerformSet: () => {}, onRunFrom: () => {}, onMarkPracticed: () => {}, searchResults: [], onSearch: () => {}, onAppendSong: () => {}, onRename: () => {}, onSetNotes: () => {}, onSetEntryNote: () => {}, onMove: () => {}, onRemove: () => {}, onRestore: () => {}, ...overrides });

it("opens a handwritten title in normal Song context", () => {
  const onOpenSong = vi.fn();
  render(<SetlistPaper {...props({ onOpenSong })} />);
  fireEvent.click(screen.getAllByRole("button", { name: /open First in Song/i })[1]);
  expect(onOpenSong).toHaveBeenCalledWith(setlist.entries[1], { name: "Open mic", rows: setlist.entries, idx: 1 });
});

it("starts the complete set or a selected entry only from explicit run controls", () => {
  const onPerformSet = vi.fn(), onRunFrom = vi.fn();
  render(<SetlistPaper {...props({ onPerformSet, onRunFrom })} />);
  fireEvent.click(screen.getByRole("button", { name: /perform set/i }));
  expect(onPerformSet).toHaveBeenCalledWith(setlist);
  fireEvent.click(within(screen.getByTestId("setlist-entry-e2")).getByRole("button", { name: /run from here/i }));
  expect(onRunFrom).toHaveBeenCalledWith(setlist, "e2");
});

it("edits and removes by occurrence id, then offers an undo", () => {
  const onSetEntryNote = vi.fn(), onRemove = vi.fn(() => ({ entry: setlist.entries[1], index: 1 })), onRestore = vi.fn();
  render(<SetlistPaper {...props({ onSetEntryNote, onRemove, onRestore })} />);
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
  render(<SetlistPaper {...props({ onSearch, onAppendSong, onMarkPracticed, searchResults: [result] })} />);
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
  render(<SetlistPaper {...props({ onMove })} />);
  fireEvent.dragStart(screen.getByRole("button", { name: /drag setlist item 2/i }), { dataTransfer });
  fireEvent.dragOver(screen.getByTestId("setlist-entry-e1"), { dataTransfer });
  fireEvent.drop(screen.getByTestId("setlist-entry-e1"), { dataTransfer });
  expect(onMove).toHaveBeenCalledWith("e2", 0);
});

it("requires a named confirmation before deleting the whole setlist", () => {
  const onDeleteSetlist = vi.fn();
  render(<SetlistPaper {...props({ onDeleteSetlist })} />);
  fireEvent.click(screen.getByRole("button", { name: /delete Open mic/i }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Open mic");
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect(onDeleteSetlist).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /delete Open mic/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
  expect(onDeleteSetlist).toHaveBeenCalledWith("sl");
});

it("renders a complete print-only setlist instead of a blank print page", () => {
  const { container } = render(<SetlistPaper {...props()} />);
  const print = container.querySelector(".kl-printonly");
  expect(print).toHaveTextContent("Open mic");
  expect(print).toHaveTextContent("10 minutes");
  expect(within(print).getAllByText("First")).toHaveLength(2);
  expect(print).toHaveTextContent("capo 2");
  expect(print).toHaveTextContent("encore");
});
