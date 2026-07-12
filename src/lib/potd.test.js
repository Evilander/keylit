import { describe, it, expect } from "vitest";
import { PROGRESSIONS, progressionOfTheDay } from "./potd.js";
import { parseChord } from "./theory.js";

describe("PROGRESSIONS — the daily deck", () => {
  it("has a real deck: a dozen or more, each named, lined, and tokened", () => {
    expect(PROGRESSIONS.length).toBeGreaterThanOrEqual(12);
    for (const p of PROGRESSIONS) {
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.line.trim().length).toBeGreaterThan(20); // a real bandmate line
      expect(p.nashville.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("every entry builds real chords in every key", () => {
    for (const p of PROGRESSIONS) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const day = progressionOfTheDay("2026-01-01", { pick: p.id, tonic });
        expect(day.chords.length).toBe(p.nashville.length);
        for (const ch of day.chords) {
          expect(ch).not.toBeNull();
          expect(parseChord(ch.raw), `${p.id}: ${ch.raw} should re-parse`).not.toBeNull();
        }
      }
    }
  });
});

describe("the deck's stranger tier", () => {
  it("carries genuinely spicy entries, not just campfire changes", () => {
    const spicy = PROGRESSIONS.filter((p) => p.spice >= 2);
    expect(spicy.length).toBeGreaterThanOrEqual(5);
  });

  it("builds slash-bass inversion tokens (3/#5 = the Waltz #2 move)", () => {
    const day = progressionOfTheDay("2026-01-01", { pick: "waltz-descent", tonic: 0 });
    const symbols = day.chords.map((c) => c.raw);
    expect(symbols).toContain("E/G#"); // 3 over the sharp-5 bass, in C
    expect(symbols).toContain("D/F#");
  });

  it("the borrowed-dusk mixture lands Fm6 in C", () => {
    const day = progressionOfTheDay("2026-01-01", { pick: "sneaky-two", tonic: 0 });
    expect(day.chords.map((c) => c.raw)).toContain("Fm6");
    expect(day.chords.map((c) => c.raw)).toContain("Bm7♭5");
  });
});

describe("progressionOfTheDay", () => {
  it("is deterministic for a given date", () => {
    const a = progressionOfTheDay("2026-07-05");
    const b = progressionOfTheDay("2026-07-05");
    expect(a.id).toBe(b.id);
    expect(a.key.tonic).toBe(b.key.tonic);
    expect(a.sheet).toBe(b.sheet);
  });

  it("varies across dates (a month sees several different progressions)", () => {
    const seen = new Set();
    for (let d = 1; d <= 30; d++) {
      seen.add(progressionOfTheDay(`2026-06-${String(d).padStart(2, "0")}`).id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("returns a playable sheet: space-separated symbols that all parse", () => {
    const day = progressionOfTheDay("2026-07-05");
    const tokens = day.sheet.split(/\s+/).filter(Boolean);
    expect(tokens.length).toBe(day.chords.length);
    for (const t of tokens) expect(parseChord(t), `${t} should parse`).not.toBeNull();
  });

  it("names the key and stays in a major-key frame", () => {
    const day = progressionOfTheDay("2026-07-05");
    expect(day.keyName).toMatch(/^[A-G](b|#)? major$/);
    expect(day.key.tonic).toBeGreaterThanOrEqual(0);
    expect(day.key.tonic).toBeLessThan(12);
  });

  it("opts.spelling renames the chords but never the key (the backdoor in Eb)", () => {
    // The Backdoor in Eb: 4=Ab, b77=Db7, 1=Eb by the key signature —
    // the sharps preference reads the same pitches as G# C#7 D#.
    const flat = progressionOfTheDay("2026-01-01", { pick: "backdoor", tonic: 3 });
    const sharp = progressionOfTheDay("2026-01-01", { pick: "backdoor", tonic: 3, spelling: "sharps" });
    expect(flat.sheet).toBe("Ab  Db7  Eb");
    expect(sharp.sheet).toBe("G#  C#7  D#");
    expect(sharp.keyName).toBe("Eb major");                 // key names stay conventional
    expect(sharp.chords.map((c) => c.rootSemitone)).toEqual(flat.chords.map((c) => c.rootSemitone)); // labels only
    for (const t of sharp.sheet.split(/\s+/)) expect(parseChord(t)).not.toBeNull();
  });
});
