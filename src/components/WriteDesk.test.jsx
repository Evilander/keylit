// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import { createDraft, deriveProgression } from "../lib/composition.js";
import { createDraftBook } from "../storage.js";

vi.mock("../lib/generate.js", async (original) => {
  const actual = await original();
  return {
    ...actual,
    generateProgression: vi.fn(() => ({
      name: "I-V-vi-IV",
      chords: ["C", "G", "Am", "F"].map(actual.parseChord || (() => null)),
    })),
  };
});

import { generateProgression } from "../lib/generate.js";
import { parseChord } from "../lib/theory.js";
import WriteDesk from "./WriteDesk.jsx";

const memoryBackend = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || "",
    setItem: (key, value) => values.set(key, value),
  };
};

const draft = createDraft({
  id: "draft",
  name: "Working title",
  key: { tonic: 0, mode: "major" },
  lyrics: "first line",
  sections: [{
    id: "verse",
    name: "Verse",
    chords: ["C", "C", "F", "G7"].map((symbol, index) => ({ id: `c${index}`, symbol })),
  }],
});

const props = {
  draft,
  selection: { sectionId: "verse", chordId: "c0", gapIndex: null },
  activeKey: draft.key,
  voicings: [[48, 52, 55], [48, 52, 55], [53, 57, 60], [55, 59, 62]],
  onEdit: vi.fn(),
  onUndo: vi.fn(),
  onSelect: vi.fn(),
  onReplaceDraft: vi.fn(),
  onAudition: vi.fn(),
  onPlay: vi.fn(),
  nowStamp: () => 42,
};

describe("WriteDesk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves and reopens the exact isolated draft with repeats and lyrics", () => {
    const book = createDraftBook(memoryBackend());
    const onReplaceDraft = vi.fn();
    render(<WriteDesk {...props} book={book} onReplaceDraft={onReplaceDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /Keep sketch/i }));
    const saved = book.list()[0];
    expect(deriveProgression(saved).progression.map((chord) => chord.raw)).toEqual(["C", "C", "F", "G7"]);
    expect(saved.lyrics).toBe("first line");
    fireEvent.click(screen.getByRole("button", { name: "Working title" }));
    expect(onReplaceDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "draft", lyrics: "first line" }), { historyMode: "reset" });
  });

  it("reverses only the selected Write section", () => {
    const onEdit = vi.fn();
    render(<WriteDesk {...props} book={createDraftBook(memoryBackend())} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: /Reverse the section/i }));
    expect(onEdit).toHaveBeenCalledWith({ type: "section/reverse", sectionId: "verse" });
  });

  it("Spark replaces the Write draft through its explicit draft boundary", () => {
    generateProgression.mockReturnValueOnce({ name: "I-V-vi-IV", chords: ["C", "G", "Am", "F"].map(parseChord) });
    const onReplaceDraft = vi.fn();
    render(<WriteDesk {...props} book={createDraftBook(memoryBackend())} onReplaceDraft={onReplaceDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /^Spark$/i }));
    expect(onReplaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({ sections: [expect.objectContaining({ chords: expect.arrayContaining([expect.objectContaining({ symbol: "C" })]) })] }),
      { historyMode: "push" },
    );
  });

  it("keeps words and key changes inside controlled Write operations", () => {
    const onEdit = vi.fn();
    render(<WriteDesk {...props} book={createDraftBook(memoryBackend())} onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText("Lyric pad"), { target: { value: "new words" } });
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "2" } });
    expect(onEdit).toHaveBeenCalledWith({ type: "draft/lyrics", lyrics: "new words" });
    expect(onEdit).toHaveBeenCalledWith({ type: "draft/key", key: { tonic: 2, mode: "major" } });
    expect(screen.queryByText("Chord Lab")).not.toBeInTheDocument();
  });
});
