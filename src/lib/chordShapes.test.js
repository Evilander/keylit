// chordShapes.test.js — the generator must REDISCOVER the textbook shapes.
// No lookup table hides behind this: every x32010 below is found by search,
// so the corpus pins both correctness (right notes) and taste (right shape).
import { describe, it, expect } from "vitest";
import { parseChord } from "./theory.js";
import { chordShapes, shapeFingerString, shapeMidi } from "./chordShapes.js";
import { STANDARD_TUNING, TUNINGS } from "./tuning.js";

const shapes = (sym, opts) => chordShapes(parseChord(sym), opts);
const names = (sym, n = 3, opts) => shapes(sym, opts).slice(0, n).map(shapeFingerString);
const top = (sym, opts) => names(sym, 1, opts)[0];

const pcOf = (m) => ((m % 12) + 12) % 12;
const soundingPcs = (shape, tuning = STANDARD_TUNING) =>
  shape.frets.map((f, s) => (f == null ? null : pcOf(tuning[s] + f))).filter((p) => p != null);

describe("open-position majors and minors (the first-week chords)", () => {
  it("C major is x32010", () => expect(top("C")).toBe("x32010"));
  it("A major is x02220", () => expect(top("A")).toBe("x02220"));
  it("G major is 320003 — the full six-string cowboy chord ranks first", () =>
    expect(top("G")).toBe("320003"));
  it("E major is 022100", () => expect(top("E")).toBe("022100"));
  it("D major is xx0232", () => expect(top("D")).toBe("xx0232"));
  it("A minor is x02210", () => expect(top("Am")).toBe("x02210"));
  it("E minor is 022000", () => expect(top("Em")).toBe("022000"));
  it("D minor is xx0231", () => expect(top("Dm")).toBe("xx0231"));
});

describe("barre chords (the shapes that move)", () => {
  it("F major finds the full barre 133211", () => expect(names("F")).toContain("133211"));
  it("B major finds the A-shape barre x24442", () => expect(names("B")).toContain("x24442"));
  it("B minor finds x24432", () => expect(names("Bm")).toContain("x24432"));
  it("F# minor finds 244222", () => expect(names("F#m")).toContain("244222"));
  it("Bb major finds x13331", () => expect(names("Bb")).toContain("x13331"));
  it("marks the F barre as a barre at fret 1 across all six", () => {
    const f = shapes("F").find((s) => shapeFingerString(s) === "133211");
    expect(f.barre).toBeTruthy();
    expect(f.barre.fret).toBe(1);
    expect(f.barre.from).toBe(0);
    expect(f.barre.to).toBe(5);
  });
  it("open shapes carry no barre", () => {
    const c = shapes("C").find((s) => shapeFingerString(s) === "x32010");
    expect(c.barre).toBeNull();
  });
});

describe("sevenths", () => {
  it("C7 finds x32310", () => expect(names("C7")).toContain("x32310"));
  it("G7 finds 320001", () => expect(names("G7")).toContain("320001"));
  it("A7 finds x02020", () => expect(names("A7")).toContain("x02020"));
  it("E7 finds 020100", () => expect(names("E7")).toContain("020100"));
  it("D7 finds xx0212", () => expect(names("D7")).toContain("xx0212"));
  it("B7 finds x21202", () => expect(names("B7")).toContain("x21202"));
  it("Am7 finds x02010", () => expect(names("Am7")).toContain("x02010"));
  it("Dm7 finds xx0211", () => expect(names("Dm7")).toContain("xx0211"));
  it("Em7 finds a household shape", () => {
    const got = names("Em7");
    expect(["020000", "022030", "022033"].some((s) => got.includes(s))).toBe(true);
  });
  it("Cmaj7 finds x32000", () => expect(names("Cmaj7")).toContain("x32000"));
  // The search ranks the six-string 102210 (F A E A C E) first — correct,
  // playable, and richer than the beginner box, which still makes the list.
  it("Fmaj7 finds xx3210", () => expect(names("Fmaj7", 5)).toContain("xx3210"));
  it("Amaj7 finds x02120", () => expect(names("Amaj7")).toContain("x02120"));
  it("Gmaj7 finds 320002", () => expect(names("Gmaj7")).toContain("320002"));
});

