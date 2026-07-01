import { describe, it, expect } from "vitest";
import { hasTab, findTabBlocks, parseTabBlock, parseTab, tabEventsToMidi } from "./tab.js";

const C_CHORD = `e|---0---|
B|---1---|
G|---0---|
D|---2---|
A|---3---|
E|-------|`;

const DROP_D = `e|--------|
B|--------|
G|--------|
D|--------|
A|--------|
D|--0--3--|`;

const RIFF = `e|------------|
B|------------|
G|--7h9--12---|
D|------------|
A|------------|
E|------------|`;

const MIXED = `Verse 1:
C        G
Walking down the road

e|---0---|
B|---1---|
G|---0---|
D|---2---|
A|---3---|
E|-------|

And then the chorus`;

const CHORDS_ONLY = `Verse:
C       G       Am      F
Here come old flat top he come`;

describe("hasTab / detection", () => {
  it("detects a tab block in mixed text", () => {
    expect(hasTab(MIXED)).toBe(true);
  });
  it("does not flag a pure chord sheet as tab", () => {
    expect(hasTab(CHORDS_ONLY)).toBe(false);
  });
  it("findTabBlocks returns one 6-line block from mixed text", () => {
    const blocks = findTabBlocks(MIXED);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines).toHaveLength(6);
  });
});

describe("parseTabBlock — note resolution", () => {
  it("resolves a C chord column to the correct MIDI notes (standard)", () => {
    const block = parseTabBlock(C_CHORD.split("\n"));
    expect(block.tuning.id).toBe("standard");
    expect(block.events).toHaveLength(1);
    const midi = block.events[0].notes.map((n) => n.midi).sort((a, b) => a - b);
    expect(midi).toEqual([48, 52, 55, 60, 64]); // C E G C E
  });

  it("derives drop D from the string labels and resolves the low D", () => {
    const block = parseTabBlock(DROP_D.split("\n"));
    expect(block.tuning.id).toBe("dropD");
    const midis = block.events.map((e) => e.notes.map((n) => n.midi));
    expect(midis).toEqual([[38], [41]]); // low D open, then 3rd fret = F2
  });

  it("handles two-digit frets and captures technique markers", () => {
    const block = parseTabBlock(RIFF.split("\n"));
    const flat = block.events.map((e) => ({
      midi: e.notes[0].midi,
      tech: e.notes[0].tech,
    }));
    // G string (open G3=55): fret 7 -> 62, fret 9 -> 64, fret 12 -> 67
    expect(flat).toEqual([
      { midi: 62, tech: "h" },
      { midi: 64, tech: "h" },
      { midi: 67, tech: "" },
    ]);
  });

  it("respects a tuning override over the labels", () => {
    const block = parseTabBlock(C_CHORD.split("\n"), { tuning: "openE" });
    expect(block.tuning.id).toBe("openE");
  });
});

describe("parseTab — whole document", () => {
  it("parses all blocks and yields a flat MIDI event stream", () => {
    const parsed = parseTab(MIXED);
    expect(parsed.blocks).toHaveLength(1);
    const midi = tabEventsToMidi(parsed);
    expect(midi).toEqual([[48, 52, 55, 60, 64]]);
  });

  it("returns no blocks for a chord-only sheet", () => {
    const parsed = parseTab(CHORDS_ONLY);
    expect(parsed.blocks).toHaveLength(0);
    expect(parsed.events).toHaveLength(0);
  });
});
