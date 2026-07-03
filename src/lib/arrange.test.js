import { describe, it, expect } from "vitest";
import { parseChord } from "./theory.js";
import { STYLES, arrangeProgression } from "./arrange.js";

const prog = (...syms) => syms.map((s) => parseChord(s));
const pc = (m) => ((m % 12) + 12) % 12;
const chordPcs = (ch) => {
  const set = new Set(ch.intervals.map((i) => pc(ch.rootSemitone + i)));
  if (ch.bassSemitone !== null) set.add(pc(ch.bassSemitone));
  return set;
};

describe("STYLES registry", () => {
  it("ships the four patterns with their meters", () => {
    expect(Object.keys(STYLES)).toEqual(["ballad", "waltz", "boomchick", "broken"]);
    expect(STYLES.waltz.beatsPerBar).toBe(3);
    expect(STYLES.ballad.beatsPerBar).toBe(4);
  });
});

describe("the invariant — no wrong notes, by construction", () => {
  const chords = prog("C", "Am/G", "F", "G7", "Bdim", "Dsus4", "E7/G#");
  for (const styleId of Object.keys(STYLES)) {
    it(`${styleId}: every pitch belongs to its chord (or its named bass)`, () => {
      const { events, beatsPerBar } = arrangeProgression(chords, styleId);
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        const ch = chords[e.stepIdx];
        const allowed = chordPcs(ch);
        for (const m of e.midis) {
          expect(allowed.has(pc(m)), `${styleId}: midi ${m} (pc ${pc(m)}) escaped ${ch.raw} at step ${e.stepIdx}`).toBe(true);
        }
        expect(Math.floor(e.t / beatsPerBar)).toBe(e.stepIdx);
      }
    });
  }
});

describe("timing & shape", () => {
  it("one bar per chord, events sorted, durations positive", () => {
    const chords = prog("C", "F", "G");
    const { events, totalBeats, beatsPerBar } = arrangeProgression(chords, "ballad");
    expect(beatsPerBar).toBe(4);
    expect(totalBeats).toBe(12);
    let last = -1;
    for (const e of events) {
      expect(e.t).toBeGreaterThanOrEqual(last);
      last = e.t;
      expect(e.t).toBeGreaterThanOrEqual(0);
      expect(e.t).toBeLessThan(totalBeats);
      expect(e.dur).toBeGreaterThan(0);
      expect(e.v).toBeGreaterThan(0);
      expect(e.v).toBeLessThanOrEqual(1);
      expect(["L", "R"]).toContain(e.hand);
    }
  });

  it("waltz: bass on 1, chords on 2 and 3", () => {
    const { events } = arrangeProgression(prog("C"), "waltz");
    const lh = events.filter((e) => e.hand === "L");
    const rh = events.filter((e) => e.hand === "R");
    expect(lh.map((e) => e.t)).toEqual([0]);
    expect(rh.map((e) => e.t)).toEqual([1, 2]);
  });

  it("boom-chick alternates two different bass notes when the chord has a fifth", () => {
    const { events } = arrangeProgression(prog("C"), "boomchick");
    const lh = events.filter((e) => e.hand === "L");
    expect(lh).toHaveLength(2);
    expect(lh[0].midis[0]).not.toBe(lh[1].midis[0]);
    expect(pc(lh[1].midis[0])).toBe(7); // the fifth of C is G
  });

  it("broken: eight right-hand eighths per bar, single notes, top note recurs", () => {
    const { events } = arrangeProgression(prog("C"), "broken");
    const rh = events.filter((e) => e.hand === "R");
    expect(rh).toHaveLength(8);
    expect(rh.map((e) => e.t)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    for (const e of rh) expect(e.midis).toHaveLength(1);
    const top = Math.max(...rh.map((e) => e.midis[0]));
    expect(rh.filter((e) => e.midis[0] === top).length).toBeGreaterThanOrEqual(3);
  });
});

describe("musicality", () => {
  it("upper voicings are voice-led: adjacent shared-tone chords keep a common key", () => {
    const { events } = arrangeProgression(prog("C", "Am"), "ballad");
    const rhNotes = (step) => new Set(events.filter((e) => e.hand === "R" && e.stepIdx === step).flatMap((e) => e.midis));
    const common = [...rhNotes(0)].filter((m) => rhNotes(1).has(m));
    expect(common.length).toBeGreaterThan(0);
  });

  it("a slash chord walks on its written bass", () => {
    const { events } = arrangeProgression(prog("Am/G"), "ballad");
    const lh = events.filter((e) => e.hand === "L");
    expect(lh.some((e) => e.midis.some((m) => pc(m) === 7))).toBe(true);
  });

  it("empty progression arranges to silence", () => {
    const { events, totalBeats } = arrangeProgression([], "waltz");
    expect(events).toEqual([]);
    expect(totalBeats).toBe(0);
  });
});
