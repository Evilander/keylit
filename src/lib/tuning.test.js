import { describe, it, expect } from "vitest";
import {
  TUNINGS,
  STANDARD_TUNING,
  getTuning,
  parseTuning,
  fretToMidi,
  shapeToMidi,
  tuningSpelling,
  relativeToStandard,
  pcOfString,
} from "./tuning.js";

describe("named tunings", () => {
  it("standard tuning is E2 A2 D3 G3 B3 E4 in MIDI", () => {
    expect(STANDARD_TUNING).toEqual([40, 45, 50, 55, 59, 64]);
    expect(TUNINGS.standard.notes).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it("drop D lowers only the 6th string a whole step", () => {
    expect(TUNINGS.dropD.notes).toEqual([38, 45, 50, 55, 59, 64]);
  });

  it("DADGAD is D A D G A D ascending", () => {
    expect(TUNINGS.DADGAD.notes).toEqual([38, 45, 50, 55, 57, 62]);
  });

  it("open D is D A D F# A D", () => {
    expect(TUNINGS.openD.notes).toEqual([38, 45, 50, 54, 57, 62]);
  });

  it("open E is E B E G# B E", () => {
    expect(TUNINGS.openE.notes).toEqual([40, 47, 52, 56, 59, 64]);
  });

  it("open G is D G D G B D", () => {
    expect(TUNINGS.openG.notes).toEqual([38, 43, 50, 55, 59, 62]);
  });

  it("every named tuning has 6 ascending-or-equal strings and metadata", () => {
    for (const t of Object.values(TUNINGS)) {
      expect(t.notes).toHaveLength(6);
      for (let i = 1; i < 6; i++) expect(t.notes[i]).toBeGreaterThanOrEqual(t.notes[i - 1]);
      expect(typeof t.name).toBe("string");
      expect(typeof t.family).toBe("string");
    }
  });
});

describe("parseTuning", () => {
  it("parses a spaced spelling into ascending MIDI anchored low", () => {
    expect(parseTuning("E A D G B E")).toEqual([40, 45, 50, 55, 59, 64]);
    expect(parseTuning("D A D G A D")).toEqual([38, 45, 50, 55, 57, 62]);
  });

  it("accepts no-space spellings and flats", () => {
    expect(parseTuning("EADGBE")).toEqual([40, 45, 50, 55, 59, 64]);
    expect(parseTuning("Eb Ab Db Gb Bb Eb")).toEqual([39, 44, 49, 54, 58, 63]);
  });

  it("is case-insensitive on note letters", () => {
    expect(parseTuning("d a d g a d")).toEqual([38, 45, 50, 55, 57, 62]);
  });

  it("returns null on garbage", () => {
    expect(parseTuning("not a tuning")).toBeNull();
    expect(parseTuning("")).toBeNull();
  });
});

describe("getTuning", () => {
  it("resolves a known id", () => {
    expect(getTuning("openG").notes).toEqual([38, 43, 50, 55, 59, 62]);
  });
  it("resolves a free-text spelling to a synthesized tuning", () => {
    const t = getTuning("C G C F C E");
    expect(t.notes).toEqual([36, 43, 48, 53, 60, 64]);
  });
  it("returns standard for null/unknown-but-unparseable", () => {
    expect(getTuning(null).id).toBe("standard");
    expect(getTuning("zzz").id).toBe("standard");
  });
});

describe("fretboard math", () => {
  it("fretToMidi adds the fret to the open-string pitch", () => {
    // low E open = 40, 3rd fret = G2 = 43
    expect(fretToMidi(STANDARD_TUNING, 0, 0)).toBe(40);
    expect(fretToMidi(STANDARD_TUNING, 0, 3)).toBe(43);
    // high E (string index 5) 5th fret = A4 = 69
    expect(fretToMidi(STANDARD_TUNING, 5, 5)).toBe(69);
  });

  it("fretToMidi returns null for a muted string", () => {
    expect(fretToMidi(STANDARD_TUNING, 0, null)).toBeNull();
    expect(fretToMidi(STANDARD_TUNING, 0, -1)).toBeNull();
  });

  it("shapeToMidi maps a 6-fret shape, dropping muted strings, low to high", () => {
    // Open C chord in standard: x32010 => A2-fret? no: strings low->high [x,3,2,0,1,0]
    // C(48? no): string1(A) fret3 = C3=48, string2(D) fret2 = E3=52, string3(G) open=55,
    // string4(B) fret1 = C4=60, string5(e) open=64
    expect(shapeToMidi(STANDARD_TUNING, [null, 3, 2, 0, 1, 0])).toEqual([48, 52, 55, 60, 64]);
  });
});

describe("display helpers", () => {
  it("tuningSpelling renders MIDI back to note names low to high", () => {
    expect(tuningSpelling(STANDARD_TUNING)).toBe("E A D G B E");
    expect(tuningSpelling(TUNINGS.openD.notes)).toBe("D A D F# A D");
  });

  it("relativeToStandard reports per-string offset from standard", () => {
    // drop D: only the 6th string (index 0) is down 2
    expect(relativeToStandard(TUNINGS.dropD.notes)).toEqual([-2, 0, 0, 0, 0, 0]);
    // open E: 5th,4th,3rd strings raised
    expect(relativeToStandard(TUNINGS.openE.notes)).toEqual([0, 2, 2, 1, 0, 0]);
  });

  it("pcOfString gives the pitch class of an open string", () => {
    expect(pcOfString(STANDARD_TUNING, 0)).toBe(4); // E
    expect(pcOfString(STANDARD_TUNING, 5)).toBe(4); // E
    expect(pcOfString(STANDARD_TUNING, 2)).toBe(2); // D
  });
});
