import { describe, it, expect } from "vitest";
import {
  parseChord, parseSheet, transposeChord, chordSymbol,
  nashville, romanNumeral, detectKey, harmonicFunction, CIRCLE_OF_FIFTHS,
  shapeForCapo, shapeEase, suggestCapo, normalizeChart,
  spellScale, degreeOf, pedalRelation, buildChord, qualClass, isDominantQuality,
  sameChordSound,
} from "./theory.js";

describe("parseChord", () => {
  it("parses a major triad", () => {
    const c = parseChord("E");
    expect(c.rootSemitone).toBe(4);
    expect(c.quality).toBe("maj");
    expect(c.intervals).toEqual([0, 4, 7]);
  });

  it("distinguishes m7 from M7", () => {
    expect(parseChord("Gm7").quality).toBe("m7");
    expect(parseChord("GM7").quality).toBe("maj7");
  });

  it("parses slash chords", () => {
    const c = parseChord("E/G#");
    expect(c.bassName).toBe("G#");
    expect(c.bassSemitone).toBe(8);
  });

  it("rejects lyric words that start with a note letter", () => {
    expect(parseChord("And")).toBeNull();
    expect(parseChord("Be")).toBeNull();
  });

  it("strips surrounding punctuation", () => {
    expect(parseChord("(F#)").rootName).toBe("F#");
  });
});

describe("parseSheet", () => {
  const sheet = `[Verse]
E                    G#m7
So long, my only friend
A                         E
And then I guess we tried again`;

  it("picks up chord lines and skips lyrics", () => {
    const { progression } = parseSheet(sheet);
    expect(progression.map((c) => c.raw)).toEqual(["E", "G#m7", "A", "E"]);
  });

  it("tags sections", () => {
    const { progression } = parseSheet(sheet);
    expect(progression[0].section).toBe("Verse");
  });

  it("collapses immediate repeats", () => {
    const { progression } = parseSheet("[X]\nF#   F#   F#   B");
    expect(progression.map((c) => c.raw)).toEqual(["F#", "B"]);
  });
});

describe("transposeChord", () => {
  it("moves root and bass by semitones, wrapping the octave", () => {
    const c = transposeChord(parseChord("E/G#"), 5); // up a fourth -> A/C#
    expect(chordSymbol(c)).toBe("A/C#");
  });
});

describe("nashville", () => {
  it("numbers chords relative to the key center", () => {
    const tonic = 4; // E major
    expect(nashville(parseChord("E"), tonic)).toBe("1");
    expect(nashville(parseChord("G#m7"), tonic)).toBe("3m7");
    expect(nashville(parseChord("D"), tonic)).toBe("\u266d7"); // D is flat-7 in E
    expect(nashville(parseChord("E/G#"), tonic)).toBe("1/3");
  });
});

describe("detectKey", () => {
  const key = (sheet) => detectKey(parseSheet("[V]\n" + sheet).progression);

  it("identifies E major from a diatonic-ish progression", () => {
    const k = key("E   G#m7   C#m7   B   A   E   F#");
    expect(k.tonic).toBe(4);
    expect(k.mode).toBe("major");
  });
  it("identifies C major from I-IV-V-I", () => {
    const k = key("C F G C");
    expect(k.tonic).toBe(0);
    expect(k.mode).toBe("major");
  });
  it("identifies G major", () => {
    const k = key("G D Em C G");
    expect(k.tonic).toBe(7);
    expect(k.mode).toBe("major");
  });
  it("identifies A minor (distinguished from C major) via the V chord and landing", () => {
    const k = key("Am Dm E Am");
    expect(k.tonic).toBe(9);
    expect(k.mode).toBe("minor");
  });
  it("identifies E minor", () => {
    const k = key("Em C G D Em");
    expect(k.tonic).toBe(4);
    expect(k.mode).toBe("minor");
  });
  it("identifies F major (a flat key)", () => {
    const k = key("F Bb C F");
    expect(k.tonic).toBe(5);
    expect(k.mode).toBe("major");
  });
});

