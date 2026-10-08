import { describe, it, expect } from "vitest";
import { parseChord, QUALITIES } from "./theory.js";
import {
  LOW_MIDI, HIGH_MIDI, clampVoicing, reduceVoicing, addBass,
  rootPositionUpper, rootPositionFull, smoothUpper, KEYS, midiName, midiOctave,
} from "./voicing.js";

const pc = (m) => ((m % 12) + 12) % 12;

// The set of pitch classes that are legitimate chord tones (intervals over the
// root, plus the slash bass when present).
function chordTones(chord) {
  const s = new Set(chord.intervals.map((iv) => (chord.rootSemitone + iv) % 12));
  if (chord.bassSemitone !== null && chord.bassSemitone !== undefined) {
    s.add(((chord.bassSemitone % 12) + 12) % 12);
  }
  return s;
}

// A spread of chords that exercises triads, 7ths, extensions, slash, dim/aug.
const CHORDS = [
  "C", "Am", "F", "G", "Em7", "Dm7", "G7", "Cmaj7", "Bdim7", "Caug",
  "F#m7b5", "Bb13", "Eb9", "Dsus4", "Aadd9", "C/E", "G/B", "Fmaj7/A", "Eb6",
].map(parseChord);

it("(sanity) all test chords parse", () => {
  for (const c of CHORDS) expect(c).not.toBeNull();
});

describe("voicing — chord-tone integrity", () => {
  it("every note of rootPositionUpper is a chord tone", () => {
    for (const ch of CHORDS) {
      const tones = chordTones(ch);
      for (const m of rootPositionUpper(ch)) expect(tones.has(pc(m))).toBe(true);
    }
  });

  it("every note of rootPositionFull is a chord tone", () => {
    for (const ch of CHORDS) {
      const tones = chordTones(ch);
      for (const m of rootPositionFull(ch)) expect(tones.has(pc(m))).toBe(true);
    }
  });

  it("every note of a smooth voicing is a chord tone", () => {
    let prev = null;
    for (const ch of CHORDS) {
      const v = smoothUpper(ch, prev);
      const tones = chordTones(ch);
      for (const m of v) expect(tones.has(pc(m))).toBe(true);
      prev = v;
    }
  });
});

describe("voicing — keyboard range (MIDI 36–72)", () => {
  it("rootPositionFull never leaves the range", () => {
    for (const ch of CHORDS) {
      for (const m of rootPositionFull(ch)) {
        expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
        expect(m).toBeLessThanOrEqual(HIGH_MIDI);
      }
    }
  });

  it("smooth voicings never leave the range", () => {
    let prev = null;
    for (const ch of CHORDS) {
      const v = smoothUpper(ch, prev);
      for (const m of v) {
        expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
        expect(m).toBeLessThanOrEqual(HIGH_MIDI);
      }
      prev = v;
    }
  });

  it("clampVoicing folds out-of-range notes back in and de-dupes", () => {
    const v = clampVoicing([12, 24, 36, 60, 84, 96]);
    for (const m of v) {
      expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
      expect(m).toBeLessThanOrEqual(HIGH_MIDI);
    }
    expect(new Set(v).size).toBe(v.length); // no duplicates
    expect([...v]).toEqual([...v].sort((a, b) => a - b)); // sorted
  });
});

describe("voicing — slash bass", () => {
  it("places the slash bass as the lowest note, at the bass pitch class", () => {
    const ch = parseChord("C/E");
    const v = rootPositionFull(ch);
    expect(pc(Math.min(...v))).toBe(ch.bassSemitone); // E in the bass
    expect(Math.min(...v)).toBeLessThan(Math.min(...rootPositionUpper(ch)));
  });

  it("does not add a separate bass when the slash bass equals the root", () => {
    const plain = rootPositionUpper(parseChord("C"));
    const sameBass = addBass(plain, parseChord("C")); // no bassSemitone -> unchanged
    expect(sameBass).toEqual(plain);
  });

  it("keeps the slash bass lowest even when the upper voicing sits near the bottom", () => {
    const v = addBass([36, 40, 43], parseChord("C/E")); // E must end up in the bass
    const lo = Math.min(...v);
    expect(pc(lo)).toBe(4); // E
    expect(v.filter((m) => m === lo).length).toBe(1); // unique — not deduped away
    for (const m of v) expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
  });

  it("places G/B's B in the bass from a low voicing", () => {
    const v = addBass([36, 43, 47], parseChord("G/B"));
    expect(pc(Math.min(...v))).toBe(11); // B
  });
});

