import { describe, it, expect } from "vitest";
import { parseChord } from "./theory.js";
import { noteScore, createLockMeter, tierFor, eventsForTier, TIERS } from "./session.js";

const C = parseChord("C");

describe("noteScore — the session forgives but notices", () => {
  it("chord tone on the grid is perfect", () => {
    expect(noteScore(60, 4.0, C)).toBe(1); // C on the beat
    expect(noteScore(64, 2.5, C)).toBe(1); // E on the &
  });
  it("wrong pitch costs, loose time costs, neither zeroes", () => {
    expect(noteScore(61, 4.0, C)).toBeCloseTo(0.25); // C# on the beat
    expect(noteScore(60, 4.19, C)).toBeCloseTo(0.6); // C, pushed
    expect(noteScore(61, 4.3, C)).toBeGreaterThan(0); // never zero
  });
});

describe("createLockMeter — rises with playing, breathes out in silence", () => {
  it("locks up under a stream of good notes", () => {
    const m = createLockMeter();
    for (let i = 0; i < 12; i++) m.feed(1);
    expect(m.lock()).toBeGreaterThan(0.85);
  });
  it("wrong notes hold it down", () => {
    const m = createLockMeter();
    for (let i = 0; i < 12; i++) m.feed(0.25);
    expect(m.lock()).toBeLessThan(0.3);
  });
  it("silence decays the lock", () => {
    const m = createLockMeter();
    for (let i = 0; i < 12; i++) m.feed(1);
    const before = m.lock();
    m.tick(8); // eight silent beats
    expect(m.lock()).toBeLessThan(before * 0.8);
  });
});

describe("tierFor — hysteresis, not flapping", () => {
  it("climbs only past the margin, falls only past the margin", () => {
    expect(tierFor(0.52, 1)).toBe(1);  // barely over the 0.5 line: stay
    expect(tierFor(0.58, 1)).toBe(2);  // clear of it: climb
    expect(tierFor(0.47, 2)).toBe(2);  // barely under: stay
    expect(tierFor(0.42, 2)).toBe(1);  // clearly under: fall
    expect(tierFor(0.9, 2)).toBe(3);
    expect(tierFor(0.05, 1)).toBe(0);
  });
  it("never climbs two tiers in one step", () => {
    expect(tierFor(0.95, 0)).toBe(1); // the band fills gradually
  });
  it("has four rungs with words", () => {
    expect(TIERS).toHaveLength(4);
    for (const t of TIERS) expect(t.line.length).toBeGreaterThan(8);
  });
});

describe("eventsForTier — tiers strictly nest", () => {
  const events = [
    { t: 0, ch: "bass", midis: [36], dur: 1 },
    { t: 2, ch: "bass", midis: [43], dur: 1 },
    { t: 0, ch: "drums", midis: [36], dur: 0.1 },
    { t: 1, ch: "drums", midis: [42], dur: 0.1 },
    { t: 0, ch: "piano", midis: [60, 64, 67], dur: 2 },
    { t: 1.5, ch: "piano", midis: [72], dur: 0.5 },
    { t: 2, ch: "piano", midis: [64, 67], dur: 2 },
  ];
  it("heartbeat keeps the ONE's bass and kick only", () => {
    const t0 = eventsForTier(events, 0);
    expect(t0.every((e) => e.t === 0 && e.ch !== "piano")).toBe(true);
    expect(t0.length).toBe(2);
  });
  it("each tier contains the one below", () => {
    let prev = eventsForTier(events, 0);
    for (const tier of [1, 2, 3]) {
      const cur = eventsForTier(events, tier);
      for (const e of prev) expect(cur).toContain(e);
      prev = cur;
    }
    expect(eventsForTier(events, 3)).toHaveLength(events.length);
  });
});
