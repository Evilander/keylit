import { describe, it, expect } from "vitest";
import { parseSheet, parseChord, chordSymbol, detectKey } from "./theory.js";
import { coverize, coverSheet, keyShiftFor, COVER_STYLES } from "./coverize.js";

const progOf = (sheet) => parseSheet(sheet).progression;
const keyOf = (prog) => { const k = detectKey(prog); return { tonic: k.tonic, mode: k.mode }; };

// a poppy sheet with color chords, a slash walk, and one borrowed chord
const POP = `[Verse]\nCmaj7 Am7 Fadd9 G7\n[Chorus]\nC C/B Am7 Ab F G7 C`;
// a grunge-ish sheet: power-chord shapes parse as 5ths
const HEAVY = `[Riff]\nE5 G5 A5 C5\n[Chorus]\nE5 D5 A5 E5`;

describe("coverize — iron rules across every style", () => {
  const prog = progOf(POP);
  const key = keyOf(prog);

  for (const { id, name } of COVER_STYLES) {
    it(`${name}: same length, every chord re-parses, roots hold (or campfire maps)`, () => {
      const r = coverize(prog, key, id);
      expect(r).not.toBeNull();
      expect(r.chords).toHaveLength(prog.length);
      for (let i = 0; i < r.chords.length; i++) {
        const sym = chordSymbol(r.chords[i]);
        expect(parseChord(sym), `${name}: ${sym}`).not.toBeNull();
        expect(r.chords[i].section).toBe(prog[i].section); // sections survive
        if (id !== "campfire") {
          // roots never move (the cover keeps the song's spine)
          const expectRoot = ((prog[i].rootSemitone + r.shift) % 12 + 12) % 12;
          expect(r.chords[i].rootSemitone, `${name} @${i}`).toBe(expectRoot);
        }
      }
      expect(r.tempo.bpm[0]).toBeLessThan(r.tempo.bpm[1]);
      expect(typeof r.notes).toBe("string");
    });
  }

  it("returns null on nothing", () => {
    expect(coverize([], key, "callahan")).toBeNull();
    expect(coverize(prog, key, "not-a-style")).toBeNull();
  });
});

describe("Callahan — the room does the color", () => {
  const prog = progOf(POP);
  const key = keyOf(prog);
  const r = coverize(prog, key, "callahan");

  it("strips color tones; the V keeps its seventh", () => {
    const syms = r.chords.map(chordSymbol);
    for (const s of syms) {
      const ch = parseChord(s);
      const isV = ch.rootSemitone === ((key.tonic + r.shift + 7) % 12 + 12) % 12;
      if (isV) expect(ch.intervals).toContain(10); // G7 stays G7
      else expect(ch.intervals.length, s).toBeLessThanOrEqual(3);
    }
  });

  it("lands on a Callahan home key (D/E/G) by the shortest road, and says so", () => {
    const t = ((key.tonic + r.shift) % 12 + 12) % 12;
    expect([2, 4, 7]).toContain(t);
    expect(Math.abs(r.shift)).toBeLessThanOrEqual(6);
    if (r.shift !== 0) expect(r.moves.some((m) => m.at === null && /semitone/.test(m.why))).toBe(true);
  });

  it("keeps a stepwise slash bass, drops nothing silently", () => {
    // C/B is a stepwise walk — it survives quality-stripping with its bass
    const withBass = r.chords.filter((c) => c.bassSemitone !== null && c.bassSemitone !== c.rootSemitone);
    expect(withBass.length).toBeGreaterThanOrEqual(1);
    expect(r.moves.filter((m) => m.at !== null).every((m) => m.from && m.to && m.why.length > 10)).toBe(true);
  });
});

describe("Elliott Smith — color from inside", () => {
  const prog = progOf("[Verse]\nC Am F G\n[Chorus]\nC F C G");
  const key = keyOf(prog);
  const r = coverize(prog, key, "smith");

  it("the I grows a maj7, minors grow sevenths, the V sharpens to 7", () => {
    const syms = r.chords.map(chordSymbol);
    const tonicPc = ((key.tonic + r.shift) % 12 + 12) % 12;
    const tonicChords = r.chords.filter((c) => c.rootSemitone === tonicPc);
    expect(tonicChords.some((c) => c.intervals.includes(11))).toBe(true); // maj7 somewhere on home
    expect(r.chords.some((c) => c.intervals.includes(3) && c.intervals.includes(10))).toBe(true); // m7
    const vPc = (tonicPc + 7) % 12;
    for (const c of r.chords.filter((c) => c.rootSemitone === vPc && c.intervals.includes(4))) {
      expect(c.intervals, syms.join(" ")).toContain(10); // every major V is V7
    }
  });

  it("never suggests playing open — Smith lives capo'd", () => {
    expect(r.capo).toBeGreaterThanOrEqual(2);
  });
});