describe("voicing — reduceVoicing", () => {
  it("keeps small chords intact", () => {
    expect(reduceVoicing([0, 4, 7])).toEqual([0, 4, 7]);
    expect(reduceVoicing([0, 3, 7, 10])).toEqual([0, 3, 7, 10]);
  });

  it("trims big chords to at most 4 notes including the root and a 3rd/7th", () => {
    const r = reduceVoicing([0, 4, 7, 10, 14, 21]); // a 13 chord
    expect(r.length).toBeLessThanOrEqual(4);
    expect(r).toContain(0);                       // root kept
    expect(r.some((i) => i === 3 || i === 4)).toBe(true); // a third kept
  });

  it("drops the major 3rd against an 11th (dominant 11), keeps a minor 3rd", () => {
    const c11 = reduceVoicing([0, 4, 7, 10, 14, 17]); // C11
    expect(c11).not.toContain(4); // major 3rd dropped (avoids the ♭9 clash with the 11)
    expect(c11).toContain(17);    // the 11th survives
    const m11 = reduceVoicing([0, 3, 7, 10, 14, 17]); // Cm11
    expect(m11).toContain(3);     // minor 3rd doesn't clash, kept
  });
});

describe("voicing — voice leading reduces movement", () => {
  // nearest-note movement of voicing `b` relative to `a`
  const movement = (a, b) =>
    b.reduce((sum, n) => sum + Math.min(...a.map((p) => Math.abs(n - p))), 0);

  it("smooth chain moves no more than the root-position chain", () => {
    const prog = ["C", "Am", "Dm7", "G7", "Cmaj7", "F", "G", "C"].map(parseChord);

    let smoothTotal = 0, prevSmooth = null;
    for (const ch of prog) {
      const v = smoothUpper(ch, prevSmooth);
      if (prevSmooth) smoothTotal += movement(prevSmooth, v);
      prevSmooth = v;
    }

    let rootTotal = 0, prevRoot = null;
    for (const ch of prog) {
      const v = rootPositionUpper(ch);
      if (prevRoot) rootTotal += movement(prevRoot, v);
      prevRoot = v;
    }

    expect(smoothTotal).toBeLessThanOrEqual(rootTotal);
  });
});

describe("voicing — parallel fifths/octaves", () => {
  // index-aligned movement over the shared prefix (voice i = index i, low→high)
  const alignedMotion = (a, b) => {
    const n = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++) d += Math.abs(b[i] - a[i]);
    return d;
  };

  // pairs of voices that sat on a perfect 5th/octave in `prev` and move by the
  // same non-zero signed interval into `cand` — i.e. parallel perfect motion
  const parallelPerfects = (prev, cand) => {
    const n = Math.min(prev.length, cand.length);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const iv = prev[j] - prev[i];
        if (iv !== 7 && iv !== 12) continue;
        const mi = cand[i] - prev[i];
        if (mi !== 0 && mi === cand[j] - prev[j]) hits++;
      }
    }
    return hits;
  };

  it.each([
    ["C", "D"],
    ["F", "G"],
    ["G", "A"],
  ])("%s → %s: no parallel slide when a near alternative exists", (from, to) => {
    const prev = rootPositionUpper(parseChord(from));
    const v = smoothUpper(parseChord(to), prev);
    expect(parallelPerfects(prev, v)).toBe(0);
    // the naive whole-step slide is exactly what we must NOT pick
    expect(v).not.toEqual(prev.map((m) => m + 2));
  });

  it.each([
    ["C", "D"],
    ["F", "G"],
    ["G", "A"],
  ])("%s → %s: avoiding parallels doesn't leap wildly", (from, to) => {
    const prev = rootPositionUpper(parseChord(from));
    const slide = prev.map((m) => m + 2);
    const v = smoothUpper(parseChord(to), prev);
    expect(alignedMotion(prev, v)).toBeLessThanOrEqual(alignedMotion(prev, slide) + 2);
  });

  it("guards index pairing when prev and candidate differ in size", () => {
    const prev4 = rootPositionUpper(parseChord("Cmaj7")); // 4 voices
    const tri = smoothUpper(parseChord("D"), prev4); // 3 voices — must not crash
    expect(tri).toHaveLength(3);
    for (const m of tri) expect([2, 6, 9]).toContain(pc(m)); // D major tones only
    const back4 = smoothUpper(parseChord("G7"), tri); // back to 4 voices
    expect(back4).toHaveLength(4);
    for (const m of back4) expect([7, 11, 2, 5]).toContain(pc(m)); // G7 tones only
    // the penalty only pairs voices over the shared prefix, and still applies there
    expect(parallelPerfects(prev4, tri)).toBe(0);
    expect(parallelPerfects(tri, back4)).toBe(0);
  });
});

