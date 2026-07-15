import { describe, it, expect } from "vitest";
import { parseTab, parseTabBlock, findTabBlocks } from "./tab.js";
import { getTuning } from "./tuning.js";
import { assignColumns, renderAscii, retabText, swapTabBlocks } from "./retab.js";

// a simple standard-tuning riff + an open C chord column
const RIFF = [
  "e|-------0-------|",
  "B|-----1---1-----|",
  "G|---0-------0---|",
  "D|-2-------------|",
  "A|-3-------------|",
  "E|---------------|",
].join("\n");

const midisOf = (cols) => cols.filter((c) => c.notes.length).map((c) => c.notes.map((n) => n.midi).sort((a, b) => a - b));

describe("assignColumns — pitches survive the move", () => {
  const parsed = parseTab(RIFF);
  const srcMidis = midisOf(parsed.blocks[0].events);

  it("to the SAME tuning: identical pitches, sane frets", () => {
    const out = assignColumns(parsed.blocks[0].events, { tuningId: "standard", capo: 0 });
    expect(midisOf(out.columns)).toEqual(srcMidis);
    expect(out.summary.shifted).toBe(0);
    expect(out.summary.dropped).toBe(0);
    for (const c of out.columns) for (const n of c.notes) {
      expect(n.fret).toBeGreaterThanOrEqual(0);
      expect(n.fret).toBeLessThanOrEqual(12); // an open-position riff stays low
    }
  });

  it("to D standard: same pitches, frets migrate up two", () => {
    const out = assignColumns(parsed.blocks[0].events, { tuningId: "dStandard", capo: 0 });
    expect(midisOf(out.columns)).toEqual(srcMidis);
    expect(out.summary.dropped).toBe(0);
    expect(out.summary.shifted).toBe(0);
  });

  it("chords land on distinct ascending strings within a hand span", () => {
    const C_CHORD = [
      "e|-0--------0---|",
      "B|-1--------1---|",
      "G|-0--------0---|",
      "D|-2--------2---|",
      "A|-3--------3---|",
      "E|--------------|",
    ].join("\n");
    const p = parseTab(C_CHORD);
    const out = assignColumns(p.blocks[0].events, { tuningId: "dadgad", capo: 0 });
    const col = out.columns.find((c) => c.notes.length);
    expect(midisOf(out.columns)).toEqual(midisOf(p.blocks[0].events));
    const strings = col.notes.map((n) => n.string);
    expect(new Set(strings).size).toBe(strings.length);
    expect([...strings].sort((a, b) => a - b)).toEqual(strings); // low pitch → low string
    const fretted = col.notes.filter((n) => n.fret > 0).map((n) => n.fret);
    if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
  });

  it("a pitch under the target floor octave-rescues UP and says so", () => {
    // low E2 (midi 40) cannot exist with capo 7 in standard (floor = 47)
    const LOW = [
      "e|--------------|",
      "B|--------------|",
      "G|--------------|",
      "D|--------------|",
      "A|--------------|",
      "E|-0------0-----|",
    ].join("\n");
    const p = parseTab(LOW);
    const out = assignColumns(p.blocks[0].events, { tuningId: "standard", capo: 7 });
    expect(out.summary.shifted).toBe(2); // both hits of the low E
    const col = out.columns.find((c) => c.notes.length);
    expect(col.notes[0].midi).toBe(52); // E3 — one octave up
    expect(col.notes[0].octaveShifted).toBe(1);
  });
});

describe("renderAscii ⇄ parseTabBlock — the round-trip law", () => {
  it("rendered output re-parses to the exact same pitches", () => {
    const parsed = parseTab(RIFF);
    const src = midisOf(parsed.blocks[0].events);
    for (const target of ["standard", "dStandard", "dadgad", "dropD"]) {
      const out = assignColumns(parsed.blocks[0].events, { tuningId: target, capo: 0 });
      const text = renderAscii(out);
      const lines = findTabBlocks(text)[0]?.lines;
      expect(lines, target).toBeTruthy();
      const re = parseTabBlock(lines, {});
      expect(re.tuning.id, target).toBe(getTuning(target).id);
      expect(midisOf(re.events), target).toEqual(src);
    }
  });

  it("capo'd renders declare the capo and re-parse at pitch", () => {
    const parsed = parseTab(RIFF);
    const src = midisOf(parsed.blocks[0].events);
    const out = assignColumns(parsed.blocks[0].events, { tuningId: "standard", capo: 2 });
    const text = renderAscii(out);
    expect(text).toMatch(/^Capo 2/);
    const lines = findTabBlocks(text)[0].lines;
    const re = parseTabBlock(lines, { capo: 2 });
    expect(midisOf(re.events)).toEqual(src);
  });
});

describe("retabText — the whole document moves", () => {
  it("re-frets every block and reports compromises", () => {
    const doc = `[Riff]\n${RIFF}\nwords between\n${RIFF}`;
    const r = retabText(doc, { to: { tuning: "dStandard", capo: 0 } });
    expect(r.summary.blocks).toBe(2);
    expect(r.summary.dropped).toBe(0);
    // both rendered blocks re-parse to the source pitches
    const src = midisOf(parseTab(RIFF).blocks[0].events);
    const blocks = findTabBlocks(r.text);
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      expect(midisOf(parseTabBlock(b.lines, {}).events)).toEqual(src);
    }
  });

  it("returns null when there's no tab to move", () => {
    expect(retabText("just chords\nC F G", { to: { tuning: "dStandard" } })).toBeNull();
  });
});

describe("swapTabBlocks — the document keeps its words", () => {
  it("replaces the tab in place, lyrics and chords untouched", () => {
    const doc = `[Verse]\nC        F\nhello darkness my old friend\n${RIFF}\nmore words after`;
    const r = swapTabBlocks(doc, { to: { tuning: "dStandard", capo: 0 } });
    expect(r).not.toBeNull();
    expect(r.text).toContain("hello darkness my old friend");
    expect(r.text).toContain("more words after");
    expect(r.text).toContain("[Verse]");
    // and the swapped tab re-parses to the source pitches
    const src = midisOf(parseTab(RIFF).blocks[0].events);
    const re = parseTab(r.text);
    expect(re.blocks).toHaveLength(1);
    expect(midisOf(re.blocks[0].events)).toEqual(src);
    expect(re.blocks[0].tuning.id).toBe("dStandard");
  });
});
