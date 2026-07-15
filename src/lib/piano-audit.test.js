// piano-audit.test.js — the accuracy audit (owner concern, 2026-07-15:
// "I am not sure the piano logic is great / accurate yet"). Adversarial
// invariants across parsing, voicing, voice leading, spelling, and
// fingering — the properties a piano must never break, checked over a
// wide chord vocabulary rather than a few examples.
import { describe, it, expect } from "vitest";
import { parseChord, chordSymbol, sameChordSound, transposeChord, parseSheet } from "./theory.js";
import { rootPositionFull, smoothUpper, addBass, clampVoicing, LOW_MIDI, HIGH_MIDI } from "./voicing.js";
import { chordFingers, splitHands } from "./fingering.js";
import { spellChord } from "./spelling.js";

const pcOf = (m) => ((m % 12) + 12) % 12;
const pcsOfChord = (ch) => new Set(ch.intervals.map((i) => (ch.rootSemitone + i) % 12));

const VOCAB = [
  "C", "Cm", "C7", "Cmaj7", "Cm7", "Cdim", "Cdim7", "Caug", "Csus2", "Csus4",
  "C6", "Cm6", "Cadd9", "C9", "Cmaj9", "Cm9", "C5", "C7sus4", "Cm7b5",
  "F#", "F#m7", "Bb", "Bbmaj7", "Ebm", "Ab7", "Dbmaj7", "G#m", "D/F#", "Am/G", "C/G", "G/B",
];

describe("every voiced note belongs to its chord (the iron rule)", () => {
  for (const sym of VOCAB) {
    it(sym, () => {
      const ch = parseChord(sym);
      expect(ch, sym).not.toBeNull();
      const voiced = rootPositionFull(ch);
      expect(voiced.length).toBeGreaterThanOrEqual(2);
      const allowed = pcsOfChord(ch);
      if (ch.bassSemitone !== null) allowed.add(ch.bassSemitone);
      for (const m of voiced) {
        expect(allowed.has(pcOf(m)), `${sym}: midi ${m}`).toBe(true);
        expect(m).toBeGreaterThanOrEqual(LOW_MIDI);
        expect(m).toBeLessThanOrEqual(HIGH_MIDI);
      }
    });
  }
});

describe("slash chords: the stated bass is the floor, no phantom tones", () => {
  for (const sym of ["Am/G", "C/E", "D/F#", "G/B", "C/G"]) {
    it(sym, () => {
      const ch = parseChord(sym);
      const voiced = rootPositionFull(ch);
      expect(pcOf(voiced[0]), `${sym} floor`).toBe(ch.bassSemitone);
      // nothing sneaks in that is neither chord tone nor the stated bass
      const allowed = pcsOfChord(ch);
      allowed.add(ch.bassSemitone);
      for (const m of voiced) expect(allowed.has(pcOf(m)), `${sym}: ${m}`).toBe(true);
      // and the bass is strictly the lowest sounding note
      expect(Math.min(...voiced)).toBe(voiced[0]);
    });
  }
});

describe("smooth voice leading moves less than jumping roots", () => {
  it("on a plain folk progression", () => {
    const { progression } = parseSheet("C F G C Am F G C");
    let prevUp = null;
    let prevSmooth = null;
    let prevRoot = null;
    let smoothMove = 0;
    let rootMove = 0;
    const move = (a, b) => {
      const n = Math.min(a.length, b.length);
      let d = 0;
      for (let i = 0; i < n; i++) d += Math.abs(a[i] - b[i]);
      return d;
    };
    for (const ch of progression) {
      const up = smoothUpper(ch, prevUp);
      const smooth = clampVoicing(addBass(up, ch));
      const root = rootPositionFull(ch);
      if (prevSmooth) smoothMove += move(prevSmooth, smooth);
      if (prevRoot) rootMove += move(prevRoot, root);
      // smooth voicings obey the same membership rule
      const allowed = pcsOfChord(ch);
      if (ch.bassSemitone !== null) allowed.add(ch.bassSemitone);
      for (const m of smooth) expect(allowed.has(pcOf(m)), chordSymbol(ch)).toBe(true);
      prevUp = up;
      prevSmooth = smooth;
      prevRoot = root;
    }
    expect(smoothMove).toBeLessThanOrEqual(rootMove);
  });
});

describe("enharmonics and transposition", () => {
  it("Db and C# are the same sound with different clothes", () => {
    expect(sameChordSound(parseChord("Db"), parseChord("C#"))).toBe(true);
    expect(sameChordSound(parseChord("Ebm7"), parseChord("D#m7"))).toBe(true);
  });
  it("transpose is a group action: +12 ≡ 0, +7+5 ≡ +12", () => {
    const ch = parseChord("Am7/G");
    expect(sameChordSound(transposeChord(ch, 12), ch)).toBe(true);
    expect(sameChordSound(transposeChord(transposeChord(ch, 7), 5), ch)).toBe(true);
  });
  it("flat keys spell flat: the 4 chord of Ab major is Db, never C#", () => {
    const ch = parseChord("C#"); // enters as a sharp
    const spelled = spellChord(ch, { tonic: 8, mode: "major" }); // key of Ab
    expect(spelled).toBe("Db");
  });
});

describe("fingering keeps to human hands", () => {
  it("chord fingers: five max, one per note, ascending in the right hand", () => {
    for (const sym of ["C", "G7", "Am", "Fmaj7", "Dm7"]) {
      const voiced = rootPositionFull(parseChord(sym)).slice(-4); // upper structure
      const fingers = chordFingers(voiced, "R");
      expect(fingers).toHaveLength(voiced.length);
      for (const f of fingers) {
        expect(f).toBeGreaterThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(5);
      }
      for (let i = 1; i < fingers.length; i++) expect(fingers[i], sym).toBeGreaterThan(fingers[i - 1]);
    }
  });
  it("splitHands never crosses the hands and never loses a note", () => {
    for (const sym of ["Cmaj7", "Am/G", "G7", "Dbmaj7"]) {
      const voiced = rootPositionFull(parseChord(sym));
      const { L, R } = splitHands(voiced);
      if (L.length && R.length) {
        expect(Math.max(...L), sym).toBeLessThanOrEqual(Math.min(...R));
      }
      expect([...L, ...R].sort((a, b) => a - b)).toEqual(voiced.slice().sort((a, b) => a - b));
    }
  });
});

describe("parser edge cases stay honest", () => {
  it("case sensitivity: m7 is minor, M7 is major-seven", () => {
    expect(parseChord("Cm7").intervals).toContain(3);
    expect(parseChord("CM7").intervals).toContain(4);
    expect(parseChord("CM7").intervals).toContain(11);
  });
  it("power chords carry no third", () => {
    const c5 = parseChord("C5");
    expect(c5.intervals).not.toContain(3);
    expect(c5.intervals).not.toContain(4);
  });
  it("garbage stays garbage", () => {
    for (const junk of ["H7", "Cmm", "X", "12", "?"]) expect(parseChord(junk), junk).toBeNull();
  });
});
