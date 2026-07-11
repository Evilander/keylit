import { describe, it, expect } from "vitest";
import {
  TUNINGS,
  STANDARD_TUNING,
  getTuning,
  parseTuning,
  detectDeclaredTuning,
  canonicalTuning,
  fretToMidi,
  shapeToMidi,
  tuningSpelling,
  relativeToStandard,
  uniformTuningOffset,
  shapeShiftForTuning,
  chartShiftForGuitar,
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

  it("anchors low A/B strings at A1/B1 instead of an octave up", () => {
    expect(parseTuning("B F# B F# B D#")[0]).toBe(35); // open B low string = B1
    expect(parseTuning("A E A E A C#")[0]).toBe(33);   // drop-A-ish low string = A1
  });
});

describe("down-tuned standards are first-class tunings", () => {
  it("names D standard and Eb standard", () => {
    expect(getTuning("dStandard").name).toBe("D Standard");
    expect(getTuning("ebStandard").name).toBe("Eb Standard");
  });
  it("folds spellings into them", () => {
    expect(getTuning("D G C F A D").id).toBe("dStandard");
    expect(getTuning("Eb Ab Db Gb Bb Eb").id).toBe("ebStandard");
    expect(getTuning("D# G# C# F# A# D#").id).toBe("ebStandard");
  });
  it("keeps whole-step-down pitches right (low D2, high D4)", () => {
    const t = getTuning("dStandard");
    expect(t.notes).toEqual([38, 43, 48, 53, 57, 62]);
  });
});

