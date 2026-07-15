import { describe, it, expect } from "vitest";
import { detectPitch, hzToMidi, midiToHz, noteOf, tessituraFrom, singFit } from "./pitch.js";

const SR = 44100;
const sine = (hz, n = 2048, amp = 0.4) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / SR));
const voiceish = (hz, n = 2048) =>
  Float32Array.from({ length: n }, (_, i) =>
    0.35 * Math.sin(2 * Math.PI * hz * i / SR) +
    0.18 * Math.sin(2 * Math.PI * 2 * hz * i / SR) +
    0.08 * Math.sin(2 * Math.PI * 3 * hz * i / SR));

describe("detectPitch — YIN on synthesized tones", () => {
  it("nails pure sines across the singing range", () => {
    for (const hz of [110, 196, 220, 330, 440, 660]) {
      const r = detectPitch(sine(hz), SR);
      expect(r, `${hz}Hz`).not.toBeNull();
      expect(Math.abs(r.hz - hz) / hz, `${hz}Hz`).toBeLessThan(0.01);
      expect(r.clarity).toBeGreaterThan(0.8);
    }
  });

  it("tracks the fundamental of a harmonic (voice-like) tone", () => {
    const r = detectPitch(voiceish(147), SR); // D3-ish
    expect(r).not.toBeNull();
    expect(Math.abs(r.hz - 147) / 147).toBeLessThan(0.01);
  });

  it("refuses silence and noise", () => {
    expect(detectPitch(new Float32Array(2048), SR)).toBeNull();
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const noise = Float32Array.from({ length: 2048 }, () => rand() * 0.4);
    const r = detectPitch(noise, SR);
    if (r) expect(r.clarity).toBeLessThan(0.6); // if anything, not confident
  });

  it("honors the min/max window", () => {
    expect(detectPitch(sine(50), SR)).toBeNull();   // below the voice floor
    expect(detectPitch(sine(1500), SR)).toBeNull(); // above the ceiling
  });
});

describe("note math", () => {
  it("A440 is midi 69; conversions round-trip", () => {
    expect(hzToMidi(440)).toBeCloseTo(69);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(hzToMidi(196))).toBeCloseTo(196);
  });
  it("noteOf names and cents", () => {
    expect(noteOf(57)).toEqual({ midi: 57, name: "A3", cents: 0 });
    const flat = noteOf(56.8);
    expect(flat.name).toBe("A3");
    expect(flat.cents).toBeCloseTo(-20);
  });
});

describe("tessituraFrom — where the voice lives, not its extremes", () => {
  it("needs a real sample count", () => {
    expect(tessituraFrom([{ midi: 50 }, { midi: 52 }])).toBeNull();
  });
  it("finds the band and ignores one wild outlier", () => {
    const samples = [
      ...Array.from({ length: 60 }, (_, i) => ({ midi: 50 + (i % 7) })), // living 50..56
      { midi: 79 }, // one show-off squeak
    ];
    const band = tessituraFrom(samples);
    expect(band.low).toBeGreaterThanOrEqual(50);
    expect(band.high).toBeLessThanOrEqual(57);
    expect(band.center).toBeGreaterThan(51);
    expect(band.center).toBeLessThan(55);
  });
});

describe("singFit — the Your Key verdict", () => {
  const band = { low: 48, high: 57, center: 52 }; // C3–A3-ish
  it("says take it down when the take rode the ceiling", () => {
    const take = Array.from({ length: 60 }, (_, i) => 58 + (i % 4)); // 58..61
    const fit = singFit(take, band);
    expect(fit.shift).toBeLessThanOrEqual(-3);
    expect(fit.note).toMatch(/take it down/);
  });
  it("says lift it when the take scraped the floor", () => {
    const take = Array.from({ length: 60 }, (_, i) => 44 + (i % 3));
    const fit = singFit(take, band);
    expect(fit.shift).toBeGreaterThanOrEqual(2);
  });
  it("blesses a take inside the band", () => {
    const take = Array.from({ length: 60 }, (_, i) => 50 + (i % 6));
    expect(singFit(take, band).shift).toBe(0);
  });
  it("returns null without enough evidence", () => {
    expect(singFit([50, 51], band)).toBeNull();
    expect(singFit(Array(60).fill(50), null)).toBeNull();
  });
});
