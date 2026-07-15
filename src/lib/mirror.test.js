import { describe, it, expect } from "vitest";
import { parseSheet, detectKey, chordSymbol, parseChord } from "./theory.js";
import { fingerprint, adjacentPossible, mirrorLines, MOVES } from "./mirror.js";

const work = (sheet) => {
  const { progression } = parseSheet(sheet);
  const k = detectKey(progression);
  return { progression, key: { tonic: k.tonic, mode: k.mode } };
};

// a body of work: major-key, plagal-leaning, no borrowing, no sus, no slash
const PLAIN_WORKS = [
  work("[Verse]\nC F C F\n[Chorus]\nC F Am F C"),
  work("[Verse]\nC F C F\n[Chorus]\nF C F C"),
  work("[Verse]\nG C G C\n[Chorus]\nG C Em C G"),
];

describe("fingerprint — the evidence, counted", () => {
  it("refuses to guess from thin evidence", () => {
    expect(fingerprint([work("[V]\nC F G")])).toBeNull();
    expect(fingerprint([])).toBeNull();
  });

  it("counts what the works actually do", () => {
    const fp = fingerprint(PLAIN_WORKS);
    expect(fp).not.toBeNull();
    expect(fp.works).toBe(3);
    expect(fp.topKey).toMatch(/major/);
    expect(fp.minorKeyWorks).toBe(0);
    expect(fp.borrowedRate).toBe(0);
    expect(fp.slashRate).toBe(0);
    expect(fp.qual.sus).toBe(0);
    // plagal city: S→T all over these sheets
    expect(fp.cadPlagal).toBeGreaterThan(fp.cadAuthentic);
    // 1→4 or 4→1 should dominate the bigrams
    expect(fp.topBigrams[0][0]).toMatch(/^(1→4|4→1)$/);
  });

  it("hears borrowing when it's there", () => {
    const fp = fingerprint([
      work("[Verse]\nC F C Ab\n[Chorus]\nC F C Ab C F C Ab C F C"),
      work("[Verse]\nC Ab F C Ab F C Ab F C"),
    ]);
    expect(fp.borrowedRate).toBeGreaterThan(0.15);
  });
});

describe("adjacentPossible — one door, playable now", () => {
  it("offers the plain writer their first missing door, chords included", () => {
    const fp = fingerprint(PLAIN_WORKS);
    const door = adjacentPossible(fp);
    expect(door).not.toBeNull();
    expect(door.chords.length).toBeGreaterThanOrEqual(2);
    // every offered chord is real and parseable
    for (const ch of door.chords) expect(parseChord(chordSymbol(ch))).not.toBeNull();
    // built in the player's own home key
    expect(door.keyName).toBe(fp.topKey.split(" ")[0]);
  });

  it("is deterministic", () => {
    const fp = fingerprint(PLAIN_WORKS);
    expect(adjacentPossible(fp).id).toBe(adjacentPossible(fp).id);
  });

  it("every MOVE in the catalog builds valid chords from any tonic", () => {
    for (const m of MOVES) {
      for (const tonic of [0, 3, 7, 10]) {
        const chords = m.chords(tonic).filter(Boolean);
        expect(chords.length, m.id).toBeGreaterThanOrEqual(2);
        for (const ch of chords) expect(parseChord(chordSymbol(ch)), `${m.id}@${tonic}`).not.toBeNull();
      }
    }
  });

  it("null in, null out", () => {
    expect(adjacentPossible(null)).toBeNull();
  });
});

describe("mirrorLines — speech, not charts", () => {
  it("speaks in sentences about the actual habits", () => {
    const fp = fingerprint(PLAIN_WORKS);
    const lines = mirrorLines(fp, { count: 8, topTitle: "New Partner", topCount: 5 });
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const all = lines.join(" ");
    expect(all).toMatch(/plagal|the 4/i);        // it noticed the lean
    expect(all).toMatch(/major/i);                // it noticed the brightness
    expect(all).toMatch(/New Partner/);           // it noticed the devotion
    for (const l of lines) expect(l.length).toBeGreaterThan(20); // sentences, not labels
  });

  it("says nothing when there's nothing to say", () => {
    expect(mirrorLines(null)).toEqual([]);
  });
});