describe("detectDeclaredTuning — tuning stated in the chart text", () => {
  it("hears a whole step down", () => {
    expect(detectDeclaredTuning("Tuning: standard, one whole step down\n[Verse]")).toBe("dStandard");
    expect(detectDeclaredTuning("Tune down a full step to match the record")).toBe("dStandard");
    expect(detectDeclaredTuning("Tuning: 1 step down (DGCFAD)")).toBe("dStandard");
    expect(detectDeclaredTuning("tuning: D standard")).toBe("dStandard");
  });
  it("hears a half step down", () => {
    expect(detectDeclaredTuning("Tuning: 1/2 step down")).toBe("ebStandard");
    expect(detectDeclaredTuning("Standard tuning, down a half step")).toBe("ebStandard");
    expect(detectDeclaredTuning("down 1/2 step")).toBe("ebStandard");
  });
  it("combines drop D with step-downs", () => {
    expect(detectDeclaredTuning("Tuning: drop D, whole step down")).toBe("dropC");
    expect(detectDeclaredTuning("Tuning: Drop D, half step down")).toBe("dropCsharp");
    expect(detectDeclaredTuning("Tuning: drop d")).toBe("dropD");
  });
  it("reads an explicit spelling on a tuning line", () => {
    expect(detectDeclaredTuning("Tuning: D A D G A D\nchords follow")).toBe("DADGAD");
    expect(detectDeclaredTuning("Tuning: D-G-C-F-A-D")).toBe("dStandard");
  });
  it("reads real-world hyperrust declarations", () => {
    expect(detectDeclaredTuning("Version 1:  Dropped Standard (DGCFAD)")).toBe("dStandard");
    // DADGBD is the same tuning as Double Drop D — folds to the common name
    expect(detectDeclaredTuning("Tuning - DADGBD")).toBe("doubleDropD");
    expect(detectDeclaredTuning("Tuning: D modal, DADGBD.")).toBe("doubleDropD");
    expect(detectDeclaredTuning("Version 1: Dropped-D (DADGBE)")).toBe("dropD");
    expect(detectDeclaredTuning("and I am so in tune with you")).toBeNull();
  });
  it("prefers explicit letters over a prose name anywhere in the text (See You Later)", () => {
    const header = "See You Later\nby Elliott Smith\ntabbed by Ian\nTuning Open C, like on Independence Day and Ballad Of Big Nothing\nCGCEGC\nIntro:";
    expect(detectDeclaredTuning(header)).toBe("C G C E G C");
  });
  it("falls back to tuning NAMES when no letters are given", () => {
    expect(detectDeclaredTuning("Tuning Open D throughout")).toBe("openD");
    expect(detectDeclaredTuning("played in open G")).toBe("openG");
    expect(detectDeclaredTuning("Tuning: drop C")).toBe("dropC");
    expect(detectDeclaredTuning("this one's in dadgad")).toBe("DADGAD");
  });
  it("scans the whole text, not just the header", () => {
    const deep = Array(60).fill("verse line").join("\n") + "\nTuning: 1 step down";
    expect(detectDeclaredTuning(deep)).toBe("dStandard");
  });
  it("reports an EXPLICIT standard (it must block site-convention defaults)", () => {
    expect(detectDeclaredTuning("Capo: 2\nTuning: standard")).toBe("standard");
    expect(detectDeclaredTuning("Tuning: EADGBE")).toBe("standard");
  });
  it("ignores quarter steps, lyric noise, and silence", () => {
    expect(detectDeclaredTuning("Tuning: 1/4 step down (album)")).toBeNull();
    expect(detectDeclaredTuning("I'll step down from the throne\nwhole verse here")).toBeNull();
    expect(detectDeclaredTuning("Capo: 2\njust chords below")).toBeNull();
    expect(detectDeclaredTuning("")).toBeNull();
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

  it("recognizes uniform down-tunings that can reuse standard chord shapes", () => {
    expect(uniformTuningOffset("standard")).toBe(0);
    expect(uniformTuningOffset("ebStandard")).toBe(-1);
    expect(uniformTuningOffset("dStandard")).toBe(-2);
    expect(uniformTuningOffset("dropD")).toBeNull();
    expect(uniformTuningOffset("openD")).toBeNull();
  });

  it("returns the shape compensation needed to preserve concert pitch", () => {
    expect(shapeShiftForTuning("standard")).toBe(0);
    expect(shapeShiftForTuning("ebStandard")).toBe(1);
    expect(shapeShiftForTuning("dStandard")).toBe(2);
    expect(shapeShiftForTuning("dropD")).toBeNull();
  });

  it("combines song transpose, source capo, playing capo, and down-tuning without moving concert pitch", () => {
    expect(chartShiftForGuitar()).toBe(0);
    expect(chartShiftForGuitar({ transpose: 2 })).toBe(2);
    expect(chartShiftForGuitar({ sourceCapo: 5, capo: 5 })).toBe(0);
    expect(chartShiftForGuitar({ sourceCapo: 5, capo: 3 })).toBe(2);
    expect(chartShiftForGuitar({ tuning: "dStandard" })).toBe(2);
    expect(chartShiftForGuitar({ capo: 2, tuning: "dStandard" })).toBe(0);
    expect(chartShiftForGuitar({ transpose: -2, capo: 1, tuning: "ebStandard" })).toBe(-2);
    expect(chartShiftForGuitar({ tuning: "dropD" })).toBeNull();
  });

  it("pcOfString gives the pitch class of an open string", () => {
    expect(pcOfString(STANDARD_TUNING, 0)).toBe(4); // E
    expect(pcOfString(STANDARD_TUNING, 5)).toBe(4); // E
    expect(pcOfString(STANDARD_TUNING, 2)).toBe(2); // D
  });
});

describe("canonicalTuning — twin names fold for tagging", () => {
  it("folds DADGBD into Double Drop D and CGCGCD into Open Csus2", () => {
    expect(canonicalTuning("DADGBD").id).toBe("doubleDropD");
    expect(canonicalTuning("CGCGCD").id).toBe("openCsus2");
    expect(canonicalTuning("dropD").id).toBe("dropD");
    expect(canonicalTuning("C G C G C D").id).toBe("openCsus2");
  });
});

describe("detectDeclaredTuning — spelling on its own line under a header", () => {
  const kurt = `**TUNING**
low to high

G-G-C-G-B-E

tune the A string down a whole step to G. tune the low E up one and a half steps to G.
tune the D string down one step to C.

*NOTE* there is capo on the 1st fret for this one`;

  it("reads a dash-separated spelling below a TUNING header (Blackberry Song)", () => {
    const id = detectDeclaredTuning(kurt);
    expect(id).toBeTruthy();
    expect(id).not.toBe("dStandard");
    expect(id.replace(/\s+/g, " ")).toBe("G G C G B E");
  });

  it("a dash-chained spelling declares even with no header nearby", () => {
    expect(detectDeclaredTuning(`G-G-C-G-B-E
[Verse]
C  G`)).toBe("G G C G B E");
  });

  it("a bare space-separated chord row does NOT declare a tuning", () => {
    expect(detectDeclaredTuning(`[Verse]
C G D A E B
la la la`)).toBe(null);
  });

  it("a chord row does NOT declare even with a tuning mention nearby", () => {
    expect(detectDeclaredTuning(`Tuning is noted at the top
A    B    D      A       B               D
lyrics here`)).toBe(null);
  });

  it("a high-to-low string legend reads as what it is (reversed)", () => {
    // e-B-G-D-A-E chained = standard written high to low
    expect(detectDeclaredTuning(`Tuning
e-B-G-D-A-E`)).toBe("standard");
  });

  it("a chained custom spelling stays low-to-high when neither direction is named", () => {
    expect(detectDeclaredTuning(`G-G-C-G-B-E`)).toBe("G G C G B E");
  });

  it("a Tuning: line written high-to-low is recognized via reversal too", () => {
    expect(detectDeclaredTuning("Tuning: e-B-G-D-A-E")).toBe("standard");
    expect(detectDeclaredTuning("Tuning: D-B-G-D-A-D")).toBe("doubleDropD"); // DADGBD high→low
  });

  it("a compact EBGDAE string legend never outranks the real prose declaration", () => {
    const sheet = `Coming Up Roses
Tune 1/2 step down

[chords]
EBGDAE    EBGDAE
x24442    x02220`;
    expect(detectDeclaredTuning(sheet)).toBe("ebStandard");
  });
});
