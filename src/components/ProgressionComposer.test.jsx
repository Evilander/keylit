// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import { createDraft } from "../lib/composition.js";
import ProgressionComposer from "./ProgressionComposer.jsx";

const draft = createDraft({
  id: "draft-1",
  name: "Song",
  key: { tonic: 0, mode: "major" },
  sections: [{
    id: "verse",
    name: "Verse",
    chords: [{ id: "c1", symbol: "C" }, { id: "c2", symbol: "G" }],
  }],
});

const baseProps = {
  draft,
  selection: { sectionId: "verse", chordId: "c1", gapIndex: null },
  spelling: "sharps",
  onSelect: vi.fn(),
  onEdit: vi.fn(),
  onAudition: vi.fn(),
  onUndo: vi.fn(),
};

describe("ProgressionComposer", () => {
  it("accepts any parseable chord and rejects an invalid symbol", () => {
    const onEdit = vi.fn();
    render(<ProgressionComposer {...baseProps} selection={{ sectionId: "verse", gapIndex: 2 }} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("tab", { name: "Any chord" }));
    const input = screen.getByLabelText("Chord symbol");
    fireEvent.change(input, { target: { value: "C#m9/G#" } });
    fireEvent.click(screen.getByRole("button", { name: "Add C#m9/G#" }));
    expect(onEdit).toHaveBeenCalledWith({ type: "chord/insert", sectionId: "verse", index: 2, symbol: "C#m9/G#" });
    fireEvent.change(input, { target: { value: "H13" } });
    expect(screen.getByText("chord not recognized")).toBeInTheDocument();
  });

  it("emits stable move, duplicate, and delete operations", () => {
    const onEdit = vi.fn();
    render(<ProgressionComposer {...baseProps} onEdit={onEdit} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "C · chord 1" }), { key: "ArrowRight", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate C" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete G" }));
    expect(onEdit).toHaveBeenCalledWith({ type: "chord/move", sectionId: "verse", chordId: "c1", toIndex: 1 });
    expect(onEdit).toHaveBeenCalledWith({ type: "chord/duplicate", sectionId: "verse", chordId: "c1" });
    expect(onEdit).toHaveBeenCalledWith({ type: "chord/delete", sectionId: "verse", chordId: "c2" });
  });

  it("adds named and custom sections and exposes undo", () => {
    const onEdit = vi.fn();
    const onUndo = vi.fn();
    render(<ProgressionComposer {...baseProps} canUndo onEdit={onEdit} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.click(screen.getByRole("button", { name: "Chorus" }));
    expect(onEdit).toHaveBeenCalledWith({ type: "section/add", name: "Chorus" });
    fireEvent.click(screen.getByRole("button", { name: "Undo last edit" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("keeps the conventional key label separate from sharp chart spelling", () => {
    const flat = createDraft({
      id: "flat", name: "Flat", key: { tonic: 8, mode: "major" },
      sections: [{ id: "s", name: "Verse", chords: [{ id: "ab", symbol: "Ab" }] }],
    });
    render(<ProgressionComposer {...baseProps} draft={flat} selection={{ sectionId: "s", chordId: "ab" }} />);
    expect(screen.getByRole("button", { name: "G# · chord 1" })).toHaveAttribute("title", expect.stringMatching(/piano says A/));
  });

  it("auditions the current section and whole draft without changing it", () => {
    const onAudition = vi.fn();
    render(<ProgressionComposer {...baseProps} onAudition={onAudition} />);
    fireEvent.click(screen.getByRole("button", { name: "Section" }));
    fireEvent.click(screen.getByRole("button", { name: "Whole song" }));
    expect(onAudition).toHaveBeenCalledTimes(2);
    expect(onAudition.mock.calls[0][0]).toHaveLength(2);
  });
});
