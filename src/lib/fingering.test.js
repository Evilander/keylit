import { describe, it, expect } from "vitest";
import { fingerEvents, chordFingers, splitHands, melodicFinger, isBlackKey } from "./fingering.js";

const ev = (...midiGroups) => midiGroups.map((g, i) => ({
  col: i, notes: (Array.isArray(g) ? g : [g]).map((m) => ({ midi: m })),
}));
const fingersOf = (out) => out.map((e) => e.notes.map((n) => n.finger));
const handsOf = (out) => out.map((e) => e.notes.map((n) => n.hand));

describe("melodic fingering — five-finger positions", () => {
  it("fingers an ascending five-note run 1-2-3-4-5", () => {
    const out = fingerEvents(ev(60, 62, 64, 65, 67));
    expect(fingersOf(out)).toEqual([[1], [2], [3], [4], [5]]);
    expect(out.slice(1).every((e) => !e.handShift)).toBe(true);
  });

  it("shifts position (thumb under) when the line escapes the window", () => {
    const out = fingerEvents(ev(60, 62, 64, 65, 67, 69, 71));
    expect(fingersOf(out)).toEqual([[1], [2], [3], [4], [5], [1], [2]]);
    expect(out[5].handShift).toBe(true);
  });

  it("anticipates a descending line and starts on the pinky", () => {
    const out = fingerEvents(ev(67, 65, 64, 62, 60));
    expect(fingersOf(out)).toEqual([[5], [4], [3], [2], [1]]);
  });

  it("never plants the thumb on a black key", () => {
    const state = { pos: null };
    const f = melodicFinger(66, "R", state, 68); // F#4 ascending
    expect(f).toBe(2);
    expect(isBlackKey(state.pos)).toBe(false);
  });

  it("sends a low guitar riff to the left hand", () => {
    const out = fingerEvents(ev(40, 43, 45)); // E2 G2 A2
    expect(handsOf(out)).toEqual([["L"], ["L"], ["L"]]);
  });
});

describe("chord fingering", () => {
  it("gives a right-hand triad 1-3-5", () => {
    expect(chordFingers([60, 64, 67], "R")).toEqual([1, 3, 5]);
  });
  it("gives a tight cluster 1-2-3", () => {
    expect(chordFingers([60, 62, 64], "R")).toEqual([1, 2, 3]);
  });
  it("mirrors the left hand (pinky on the bottom)", () => {
    expect(chordFingers([40, 47], "L")).toEqual([5, 1]);
    expect(chordFingers([48, 52, 55], "L")).toEqual([5, 3, 1]);
  });
  it("handles an octave 1-5", () => {
    expect(chordFingers([60, 72], "R")).toEqual([1, 5]);
  });
});

describe("hand splitting", () => {
  it("splits a wide strum at the biggest gap", () => {
    const { L, R } = splitHands([48, 52, 55, 60, 64]); // open-C shape
    expect(L).toEqual([48, 52, 55]);
    expect(R).toEqual([60, 64]);
  });
  it("keeps a mid-register melody in one sticky hand", () => {
    const out = fingerEvents(ev(55, 57, 55, 53)); // G3 A3 G3 F3 around the boundary
    const hands = new Set(handsOf(out).flat());
    expect(hands.size).toBe(1);
  });
});

describe("fingerEvents — integration with tab shapes", () => {
  it("transposes by shift and keeps fingering consistent", () => {
    const out = fingerEvents(ev(60, 62, 64), 2);
    expect(out.map((e) => e.notes[0].midi)).toEqual([62, 64, 66]);
    expect(fingersOf(out)).toEqual([[1], [2], [3]]);
  });
  it("fingers a full open-position chord across both hands playably", () => {
    const out = fingerEvents(ev([40, 47, 52, 56, 59, 64])); // open E chord
    const notes = out[0].notes;
    const lh = notes.filter((n) => n.hand === "L");
    const rh = notes.filter((n) => n.hand === "R");
    expect(lh.map((n) => n.midi)).toEqual([40, 47]);      // E2 B2 — a fifth, easy
    expect(rh.map((n) => n.midi)).toEqual([52, 56, 59, 64]);
    const span = (g) => Math.max(...g.map((n) => n.midi)) - Math.min(...g.map((n) => n.midi));
    expect(span(rh)).toBeLessThanOrEqual(12);              // nothing wider than an octave
    expect(new Set(lh.map((n) => n.finger)).size).toBe(lh.length);
    expect(new Set(rh.map((n) => n.finger)).size).toBe(rh.length);
  });
});