describe("sus, add and power", () => {
  it("Asus2 finds x02200", () => expect(names("Asus2")).toContain("x02200"));
  it("Asus4 finds x02230", () => expect(names("Asus4")).toContain("x02230"));
  it("Dsus2 finds xx0230", () => expect(names("Dsus2")).toContain("xx0230"));
  it("Dsus4 finds xx0233", () => expect(names("Dsus4")).toContain("xx0233"));
  it("Esus4 finds 022200", () => expect(names("Esus4")).toContain("022200"));
  it("Cadd9 finds x32030", () => expect(names("Cadd9")).toContain("x32030"));
  it("E5 finds the power chord 022xxx", () => expect(names("E5")).toContain("022xxx"));
  it("A5 finds x022xx", () => expect(names("A5")).toContain("x022xx"));
  it("C5 can be the bare two-note growl x35xxx", () =>
    expect(names("C5", 6)).toContain("x35xxx"));
});

describe("audit regressions (found by the shape-audit workflow)", () => {
  it("Bb7 leads with the A7-shape barre, not a crossed-finger zigzag", () => {
    expect(top("Bb7")).toBe("x13131");
  });
  it("in Open G, the G chord is the tuning itself — all six strings open", () => {
    expect(top("G", { tuning: TUNINGS.openG.notes })).toBe("000000");
  });
  it("a fifth may only sit in the bass when the shape is (nearly) the open tuning", () => {
    // Am in standard tuning must NOT become Am/E (002210) — x02210 stays.
    expect(top("Am")).toBe("x02210");
    for (const s of shapes("Am")) expect(pcOf(s.midi[0])).toBe(9);
  });
});

describe("slash chords put the named bass on the bottom", () => {
  it("D/F# fingers the low F#", () => {
    const got = names("D/F#");
    expect(got.some((s) => s === "2x0232" || s === "200232")).toBe(true);
  });
  it("C/G finds 332010", () => expect(names("C/G")).toContain("332010"));
  it("G/B finds an open shape with B in the bass", () => {
    const got = names("G/B");
    expect(got.some((s) => s === "x20033" || s === "x20003")).toBe(true);
  });
  it("every D/F# shape actually bottoms out on F#", () => {
    for (const s of shapes("D/F#")) {
      const lowest = s.midi[0];
      expect(pcOf(lowest)).toBe(6);
    }
  });
});