describe("normalizeChart (importers)", () => {
  it("strips Ultimate-Guitar [ch] tags", () => {
    const { progression } = parseSheet("[Verse]\n[ch]Am[/ch]   [ch]F[/ch]   [ch]C[/ch]\nlyric here");
    expect(progression.map((c) => c.raw)).toEqual(["Am", "F", "C"]);
  });
  it("converts ChordPro inline chords into a chord line over the lyric", () => {
    const n = normalizeChart("[C]Twinkle [G]twinkle [Am]little [F]star");
    expect(n.split("\n")[0]).toBe("C  G  Am  F");
    expect(n.split("\n")[1]).toBe("Twinkle twinkle little star");
  });
  it("drops ChordPro directives", () => {
    const n = normalizeChart("{title: My Song}\n{capo: 2}\nC G Am F");
    expect(n).toBe("C G Am F");
  });
  it("preserves [Verse] / [Chorus] section headers (not chords)", () => {
    const { progression } = parseSheet("[Chorus]\n[C]oh [Bridge]way");
    expect(progression[0].section).toBe("Chorus");
    expect(progression.map((c) => c.raw)).toEqual(["C"]); // 'Bridge' not parsed as a chord
  });
  it("parses a real ChordPro snippet end-to-end", () => {
    const cp = "{soc}\n[G]Hey [D]Jude don't [Em]make it [C]bad\n{eoc}";
    const { progression } = parseSheet(cp);
    expect(progression.map((c) => c.raw)).toEqual(["G", "D", "Em", "C"]);
  });
  it("drops Ultimate-Guitar metadata so the tuning line isn't parsed as chords", () => {
    const ug = `Tuning: E A D G B E
Key: C
Capo: No capo
1 of 27
[Verse 1]
Fmaj7
Sweet song is a long con
  C               G                Fmaj7
I drove ya to the airport`;
    const { progression } = parseSheet(ug);
    const raws = progression.map((c) => c.raw);
    // the E A D G B E tuning + "Key: C" must NOT appear as leading chords
    expect(raws).toEqual(["Fmaj7", "C", "G", "Fmaj7"]);
  });
  it("detects C major (not E minor) once the tuning line is stripped", () => {
    const ug = `Tuning: E A D G B E
Key: C
Fmaj7 C G Fmaj7
Dm G Fmaj7 C`;
    const k = detectKey(parseSheet(ug).progression);
    expect(k.tonic).toBe(0);
    expect(k.mode).toBe("major");
  });
});

describe("harmonicFunction", () => {
  it("labels I, IV, V in C major", () => {
    expect(harmonicFunction(parseChord("C"), 0, "major")).toBe("T");
    expect(harmonicFunction(parseChord("F"), 0, "major")).toBe("S");
    expect(harmonicFunction(parseChord("G"), 0, "major")).toBe("D");
  });
  it("labels vi and ii in C major", () => {
    expect(harmonicFunction(parseChord("Am"), 0, "major")).toBe("T");
    expect(harmonicFunction(parseChord("Dm"), 0, "major")).toBe("S");
  });
  it("labels i, iv, V in A minor", () => {
    expect(harmonicFunction(parseChord("Am"), 9, "minor")).toBe("T");
    expect(harmonicFunction(parseChord("Dm"), 9, "minor")).toBe("S");
    expect(harmonicFunction(parseChord("E"), 9, "minor")).toBe("D");
  });
  it("marks a chromatic chord as unknown", () => {
    expect(harmonicFunction(parseChord("Db"), 0, "major")).toBe("?");
  });
});

