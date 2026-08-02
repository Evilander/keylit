import { describe, it, expect } from "vitest";
import { hasTab, findTabBlocks, parseTabBlock, parseTab, tabEventsToMidi, unwrapTab, tokenizeTabLine } from "./tab.js";

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

  // Transcribers write instructions in the margin, past the closing bar
  // ("| X as many times as needed"). The row is still a tab row — judging it
  // on the prose sank the whole system and opened the song as a dead page.
  it("detects a system whose rows carry a trailing prose comment", () => {
    const commented = `All variations of sounds similar to:
 E|----------------------|
 B|--1----1----1----1----|
 G|--0----0----0----0----| X any many times needed in the song
 D|--0----0----0----0----|
 A|--3----3----3----3----|
 E|--3----3----3----3----|`;
    expect(hasTab(commented)).toBe(true);
    const blocks = findTabBlocks(commented);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines).toHaveLength(6);
    // the commented row still resolves its frets
    const parsed = parseTabBlock(blocks[0].lines);
    expect(tabEventsToMidi(parsed).flat().length).toBeGreaterThan(0);
  });

  it("reads frets from a row commented past the bar", () => {
    const withProse = `e|--0-------------------|
B|--1----1----1----1----| let this ring out
G|--0----0----0----0----|
D|--2----2----2----2----|
A|--3----3----3----3----|
E|----------------------|`;
    const block = parseTabBlock(withProse.split("\n"));
    // first column is an open C chord: C3 E3 G3 C4 E4 — the B string's fret 1
    // (MIDI 60) is only there if the commented row was read
    expect(block.events[0].notes.map((n) => n.midi).sort((a, b) => a - b))
      .toEqual([48, 52, 55, 60, 64]);
  });

  it("still rejects prose that merely contains dashes and a pipe", () => {
    const prose = `Verse:
--- and then the bridge --- play it soft | twice
--- watch the timing here --- it drags a little
--- the last line rings out --- let it decay
--- then straight into the chorus --- no pause`;
    expect(hasTab(prose)).toBe(false);
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

  it("string-NUMBER prefixes are not frets ('1e|--3--' plays fret 3, not 1)", () => {
    const numbered = [
      "1e|--3--|",
      "2B|-----|",
      "3G|--0--|",
      "4D|-----|",
      "5A|-----|",
      "6E|-----|",
    ].join("\n");
    const block = parseTabBlock(numbered.split("\n"));
    expect(block.tuning.id).toBe("standard"); // labels still resolve
    const midis = block.events.flatMap((e) => e.notes.map((n) => n.midi)).sort((a, b) => a - b);
    expect(midis).toEqual([55, 67]); // G3 open + e fret 3 — no phantom 1/2/…/6 frets
  });

  it("string-legend rows (Lou Reed charts) yield no phantom notes", () => {
    // A tuning legend, not music: string number + note name + fret-position
    // note names. The leading digits used to parse as frets at column 0,
    // fabricating a bogus one-column "chord" (and lighting bogus piano keys).
    const legend = [
      "1c# ------||---|-d#-|---|---|---|",
      "2G# ------||---|-A#-|---|---|---|",
      "3E  ------||---|-F#-|---|---|---|",
      "4B  ------||---|-C#-|---|---|---|",
      "5F# ------||---|-G#-|---|---|---|",
      "6C# ------||---|-D#-|---|---|---|",
    ].join("\n");
    const block = parseTabBlock(legend.split("\n"));
    expect(block.events).toHaveLength(0);
  });

  it("a bend like '2b3' keeps its fret 2 — the number-prefix guard must not eat it", () => {
    const bend = [
      "e|-----|",
      "B|-----|",
      "G|2b3--|",
      "D|-----|",
      "A|-----|",
      "E|-----|",
    ].join("\n");
    const block = parseTabBlock(bend.split("\n"));
    const midis = block.events.flatMap((e) => e.notes.map((n) => n.midi));
    expect(midis).toContain(57); // G3 + 2
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

describe("muted strings — the X real tabs actually use", () => {
  // Scraped tabs mute strings with uppercase X at least as often as x. A line
  // like "A|-X--X--0" must still read as tab, or the block splits at the A
  // string and the whole bottom half of the tab (the bass line!) is dropped.
  const MUTED_X = [
    "E|-0--0--0",
    "B|-0--0--0",
    "G|-2--2--2",
    "D|-2--2--2",
    "A|-X--X--0",
    "E|-2--4---",
  ].join("\n");

  it("keeps X-muted string lines inside the block", () => {
    const blocks = findTabBlocks(MUTED_X);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines).toHaveLength(6);
  });

  it("still reads the tuning from all six labels and keeps the bass notes", () => {
    const block = parseTabBlock(MUTED_X.split("\n"));
    expect(block.tuning.id).toBe("standard");
    expect(block.events.map((e) => e.col)).toEqual([3, 6, 9]);
    expect(block.events[0].notes.map((n) => n.midi)).toEqual([42, 52, 57, 59, 64]);
    expect(block.events[1].notes.map((n) => n.midi)).toEqual([44, 52, 57, 59, 64]);
    expect(block.events[2].notes.map((n) => n.midi)).toEqual([45, 52, 57, 59, 64]);
  });

  it("never turns an X into a note (only the open A sounds)", () => {
    const block = parseTabBlock(MUTED_X.split("\n"));
    const aString = block.events.flatMap((e) => e.notes).filter((n) => n.string === 1);
    expect(aString).toHaveLength(1);
    expect(aString[0].fret).toBe(0);
  });

  it("captures uppercase technique marks like 7H9", () => {
    const lines = [
      "e|------------|", "B|------------|", "G|--7H9--12---|",
      "D|------------|", "A|------------|", "E|------------|",
    ];
    const block = parseTabBlock(lines);
    const flat = block.events.map((e) => ({ fret: e.notes[0].fret, tech: e.notes[0].tech }));
    expect(flat).toEqual([
      { fret: 7, tech: "H" },
      { fret: 9, tech: "H" },
      { fret: 12, tech: "" },
    ]);
  });

  it("rejoins a wrapped tail that contains muted X", () => {
    const pad = (s, n) => s + "-".repeat(n - s.length);
    const wrapped = [
      pad("E|---0---", 100), "--0-|",
      pad("B|---1---", 100), "--1-|",
      pad("G|---0---", 100), "--0-|",
      pad("D|---2---", 100), "--2-|",
      pad("A|---3---", 100), "-XX-|",
      pad("E|---X---", 100), "--0-|",
    ].join("\n");
    const blocks = findTabBlocks(wrapped);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines).toHaveLength(6);
    expect(blocks[0].lines.every((l) => l.trimEnd().endsWith("|"))).toBe(true);
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

describe("tokenizeTabLine — display runs", () => {
  it("always reproduces the exact line when runs are concatenated", () => {
    const lines = [
      "E|-0--0--0",
      "A|-X--X--0--X--X--0--1-",
      "G|--7h9--12b14r12---|",
      "e|---0---|",
      "|--0--|",
      "D|-----2-------------------|-0------- 0-|",
    ];
    for (const l of lines) {
      expect(tokenizeTabLine(l).map((r) => r.text).join("")).toBe(l);
    }
  });

  it("classifies label, grid, mutes, and frets on a muted-X line", () => {
    const runs = tokenizeTabLine("A|-X--X--0");
    expect(runs).toEqual([
      { kind: "label", text: "A|" },
      { kind: "grid", text: "-" },
      { kind: "mute", text: "X" },
      { kind: "grid", text: "--" },
      { kind: "mute", text: "X" },
      { kind: "grid", text: "--" },
      { kind: "fret", text: "0" },
    ]);
  });

  it("tags technique marks between frets, either case", () => {
    const runs = tokenizeTabLine("G|--7h9--12B14---|");
    const kinds = runs.map((r) => `${r.kind}:${r.text}`);
    expect(kinds).toEqual([
      "label:G|", "grid:--", "fret:7", "tech:h", "fret:9",
      "grid:--", "fret:12", "tech:B", "fret:14", "grid:---|",
    ]);
  });

  it("handles unlabeled lines (no label run)", () => {
    const runs = tokenizeTabLine("|--0--|");
    expect(runs[0]).toEqual({ kind: "grid", text: "|--" });
    expect(runs.some((r) => r.kind === "label")).toBe(false);
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