describe("Berman — one crooked corner", () => {
  const prog = progOf(POP);
  const key = keyOf(prog);
  const r = coverize(prog, key, "berman");

  it("the borrowed Ab keeps its strange root, flattened to a triad", () => {
    const abPc = ((8 + r.shift) % 12 + 12) % 12; // Ab shifted
    const crooked = r.chords.find((c) => c.rootSemitone === abPc);
    expect(crooked).toBeTruthy();
    expect(crooked.intervals).toHaveLength(3);
    expect(r.moves.some((m) => /crooked/.test(m.why))).toBe(true);
  });

  it("everything else is triads (V may keep 7)", () => {
    for (const c of r.chords) {
      const isV = c.rootSemitone === ((key.tonic + r.shift + 7) % 12 + 12) % 12;
      if (!isV) expect(c.intervals.length, chordSymbol(c)).toBeLessThanOrEqual(3);
    }
  });
});

describe("power chords in — playable songs out", () => {
  const prog = progOf(HEAVY);
  const key = keyOf(prog);

  it("Callahan gives the riff real triads in a low key", () => {
    const r = coverize(prog, key, "callahan");
    // 5ths have no third; the cover must decide one (context-major here)
    for (const c of r.chords) expect(c.intervals.length).toBeGreaterThanOrEqual(2);
    expect(r.chords.every((c) => parseChord(chordSymbol(c)))).toBe(true);
  });

  it("Campfire folds everything into the four pillars", () => {
    const r = coverize(prog, key, "campfire");
    const tonicPc = ((key.tonic + r.shift) % 12 + 12) % 12;
    const allowed = new Set([tonicPc, (tonicPc + 5) % 12, (tonicPc + 7) % 12, (tonicPc + 9) % 12]);
    for (const c of r.chords) expect(allowed.has(c.rootSemitone), chordSymbol(c)).toBe(true);
  });
});

describe("Kozelek — drone weather", () => {
  const prog = progOf("[Verse]\nC F Am G");
  const key = keyOf(prog);
  const r = coverize(prog, key, "kozelek");
  it("majors take an add9, a tuning hint rides along, the tempo crawls", () => {
    expect(r.chords.some((c) => c.intervals.includes(14))).toBe(true);
    expect(r.tuningHint).toMatch(/D/);
    expect(r.tempo.bpm[1]).toBeLessThanOrEqual(70);
  });
});

describe("Slowcore — not even sevenths", () => {
  const prog = progOf("[Verse]\nCmaj7 Am7 F G7");
  const key = keyOf(prog);
  const r = coverize(prog, key, "slowcore");
  it("no chord carries a seventh of any kind", () => {
    for (const c of r.chords) {
      expect(c.intervals.includes(10), chordSymbol(c)).toBe(false);
      expect(c.intervals.includes(11), chordSymbol(c)).toBe(false);
    }
  });
});

describe("keyShiftFor", () => {
  it("finds the nearest home, biased down when asked", () => {
    expect(keyShiftFor(0, [2, 4, 7], "none")).toBe(2);   // C → D
    expect(keyShiftFor(5, [4, 7], "down")).toBe(-1);      // F → E
    expect(keyShiftFor(3, [2, 4], "down")).toBe(-1);      // Eb: D and E tie → down wins
    expect(keyShiftFor(7, [7], "none")).toBe(0);          // already home
  });
});

describe("coverSheet — the keepable artifact", () => {
  it("writes a chart with advice up top and sections preserved", () => {
    const prog = progOf(POP);
    const key = keyOf(prog);
    const r = coverize(prog, key, "callahan");
    const sheet = coverSheet(r, { title: "Test Song", artist: "Someone", styleName: "Bill Callahan" });
    expect(sheet).toContain("(Bill Callahan version)");
    expect(sheet).toContain("Key: ");
    expect(sheet).toContain("[Verse]");
    expect(sheet).toContain("[Chorus]");
    // the sheet round-trips through the parser at the same length
    const reparsed = parseSheet(sheet).progression;
    expect(reparsed.length).toBeGreaterThan(0);
  });

  it("what it writes IS what a reload plays — adjacent duplicates collapse at write time", () => {
    // A style translation can map two different source chords onto the same
    // target back-to-back; parseSheet collapses those on reload, so writing
    // both silently loses a chord between keep and reopen.
    const prog = progOf(POP);
    const key = keyOf(prog);
    const r = coverize(prog, key, "callahan");
    const sheet = coverSheet(r, { title: "T", styleName: "S" });
    const reparsed = parseSheet(sheet).progression;
    // collapse the result the same way parseSheet collapses text
    const expected = [];
    for (const ch of r.chords) {
      const prev = expected[expected.length - 1];
      if (!prev || chordSymbol(prev) !== chordSymbol(ch) || prev.section !== ch.section) expected.push(ch);
    }
    expect(reparsed.length).toBe(expected.length);
  });

  it("says out loud when the original's tab was left behind", () => {
    const prog = progOf(POP);
    const key = keyOf(prog);
    const r = coverize(prog, key, "campfire");
    expect(coverSheet(r, { title: "T", styleName: "S", hadTab: true })).toContain("chord chart only");
    expect(coverSheet(r, { title: "T", styleName: "S" })).not.toContain("chord chart only");
  });
});