describe("invariants across the whole chord vocabulary", () => {
  const QUALS = ["", "m", "7", "maj7", "m7", "dim", "aug", "sus4", "sus2", "m7b5", "6", "add9", "9", "dim7"];
  const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  it("shapes only sound chord tones, keep the root, and stay playable", () => {
    for (const r of ROOTS) {
      for (const q of QUALS) {
        const ch = parseChord(r + q);
        const chordPcs = new Set(ch.intervals.map((i) => pcOf(ch.rootSemitone + i)));
        const list = shapes(r + q);
        expect(list.length, `${r}${q} found no shapes`).toBeGreaterThan(0);
        for (const s of list) {
          const pcs = soundingPcs(s);
          // every sounded note belongs to the chord
          for (const p of pcs) expect(chordPcs.has(p), `${r}${q} ${shapeFingerString(s)} sounds pc ${p}`).toBe(true);
          // the root is in there and on the bottom
          expect(pcs).toContain(pcOf(ch.rootSemitone));
          expect(pcOf(s.midi[0])).toBe(pcOf(ch.rootSemitone));
          // at least a triad's worth of strings ring
          expect(pcs.length).toBeGreaterThanOrEqual(3);
          // fretting-hand reality: span ≤ 4 frets, ≤ 4 distinct fingers
          const fretted = s.frets.filter((f) => f != null && f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
          expect(new Set(s.fingers.filter((f) => f != null)).size).toBeLessThanOrEqual(4);
          // midi is sorted low→high and matches the frets
          expect([...s.midi].sort((a, b) => a - b)).toEqual(s.midi);
        }
      }
    }
  });

  it("seventh chords always voice the seventh; ninths voice the ninth", () => {
    for (const sym of ["C7", "Fmaj7", "Bm7", "Eb7", "G#m7"]) {
      const ch = parseChord(sym);
      const seventh = pcOf(ch.rootSemitone + (ch.intervals.includes(11) ? 11 : 10));
      for (const s of shapes(sym)) expect(soundingPcs(s)).toContain(seventh);
    }
    for (const sym of ["C9", "G9"]) {
      const ch = parseChord(sym);
      const ninth = pcOf(ch.rootSemitone + 2);
      const seventh = pcOf(ch.rootSemitone + 10);
      for (const s of shapes(sym)) {
        expect(soundingPcs(s)).toContain(ninth);
        expect(soundingPcs(s)).toContain(seventh);
      }
    }
  });

  it("triads sound all three tones in every shape", () => {
    for (const sym of ["C", "Fm", "Bdim", "Eaug"]) {
      const ch = parseChord(sym);
      const want = ch.intervals.map((i) => pcOf(ch.rootSemitone + i));
      for (const s of shapes(sym)) {
        const pcs = new Set(soundingPcs(s));
        for (const w of want) expect(pcs.has(w), `${sym} ${shapeFingerString(s)} missing pc ${w}`).toBe(true);
      }
    }
  });

  it("is deterministic", () => {
    expect(names("F#m7", 5)).toEqual(names("F#m7", 5));
  });
});

describe("other tunings", () => {
  it("in Eb standard, sounding an E takes the F-barre pattern", () => {
    expect(names("E", 3, { tuning: TUNINGS.ebStandard.notes })).toContain("133211");
  });
  it("in drop D, D major rings the famous 000232", () => {
    expect(names("D", 3, { tuning: TUNINGS.dropD.notes })).toContain("000232");
  });
  it("in DADGAD, D needs no fingers at all", () => {
    const got = shapes("Dsus4", { tuning: TUNINGS.DADGAD.notes });
    expect(got.some((s) => s.frets.every((f) => f === 0))).toBe(true);
  });
});

describe("shapeMidi (the strum, at concert pitch)", () => {
  it("an open C shape sounds C E G", () => {
    const c = shapes("C").find((s) => shapeFingerString(s) === "x32010");
    const pcs = new Set(shapeMidi(c, STANDARD_TUNING, 0).map(pcOf));
    expect(pcs).toEqual(new Set([0, 4, 7]));
  });
  it("the same shape behind capo 2 sounds D", () => {
    const c = shapes("C").find((s) => shapeFingerString(s) === "x32010");
    const pcs = new Set(shapeMidi(c, STANDARD_TUNING, 2).map(pcOf));
    expect(pcs).toEqual(new Set([2, 6, 9]));
  });
  it("on an Eb-standard guitar the C shape sounds B", () => {
    const c = shapes("C").find((s) => shapeFingerString(s) === "x32010");
    const pcs = new Set(shapeMidi(c, TUNINGS.ebStandard.notes, 0).map(pcOf));
    expect(pcs).toEqual(new Set([11, 3, 6]));
  });
});

describe("shapeFingerString", () => {
  it("renders mutes as x and 10+ in parens", () => {
    expect(shapeFingerString({ frets: [null, null, 0, 2, 3, 2] })).toBe("xx0232");
    expect(shapeFingerString({ frets: [10, 12, 12, 11, 10, 10] })).toBe("(10)(12)(12)(11)(10)(10)");
  });
});