describe("spellScale", () => {
  it("spells C major with no accidentals and the major step pattern", () => {
    const s = spellScale(0, "major");
    expect(s).toHaveLength(7);
    expect(s.map((d) => d.name)).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(s.map((d) => d.degree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.map((d) => d.semitone)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(s.map((d) => d.stepType)).toEqual(["W", "W", "H", "W", "W", "W", "H"]);
  });

  it("spells G major with exactly one sharp (F#)", () => {
    const s = spellScale(7, "major");
    const names = s.map((d) => d.name);
    expect(names).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    expect(names.filter((n) => n.includes("#"))).toEqual(["F#"]);
    expect(names.some((n) => n.includes("b"))).toBe(false);
  });

  it("spells F major with a flat (Bb), not A#", () => {
    const s = spellScale(5, "major");
    const names = s.map((d) => d.name);
    expect(names).toContain("Bb");
    expect(names).not.toContain("A#");
    expect(names).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
  });

  it("uses the natural-minor step pattern for A minor", () => {
    const s = spellScale(9, "minor");
    expect(s.map((d) => d.stepType)).toEqual(["W", "H", "W", "W", "H", "W", "W"]);
    expect(s.map((d) => d.name)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(s.map((d) => d.semitone)).toEqual([9, 11, 0, 2, 4, 5, 7]);
  });

  it("defaults to major mode", () => {
    expect(spellScale(0).map((d) => d.stepType))
      .toEqual(["W", "W", "H", "W", "W", "W", "H"]);
  });
});

describe("degreeOf", () => {
  it("returns the 4th of G major as C", () => {
    expect(degreeOf(7, 4, "major")).toBe("C");
  });
  it("returns the 6th of E major as C# (sharp key)", () => {
    expect(degreeOf(4, 6, "major")).toBe("C#");
  });
  it("returns the 6th of D major as B", () => {
    expect(degreeOf(2, 6, "major")).toBe("B");
  });
  it("spells the 7th of Db major with flats (C)", () => {
    expect(degreeOf(1, 7, "major")).toBe("C");
  });
  it("returns null for an out-of-range degree", () => {
    expect(degreeOf(0, 0)).toBeNull();
    expect(degreeOf(0, 8)).toBeNull();
    expect(degreeOf(0, -1)).toBeNull();
  });
  it("defaults to major mode", () => {
    expect(degreeOf(0, 1)).toBe("C");
  });
});

describe("spellScale — diatonic letter integrity", () => {
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

  it("spells Gb major's 4th as Cb (not B)", () => {
    const names = spellScale(6, "major").map((d) => d.name);
    expect(names).toEqual(["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"]);
    expect(degreeOf(6, 4, "major")).toBe("Cb");
  });

  it("spells Eb minor's 6th as Cb (not B)", () => {
    const names = spellScale(3, "minor").map((d) => d.name);
    expect(names).toEqual(["Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db"]);
    expect(degreeOf(3, 6, "minor")).toBe("Cb");
  });

  it("uses each letter A–G exactly once for every major key", () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const letters = spellScale(tonic, "major").map((d) => d.name[0]);
      expect(new Set(letters).size).toBe(7);
    }
  });

  it("uses each letter A–G exactly once for every minor key", () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const letters = spellScale(tonic, "minor").map((d) => d.name[0]);
      expect(new Set(letters).size).toBe(7);
    }
  });

  it("keeps the pitch classes correct while fixing the letters", () => {
    // Gb major pitch classes are unchanged by the spelling fix.
    expect(spellScale(6, "major").map((d) => d.semitone)).toEqual([6, 8, 10, 11, 1, 3, 5]);
  });

  it("still spells the common keys conventionally", () => {
    expect(spellScale(0, "major").map((d) => d.name)).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(spellScale(7, "major").map((d) => d.name)).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    expect(spellScale(5, "major").map((d) => d.name)).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
    expect(spellScale(11, "major").map((d) => d.name)).toEqual(["B", "C#", "D#", "E", "F#", "G#", "A#"]);
  });
});

describe("pedalRelation", () => {
  it("calls a tonic pedal consonant under the I chord", () => {
    expect(pedalRelation(0, parseChord("C"))).toBe("consonant"); // C under C major
  });
  it("calls a chord tone consonant (the 5th)", () => {
    expect(pedalRelation(7, parseChord("C"))).toBe("consonant"); // G is the 5th of C
  });
  it("calls a non-chord-tone pedal dissonant", () => {
    expect(pedalRelation(0, parseChord("D"))).toBe("dissonant"); // C against D major (D F# A)
  });
  it("counts the slash bass as a chord tone", () => {
    expect(pedalRelation(2, parseChord("C/D"))).toBe("consonant"); // D is the bass
  });
  it("normalizes the pedal pitch class mod 12", () => {
    expect(pedalRelation(12, parseChord("C"))).toBe("consonant"); // 12 -> C
  });
});

describe("CIRCLE_OF_FIFTHS", () => {
  it("starts at C and steps by perfect fifths", () => {
    expect(CIRCLE_OF_FIFTHS[0]).toBe(0);
    expect(CIRCLE_OF_FIFTHS[1]).toBe(7);
    expect(CIRCLE_OF_FIFTHS).toHaveLength(12);
    expect(new Set(CIRCLE_OF_FIFTHS).size).toBe(12);
  });
});

describe("shapeForCapo", () => {
  it("capo 3 on a sounding F is a D shape (F down 3 semitones)", () => {
    expect(shapeForCapo(parseChord("F"), 3).rootName).toBe("D");
  });
  it("capo 0 leaves the chord unchanged", () => {
    expect(chordSymbol(shapeForCapo(parseChord("G#m7"), 0))).toBe("G#m7");
  });
});

