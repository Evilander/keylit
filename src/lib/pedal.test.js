import { describe, it, expect } from "vitest";
import { parseChord, pedalRelation } from "./theory.js";
import { pedalEvents, suggestPedals } from "./pedal.js";

const prog = (...syms) => syms.map((s) => parseChord(s));
const pc = (m) => ((m % 12) + 12) % 12;
const chordPcs = (ch) => {
  const set = new Set(ch.intervals.map((i) => pc(ch.rootSemitone + i)));
  if (ch.bassSemitone !== null) set.add(pc(ch.bassSemitone));
  return set;
};

describe("suggestPedals", () => {
  it("offers the classic pedals: the 1 and the 5 of the key", () => {
    const pedals = suggestPedals({ tonic: 0, mode: "major" }); // C major
    expect(pedals).toHaveLength(2);
    expect(pedals[0]).toMatchObject({ pc: 0, degree: "1" });
    expect(pedals[1]).toMatchObject({ pc: 7, degree: "5" });
  });

  it("follows the key (G major pedals are G and D)", () => {
    const pedals = suggestPedals({ tonic: 7, mode: "major" });
    expect(pedals.map((p) => p.pc)).toEqual([7, 2]);
  });
});

describe("pedalEvents", () => {
  const chords = prog("C", "F", "G", "Am");

  it("drones the pedal once per bar, full-bar long, in the low register", () => {
    const { events, beatsPerBar } = pedalEvents(chords, 0);
    const drones = events.filter((e) => e.ch === "bass");
    expect(drones).toHaveLength(chords.length);
    drones.forEach((e, i) => {
      expect(e.t).toBe(i * beatsPerBar);
      expect(e.dur).toBeCloseTo(beatsPerBar, 1);
      expect(pc(e.midis[0])).toBe(0);
      expect(e.midis[0]).toBeLessThan(48); // genuinely low
    });
  });

  it("plays the chords above the pedal on 1 and 3, chord tones only", () => {
    const { events, beatsPerBar } = pedalEvents(chords, 0);
    const chordsAbove = events.filter((e) => e.ch === "piano");
    chords.forEach((ch, i) => {
      const bar = chordsAbove.filter((e) => e.stepIdx === i);
      expect(bar.map((e) => e.t)).toEqual([i * beatsPerBar, i * beatsPerBar + 2]);
      const allowed = chordPcs(ch);
      for (const e of bar) for (const m of e.midis) expect(allowed.has(pc(m))).toBe(true);
    });
  });

  it("marks every bar consonant or dissonant, agreeing with pedalRelation", () => {
    const { marks } = pedalEvents(chords, 0); // C pedal
    expect(marks).toHaveLength(chords.length);
    marks.forEach((mark, i) => {
      expect(mark.stepIdx).toBe(i);
      expect(mark.relation).toBe(pedalRelation(0, chords[i]));
    });
    // sanity: C against C major is consonant, against G major (G-B-D) it is not
    expect(marks[0].relation).toBe("consonant");
    expect(marks[2].relation).toBe("dissonant");
  });

  it("keeps the chords out of the pedal's register — the drone owns the bottom", () => {
    const { events } = pedalEvents(chords, 7);
    const drone = Math.max(...events.filter((e) => e.ch === "bass").map((e) => e.midis[0]));
    const lowestChord = Math.min(...events.filter((e) => e.ch === "piano").flatMap((e) => e.midis));
    expect(lowestChord).toBeGreaterThan(drone);
  });

  it("empty progression: silence, no marks", () => {
    const { events, marks, totalBeats } = pedalEvents([], 0);
    expect(events).toEqual([]);
    expect(marks).toEqual([]);
    expect(totalBeats).toBe(0);
  });
});
