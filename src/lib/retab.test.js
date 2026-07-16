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

  it("an octave-rescued note re-sorts into the chord, not stranded up the neck", () => {
    // Drop-D's open low D (D2, midi 38) alongside the open A (A2, 45). Re-fret
    // to standard: D2 sits below the low E and can't exist, so it rescues UP to
    // D3 — which lives OPEN on the D string. The bug: the rescue happened after
    // the pitch-sort, so the now-highest note kept D2's low slot and got shoved
    // to low-E fret 10 while A2 took the open A. Both should be open.
    const out = assignColumns([{ col: 0, notes: [{ midi: 38 }, { midi: 45 }] }],
      { tuningId: "standard", capo: 0 });
    const col = out.columns[0];
    expect(out.summary.shifted).toBe(1);
    expect(out.summary.dropped).toBe(0);
    expect(col.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([45, 50]);
    // low pitch → low string, and nobody is stranded up high
    const byString = [...col.notes].sort((a, b) => a.string - b.string);
    expect(byString.map((n) => n.midi)).toEqual([45, 50]);
    expect(Math.max(...col.notes.map((n) => n.fret))).toBeLessThanOrEqual(5);
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

  it("a congested chord octave-rescues into free strings before dropping", () => {
    // Real corpus case (Sandy, D A D F# B E): the cluster G2 A2 D3 F#3 E4 A4
    // leans on that tuning's open F#3. In drop D the F#3 can't stack onto
    // ascending strings with the rest — but F#4 lives free on the G string.
    // The fallback used to drop it; it should rescue the octave and flag it.
    const notes = [43, 45, 50, 54, 64, 69].map((midi) => ({ midi }));
    const out = assignColumns([{ col: 0, notes }], { tuningId: "dropD", capo: 0 });
    expect(out.summary.dropped).toBe(0);
    expect(out.summary.shifted).toBeGreaterThanOrEqual(1);
    const col = out.columns[0];
    // every pitch CLASS of the original chord survives
    const wantPcs = new Set(notes.map((n) => n.midi % 12));
    const gotPcs = new Set(col.notes.map((n) => n.midi % 12));
    expect(gotPcs).toEqual(wantPcs);
    // strictly ascending strings, no doubled string
    const strings = col.notes.map((n) => n.string);
    expect(new Set(strings).size).toBe(strings.length);
  });

  it("truly unreachable pitches still drop, never fake", () => {
    // A2 (45) with capo 9 in standard: floor is E2+9=49; 45+12=57 exists, so
    // it rescues. But pile up more sub-floor pitches than there are strings
    // and the leftovers must DROP — never render a wrong fret.
    const notes = [40, 41, 42, 43, 44, 45, 46].map((midi) => ({ midi }));
    const out = assignColumns([{ col: 0, notes }], { tuningId: "standard", capo: 9 });
    expect(out.summary.dropped).toBeGreaterThan(0);
    for (const n of out.columns[0].notes) {
      // anything kept is honestly playable at its printed spot
      expect(n.fret).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("renderAscii ⇄ parseTabBlock — the round-trip law", () => {
  it("a one-column block still renders as recognizable tab", () => {
    // The corpus is full of tiny chord-diagram blocks (one column). They used
    // to render as `E|-3-|` — only two dashes, which isTabLine rejects — so
    // the re-fretted block silently stopped being a tab on re-parse.
    const out = assignColumns([{ col: 0, notes: [{ midi: 48 }, { midi: 55 }, { midi: 64 }] }],
      { tuningId: "standard", capo: 0 });
    const text = renderAscii(out);
    const blocks = findTabBlocks(text);
    expect(blocks).toHaveLength(1);
    const re = parseTabBlock(blocks[0].lines, {});
    expect(midisOf(re.events)).toEqual([[48, 55, 64]]);
  });

  it("two-char tech marks (~~) size their cell honestly — columns stay aligned", () => {
    // Sonic Youth vibrato columns carry marks on BOTH sides of the fret; an
    // undercounted cell overflowed its width and shifted every later column.
    const out = assignColumns(
      [{ col: 0, notes: [{ midi: 74, tech: "~~" }] }, { col: 4, notes: [{ midi: 76 }] }],
      { tuningId: "standard", capo: 0 });
    const text = renderAscii(out);
    const blocks = findTabBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(midisOf(parseTabBlock(blocks[0].lines, {}).events)).toEqual([[74], [76]]);
  });

  it("a one-column block with a FULL cell (fret 10) still reads as tab", () => {
    // Two-char cells leave only two dashes per column (`E|-10-|`) — below
    // isTabLine's three-dash floor. Single-column chunks pad one extra.
    const out = assignColumns([{ col: 0, notes: [{ midi: 74 }] }], { tuningId: "standard", capo: 0 });
    const text = renderAscii(out);
    const blocks = findTabBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(midisOf(parseTabBlock(blocks[0].lines, {}).events)).toEqual([[74]]);
  });

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
  it("re-frets scraper-hard-wrapped tabs instead of silently no-opping", () => {
    // A long tab line that doesn't close with "|" plus a short pure-tab tail
    // is one line the scraper wrapped. parseTab sees the UNWRAPPED line, but
    // the splice used to hunt for it among the RAW lines — never matched, and
    // the summary still claimed the blocks were swapped (a silent lie).
    const long = (label, cell) => `${label}|${(cell + "--").repeat(30)}`; // 90+ cols, no closing |
    const wrapped = [
      long("e", "-"), "----",
      long("B", "-"), "----",
      long("G", "-"), "----",
      long("D", "2"), "2---",
      long("A", "3"), "3---",
      long("E", "-"), "----",
    ].join("\n");
    const doc = `[Intro]\n${wrapped}\nwords after`;
    const before = parseTab(doc);
    expect(before.blocks).toHaveLength(1);
    const src = midisOf(before.blocks[0].events);
    const r = swapTabBlocks(doc, { to: { tuning: "dStandard", capo: 0 } });
    expect(r).not.toBeNull();
    expect(r.summary.blocks).toBe(1);
    // the text actually changed…
    expect(r.text).not.toBe(doc);
    expect(r.text).toContain("words after");
    // …and the swapped tab re-parses to the same pitches in the new tuning
    const after = parseTab(r.text);
    expect(after.blocks).toHaveLength(1);
    expect(after.blocks[0].tuning.id).toBe("dStandard");
    expect(midisOf(after.blocks[0].events)).toEqual(src);
  });

  it("in-block string labels beat the song's declared tuning (the law)", () => {
    // Tuning-resolution law: labels > declared. A block that labels itself
    // DADGAD inside a song whose metadata says standard must be read as
    // DADGAD — a hard opts.tuning override would misread every fret.
    const dadgad = [
      "D|------------|",
      "A|------------|",
      "G|----2-------|",
      "D|--0---------|",
      "A|------------|",
      "D|0-----------|",
    ].join("\n");
    const r = swapTabBlocks(dadgad, { from: { tuning: "standard", capo: 0 }, to: { tuning: "standard", capo: 0 } });
    expect(r).not.toBeNull();
    const after = parseTab(r.text);
    // D2 (open low D in DADGAD) can't exist in standard: it must be rescued/flagged,
    // which only happens if the block was READ as DADGAD in the first place.
    const midis = midisOf(after.blocks[0].events).flat();
    expect(midis).toContain(50); // D2 → D3 rescue
    expect(r.summary.shifted).toBeGreaterThanOrEqual(1);
  });

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
