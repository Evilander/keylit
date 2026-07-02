import { describe, it, expect } from "vitest";
import { hasTab, findTabBlocks, parseTabBlock, parseTab, tabEventsToMidi, unwrapTab } from "./tab.js";

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

describe("capo support", () => {
  it("shifts every note up by the capo (capo-2 C shape sounds as D)", () => {
    const block = parseTabBlock(C_CHORD.split("\n"), { capo: 2 });
    expect(block.capo).toBe(2);
    const midi = block.events[0].notes.map((n) => n.midi).sort((a, b) => a - b);
    expect(midi).toEqual([50, 54, 57, 62, 66]); // D F# A D F#
  });
  it("parseTab propagates capo to all blocks", () => {
    const parsed = parseTab(MIXED, { capo: 1 });
    expect(parsed.capo).toBe(1);
    expect(tabEventsToMidi(parsed)).toEqual([[49, 53, 56, 61, 65]]);
  });
  it("ignores nonsense capo values", () => {
    const block = parseTabBlock(C_CHORD.split("\n"), { capo: "nope" });
    const midi = block.events[0].notes.map((n) => n.midi).sort((a, b) => a - b);
    expect(midi).toEqual([48, 52, 55, 60, 64]);
  });
  it("combines capo with an alternate tuning", () => {
    const block = parseTabBlock(DROP_D.split("\n"), { capo: 2 });
    const midis = block.events.map((e) => e.notes.map((n) => n.midi));
    expect(midis).toEqual([[40], [43]]); // low D + capo2 = E2, +fret3 = G2
  });
});

describe("impossible two-digit frets", () => {
  it("splits a >24 two-digit number into two single-digit frets", () => {
    const lines = [
      "e|--75----|", "B|--------|", "G|--------|",
      "D|--------|", "A|--------|", "E|--------|",
    ];
    const block = parseTabBlock(lines);
    expect(block.events.map((e) => e.notes[0].fret)).toEqual([7, 5]);
  });
  it("keeps legit high frets like 12", () => {
    const block = parseTabBlock(RIFF.split("\n"));
    expect(block.events[2].notes[0].fret).toBe(12);
  });
});

describe("defaultTuning (song metadata)", () => {
  it("applies the default when the tab lines carry no labels", () => {
    const unlabeled = [
      "|--0--|", "|--0--|", "|--0--|", "|--0--|", "|--0--|", "|--0--|",
    ];
    const block = parseTabBlock(unlabeled, { defaultTuning: "DADGAD" });
    expect(block.tuning.id).toBe("DADGAD");
    const midi = block.events[0].notes.map((n) => n.midi).sort((a, b) => a - b);
    expect(midi).toEqual([38, 45, 50, 55, 57, 62]);
  });
  it("lets the tab's own string labels beat the default", () => {
    const block = parseTabBlock(DROP_D.split("\n"), { defaultTuning: "openE" });
    expect(block.tuning.id).toBe("dropD");
  });
  it("accepts a raw spelling like EADGBE as the default", () => {
    const unlabeled = ["|--1--|", "|--1--|", "|--1--|", "|--1--|", "|--1--|", "|--1--|"];
    const block = parseTabBlock(unlabeled, { defaultTuning: "EADGBE" });
    expect(block.tuning.id).toBe("standard");
  });
});

describe("bass tab", () => {
  it("reads a 4-string E-A-D-G bass tab an octave below guitar", () => {
    const lines = ["G|-------|", "D|-------|", "A|---3---|", "E|-0-----|"];
    const block = parseTabBlock(lines);
    expect(block.tuning.id).toBe("bass");
    const midis = block.events.map((e) => e.notes[0].midi);
    expect(midis).toEqual([28, 36]); // E1 open, then A-string fret 3 = C2
  });
});

describe("hard-wrapped tab lines (scraper artifact)", () => {
  // Real corpus files wrap wide tab lines at ~100 chars, orphaning a short
  // tail like " --|" under each string line. Those must be rejoined.
  const pad = (s, n) => s + "-".repeat(n - s.length);
  const WRAPPED = [
    pad("E|-----------------0-------|-------------0-----------", 100), " --|",
    pad("B|-------------3-------3---|---------3-------3-------", 100), " --|",
    pad("G|---------0---------------|-----2-------4-p2-p0-----", 100), " --|",
    pad("D|-----2-------------------|-0-----------------------", 100), " 0-|",
    pad("A|-3-----------------------|--------------------------", 100), " --|",
    pad("E|--------------------------|-------------------------", 100), " --|",
  ].join("\n");

  it("rejoins wrapped tails into one 6-line block", () => {
    const blocks = findTabBlocks(WRAPPED);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines).toHaveLength(6);
    expect(blocks[0].lines.every((l) => l.trimEnd().endsWith("|"))).toBe(true);
  });

  it("keeps the tail's notes (the D-string 0 near the wrap point)", () => {
    const parsed = parseTab(WRAPPED);
    const all = parsed.events.flatMap((e) => e.notes);
    const dOpen = all.filter((n) => n.string === 2 && n.fret === 0); // D string open
    expect(dOpen.length).toBeGreaterThan(0);
  });

  it("unwrapping is idempotent and leaves chord sheets alone", () => {
    expect(unwrapTab(unwrapTab(WRAPPED))).toBe(unwrapTab(WRAPPED));
    expect(unwrapTab(CHORDS_ONLY)).toBe(CHORDS_ONLY);
    expect(unwrapTab(MIXED)).toBe(MIXED);
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