describe("shapeEase", () => {
  it("open major shapes are easy, barre shapes are hard", () => {
    expect(shapeEase(parseChord("C"))).toBeLessThan(shapeEase(parseChord("F")));
    expect(shapeEase(parseChord("Em"))).toBeLessThanOrEqual(1);
    expect(shapeEase(parseChord("D"))).toBeLessThanOrEqual(1);
  });
  it("treats m7♭5 / dim / aug as exotic (no easy open form)", () => {
    expect(shapeEase(parseChord("Bm7b5"))).toBeGreaterThanOrEqual(4.5);
    expect(shapeEase(parseChord("Bdim7"))).toBeGreaterThanOrEqual(4.5);
    expect(shapeEase(parseChord("Caug"))).toBeGreaterThanOrEqual(4.5);
  });
  it("scores common open dominant 7ths (E7 A7 D7 B7) as easy", () => {
    expect(shapeEase(parseChord("E7"))).toBeLessThanOrEqual(1.5);
    expect(shapeEase(parseChord("B7"))).toBeLessThanOrEqual(1.5);
  });
});

describe("suggestCapo", () => {
  it("recommends capo 1 to turn Eb/Ab/Bb into open D/G/A shapes", () => {
    const { progression } = parseSheet("[X]\nEb Ab Bb");
    const ranked = suggestCapo(progression);
    expect(ranked[0].fret).toBe(1);
    const shapes = ranked[0].shapes.map((s) => s.shape.rootName).sort();
    expect(shapes).toEqual(["A", "D", "G"]);
  });
  it("leaves an already-easy progression at capo 0", () => {
    const { progression } = parseSheet("[X]\nG C D Em");
    const ranked = suggestCapo(progression);
    expect(ranked[0].fret).toBe(0);
  });
  it("recommends the standard capo 3 (G shapes) for Bb major", () => {
    const { progression } = parseSheet("[X]\nBb Eb F Gm Cm");
    const ranked = suggestCapo(progression);
    expect(ranked[0].fret).toBe(3);
  });
  it("weights difficulty by how often a chord is played", () => {
    // A repeated barre chord (F, non-consecutive so it isn't collapsed) should make
    // capo-0 score harder than when it appears once.
    const onceF = suggestCapo(parseSheet("[X]\nC F G").progression).find((r) => r.fret === 0).totalEase;
    const manyF = suggestCapo(parseSheet("[X]\nF C F G F").progression).find((r) => r.fret === 0).totalEase;
    expect(manyF).toBeGreaterThan(onceF);
  });
  it("prefers a lower capo when two positions are otherwise comparable", () => {
    const { progression } = parseSheet("[X]\nEb Ab Bb");
    const ranked = suggestCapo(progression);
    const capo1 = ranked.find((r) => r.fret === 1);
    const capo6 = ranked.find((r) => r.fret === 6);
    expect(capo1.totalEase).toBeLessThan(capo6.totalEase); // high-fret penalty
  });
  it("returns one entry per fret up to maxFret", () => {
    const { progression } = parseSheet("[X]\nC G Am F");
    expect(suggestCapo(progression, { maxFret: 5 })).toHaveLength(6);
  });
});

describe("parseChord — 6/9, parenthesized alterations, extra qualities", () => {
  it("parses C6/9 (the slash is part of the quality, not a bass)", () => {
    const c = parseChord("C6/9");
    expect(c).not.toBeNull();
    expect(c.quality).toBe("6/9");
    expect(c.bassSemitone).toBeNull();
    expect(c.intervals).toEqual([0, 4, 7, 9, 14]);
  });

  it("still parses real slash chords", () => {
    expect(parseChord("C/E").bassName).toBe("E");
    expect(parseChord("Cm7/Bb").quality).toBe("m7");
    expect(parseChord("Cm7/Bb").bassName).toBe("A#"); // Bb spelled sharp in the raw parse
  });

  it("parses parenthesized alterations the same as the bare form", () => {
    expect(parseChord("C7(b9)").quality).toBe(parseChord("C7b9").quality);
    expect(parseChord("C(add9)").quality).toBe("add9");
    expect(parseChord("Cm7(b5)").quality).toBe("m7♭5");
    expect(parseChord("C7(#9)").quality).toBe("7♯9");
  });

  it("parses maj7#11 (the lydian chord)", () => {
    const c = parseChord("Cmaj7#11");
    expect(c).not.toBeNull();
    expect(c.quality).toBe("maj7♯11");
    expect(c.intervals).toEqual([0, 4, 7, 11, 18]);
  });

  it("still rejects lyric words", () => {
    expect(parseChord("And")).toBeNull();
    expect(parseChord("Be")).toBeNull();
  });
});

describe("normalizeChart — lone ChordPro chord vs section header", () => {
  it("treats a lone [C] line as a chord, not a section", () => {
    const { progression } = parseSheet("[C]\n[G]\n[Am]");
    expect(progression.map((c) => c.raw)).toEqual(["C", "G", "Am"]);
  });
  it("still treats [Verse] / [Bridge] as section headers", () => {
    const { progression } = parseSheet("[Verse]\nC G\n[Bridge]\nF G");
    expect(progression[0].section).toBe("Verse");
    expect(progression.map((c) => c.raw)).toEqual(["C", "G", "F", "G"]);
  });
});

