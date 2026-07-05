import { describe, it, expect } from "vitest";
import { DRUMS } from "./band.js";
import { METERS, meterGroove, downbeatTimes, nextChallenge, scoreTaps } from "./meter.js";

const DRUM_NOTES = new Set(Object.values(DRUMS));

describe("METERS", () => {
  it("ships the three feels", () => {
    expect(Object.keys(METERS)).toEqual(["4/4", "3/4", "6/8"]);
    expect(METERS["4/4"].beatsPerBar).toBe(4);
    expect(METERS["3/4"].beatsPerBar).toBe(3);
    expect(METERS["6/8"].beatsPerBar).toBe(6); // counted in eighths
  });
});

describe("meterGroove", () => {
  for (const meterId of Object.keys(METERS)) {
    it(`${meterId}: legal kit pieces on a legal grid, kick on every ONE`, () => {
      const bars = 2;
      const events = meterGroove(meterId, bars);
      const bpb = METERS[meterId].beatsPerBar;
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.ch).toBe("drums");
        expect(DRUM_NOTES.has(e.midis[0])).toBe(true);
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThan(bars * bpb);
        expect(e.v).toBeGreaterThan(0);
        expect(e.v).toBeLessThanOrEqual(1);
      }
      for (let bar = 0; bar < bars; bar++) {
        expect(events.some((e) => e.t === bar * bpb && e.midis[0] === DRUMS.kick)).toBe(true);
      }
    });
  }

  it("6/8 pulses in two: the mid-bar landing on beat 4 (t=3) is marked", () => {
    const events = meterGroove("6/8", 1);
    expect(events.some((e) => e.t === 3 && e.midis[0] === DRUMS.snare)).toBe(true);
  });

  it("3/4 keeps the snare out of it — no backbeat to lean on", () => {
    const events = meterGroove("3/4", 2);
    expect(events.every((e) => e.midis[0] !== DRUMS.snare)).toBe(true);
  });
});

describe("downbeatTimes", () => {
  it("lands on every ONE", () => {
    expect(downbeatTimes("4/4", 3)).toEqual([0, 4, 8]);
    expect(downbeatTimes("3/4", 2)).toEqual([0, 3]);
    expect(downbeatTimes("6/8", 2)).toEqual([0, 6]);
  });
});

describe("nextChallenge", () => {
  it("is deterministic per seed", () => {
    expect(nextChallenge(3)).toEqual(nextChallenge(3));
  });

  it("covers all three meters across consecutive seeds", () => {
    const seen = new Set();
    for (let s = 0; s < 6; s++) seen.add(nextChallenge(s).meterId);
    expect(seen).toEqual(new Set(["4/4", "3/4", "6/8"]));
  });

  it("carries a workable tempo", () => {
    for (let s = 0; s < 6; s++) {
      const { bpm } = nextChallenge(s);
      expect(bpm).toBeGreaterThanOrEqual(60);
      expect(bpm).toBeLessThanOrEqual(160);
    }
  });
});

describe("scoreTaps — did you find the ONE?", () => {
  const downbeats = [0, 2, 4, 6]; // seconds

  it("perfect taps: full accuracy, locked in", () => {
    const r = scoreTaps([0, 2, 4, 6], downbeats);
    expect(r.hits).toBe(4);
    expect(r.misses).toBe(0);
    expect(r.extras).toBe(0);
    expect(r.accuracy).toBe(1);
    expect(r.meanOffset).toBeCloseTo(0, 5);
    expect(r.feel).toBe("locked");
  });

  it("consistently early taps read as rushing", () => {
    const r = scoreTaps([-0.09, 1.91, 3.91, 5.91], downbeats);
    expect(r.hits).toBe(4);
    expect(r.meanOffset).toBeCloseTo(-0.09, 5);
    expect(r.feel).toBe("rushing");
  });

  it("consistently late taps read as dragging", () => {
    const r = scoreTaps([0.1, 2.1, 4.1, 6.1], downbeats);
    expect(r.feel).toBe("dragging");
  });

  it("missing half the ONEs halves the accuracy", () => {
    const r = scoreTaps([0, 4], downbeats);
    expect(r.hits).toBe(2);
    expect(r.misses).toBe(2);
    expect(r.accuracy).toBe(0.5);
  });

  it("taps far from any ONE count as extras, not hits", () => {
    const r = scoreTaps([1, 3, 5], downbeats);
    expect(r.hits).toBe(0);
    expect(r.extras).toBe(3);
    expect(r.misses).toBe(4);
  });

  it("each ONE claims at most one tap; the rest are extras", () => {
    const r = scoreTaps([0, 0.05, 2], downbeats);
    expect(r.hits).toBe(2);
    expect(r.extras).toBe(1);
  });

  it("silence scores zero without blowing up", () => {
    const r = scoreTaps([], downbeats);
    expect(r.hits).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.meanOffset).toBeNull();
    expect(r.feel).toBeNull();
  });

  it("honors a custom tolerance", () => {
    const tight = scoreTaps([0.15], [0], { tol: 0.1 });
    expect(tight.hits).toBe(0);
    const loose = scoreTaps([0.15], [0], { tol: 0.2 });
    expect(loose.hits).toBe(1);
  });
});