describe("voicing — keyboard geometry", () => {
  it("spans C2–C5 with the right number of white keys", () => {
    // 36..72 inclusive = 3 octaves + 1; white keys per octave = 7, plus the top C
    expect(KEYS.whiteKeys[0].midi).toBe(LOW_MIDI);
    expect(KEYS.whiteKeys[KEYS.whiteKeys.length - 1].midi).toBe(HIGH_MIDI);
    expect(KEYS.whiteKeys.length).toBe(22); // C2..C5 inclusive
  });

  it("black keys land only on the five black pitch classes", () => {
    const black = new Set([1, 3, 6, 8, 10]);
    for (const bk of KEYS.blackKeys) expect(black.has(bk.midi % 12)).toBe(true);
  });

  it("white keys are evenly spaced and black keys sit between them", () => {
    for (let i = 1; i < KEYS.whiteKeys.length; i++) {
      expect(KEYS.whiteKeys[i].x).toBeGreaterThan(KEYS.whiteKeys[i - 1].x);
    }
    expect(midiName(60)).toBe("C");
    expect(midiOctave(60)).toBe(4); // MIDI 60 = C4
  });
});

describe("voicing — the keyboard is a hard boundary", () => {
  // rootPositionUpper feeds the voice-leading chain as `prev`. Callers clamp
  // what they DISPLAY but keep the raw array as the reference for the next
  // chord, so a note above C5 here is measured against for the rest of the
  // song rather than drawn wrong once. Tall extensions are where it happens:
  // a 13th reaches 21 semitones above its root.
  const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  it("rootPositionUpper stays inside C2-C5 for every root and quality", () => {
    const escaped = [];
    for (const root of ROOTS) {
      for (const q of Object.keys(QUALITIES)) {
        const ch = parseChord(root + q);
        if (!ch) continue;
        const v = rootPositionUpper(ch);
        if (Math.min(...v) < LOW_MIDI || Math.max(...v) > HIGH_MIDI) {
          escaped.push(`${root}${q} -> ${v.join(",")}`);
        }
      }
    }
    expect(escaped).toEqual([]);
  });

  it("the voice-leading chain never carries an out-of-range reference", () => {
    const prog = ["E13", "Am9", "Dm11", "G13", "Cmaj9", "B13", "F#13"];
    let prev = null;
    for (const sym of prog) {
      const up = smoothUpper(parseChord(sym), prev);
      expect(Math.max(...up), sym).toBeLessThanOrEqual(HIGH_MIDI);
      expect(Math.min(...up), sym).toBeGreaterThanOrEqual(LOW_MIDI);
      prev = up;
    }
  });

  it("an out-of-range chord still voices only its own tones", () => {
    const ch = parseChord("E13");
    const v = rootPositionUpper(ch);
    const tones = chordTones(ch);
    for (const m of v) expect(tones.has(pc(m)), `${m}`).toBe(true);
  });
});