describe("qualClass", () => {
  it("classes m7♭5 as the diminished (half-diminished) family", () => {
    expect(qualClass("m7♭5")).toBe("dim");
    expect(qualClass(parseChord("Bm7b5").quality)).toBe("dim");
  });
  it("keeps dominant 7♭5 in the major/dominant family", () => {
    expect(qualClass("7♭5")).toBe("maj");
  });
  it("classes plain minor and major correctly", () => {
    expect(qualClass("m7")).toBe("min");
    expect(qualClass("maj7")).toBe("maj");
    expect(qualClass("dim7")).toBe("dim");
    expect(qualClass("aug")).toBe("aug");
  });
});

describe("romanNumeral", () => {
  it("numbers a diatonic major progression in C", () => {
    expect(romanNumeral(parseChord("C"), 0)).toBe("I");
    expect(romanNumeral(parseChord("Dm"), 0)).toBe("ii");
    expect(romanNumeral(parseChord("G7"), 0)).toBe("V7");
    expect(romanNumeral(parseChord("Am"), 0)).toBe("vi");
  });
  it("renders a half-diminished as viiø7 (not vii7♭5)", () => {
    expect(romanNumeral(parseChord("Bm7b5"), 0)).toBe("viiø7");
  });
  it("renders fully-diminished with °", () => {
    expect(romanNumeral(parseChord("Bdim"), 0)).toBe("vii°");
    expect(romanNumeral(parseChord("Bdim7"), 0)).toBe("vii°7");
  });
  it("renders augmented with +", () => {
    expect(romanNumeral(parseChord("Caug"), 0)).toBe("I+");
  });
});

describe("harmonicFunction — secondary dominants & minor ♭VII", () => {
  it("labels secondary/applied dominants as D in major", () => {
    expect(harmonicFunction(parseChord("A7"), 0, "major")).toBe("D"); // V7/ii
    expect(harmonicFunction(parseChord("D7"), 0, "major")).toBe("D"); // V7/V
    expect(harmonicFunction(parseChord("E7"), 0, "major")).toBe("D"); // V7/vi
    expect(harmonicFunction(parseChord("Eb7"), 0, "major")).toBe("D"); // chromatic dom
  });
  it("still labels the plain diatonic triads", () => {
    expect(harmonicFunction(parseChord("C"), 0, "major")).toBe("T");
    expect(harmonicFunction(parseChord("F"), 0, "major")).toBe("S");
    expect(harmonicFunction(parseChord("G"), 0, "major")).toBe("D");
    expect(harmonicFunction(parseChord("Am"), 0, "major")).toBe("T");
  });
  it("gives diatonic ♭VII in minor a function instead of '?'", () => {
    expect(harmonicFunction(parseChord("G"), 9, "minor")).toBe("S"); // ♭VII in A minor
    expect(harmonicFunction(parseChord("G7"), 9, "minor")).toBe("D"); // backdoor ♭VII7
  });
  it("isDominantQuality recognizes the dom7 family only", () => {
    expect(isDominantQuality("7")).toBe(true);
    expect(isDominantQuality("9")).toBe(true);
    expect(isDominantQuality("13")).toBe(true);
    expect(isDominantQuality("maj7")).toBe(false);
    expect(isDominantQuality("m7")).toBe(false);
    expect(isDominantQuality("m7♭5")).toBe(false);
  });
});

describe("sameChordSound — spelling-proof chord identity", () => {
  it("treats enharmonic spellings as the same chord", () => {
    expect(sameChordSound(parseChord("A#m7"), parseChord("Bbm7"))).toBe(true);
    expect(sameChordSound(parseChord("C#"), parseChord("Db"))).toBe(true);
  });
  it("distinguishes quality and bass", () => {
    expect(sameChordSound(parseChord("C"), parseChord("Cm"))).toBe(false);
    expect(sameChordSound(parseChord("C/E"), parseChord("C"))).toBe(false);
    expect(sameChordSound(parseChord("C/E"), parseChord("C/Fb"))).toBe(true);
  });
  it("survives transposition round trips", () => {
    const a = transposeChord(parseChord("Gm"), 3);
    expect(sameChordSound(a, parseChord("Bbm"))).toBe(true);
  });
  it("is falsy on missing input", () => {
    expect(sameChordSound(null, parseChord("C"))).toBe(false);
  });
});
