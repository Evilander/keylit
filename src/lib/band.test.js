import { describe, it, expect } from "vitest";
import { parseChord } from "./theory.js";
import { STYLES } from "./arrange.js";
import {
  DRUMS, applySwing, countIn, metronome, drumGroove, bassLine, arrangeBand,
} from "./band.js";

const prog = (...syms) => syms.map((s) => parseChord(s));
const pc = (m) => ((m % 12) + 12) % 12;
const chordPcs = (ch) => {
  const set = new Set(ch.intervals.map((i) => pc(ch.rootSemitone + i)));
  if (ch.bassSemitone !== null) set.add(pc(ch.bassSemitone));
  return set;
};
const bassPc = (ch) => pc(ch.bassSemitone !== null ? ch.bassSemitone : ch.rootSemitone);
const DRUM_NOTES = new Set(Object.values(DRUMS));

describe("DRUMS — the General MIDI kit map", () => {
  it("uses the canonical GM percussion numbers", () => {
    expect(DRUMS.kick).toBe(36);
    expect(DRUMS.stick).toBe(37);
    expect(DRUMS.snare).toBe(38);
    expect(DRUMS.hatC).toBe(42);
    expect(DRUMS.hatP).toBe(44);
    expect(DRUMS.ride).toBe(51);
  });
});

describe("applySwing", () => {
  it("delays only the off-beat eighths (t % 1 === 0.5), default ratio 2/3", () => {
    const events = [
      { t: 0, dur: 1, midis: [60], v: 0.5 },
      { t: 1.5, dur: 0.4, midis: [51], v: 0.4 },
      { t: 2, dur: 1, midis: [60], v: 0.5 },
    ];
    const swung = applySwing(events);
    expect(swung[0].t).toBe(0);
    expect(swung[1].t).toBeCloseTo(1 + 2 / 3, 5);
    expect(swung[2].t).toBe(2);
  });

  it("accepts a custom ratio and never mutates its input", () => {
    const events = [{ t: 0.5, dur: 0.4, midis: [42], v: 0.3 }];
    const swung = applySwing(events, 0.6);
    expect(swung[0].t).toBeCloseTo(0.6, 5);
    expect(events[0].t).toBe(0.5); // original untouched
  });
});

describe("countIn", () => {
  it("clicks once per beat with the ONE accented", () => {
    const events = countIn(4);
    expect(events.map((e) => e.t)).toEqual([0, 1, 2, 3]);
    expect(events.every((e) => e.ch === "drums")).toBe(true);
    expect(events.every((e) => e.midis.length === 1 && DRUM_NOTES.has(e.midis[0]))).toBe(true);
    expect(events[0].v).toBeGreaterThan(events[1].v);
  });

  it("follows the meter (3 beats in a waltz)", () => {
    expect(countIn(3).map((e) => e.t)).toEqual([0, 1, 2]);
  });
});

describe("metronome", () => {
  it("ticks every beat and accents every downbeat", () => {
    const events = metronome(2, 3);
    expect(events.map((e) => e.t)).toEqual([0, 1, 2, 3, 4, 5]);
    const accents = events.filter((e) => e.t % 3 === 0).map((e) => e.v);
    const offs = events.filter((e) => e.t % 3 !== 0).map((e) => e.v);
    expect(Math.min(...accents)).toBeGreaterThan(Math.max(...offs));
  });
});

describe("drumGroove", () => {
  for (const styleId of Object.keys(STYLES)) {
    it(`${styleId}: only real kit pieces, inside the bar grid, sane velocities`, () => {
      const bars = 3;
      const events = drumGroove(styleId, bars);
      const bpb = STYLES[styleId].beatsPerBar;
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.ch).toBe("drums");
        for (const m of e.midis) expect(DRUM_NOTES.has(m), `unknown drum note ${m}`).toBe(true);
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThan(bars * bpb);
        expect(e.dur).toBeGreaterThan(0);
        expect(e.v).toBeGreaterThan(0);
        expect(e.v).toBeLessThanOrEqual(1);
      }
    });
  }

  it("boom-chick is a backbeat: kick on 1 and 3, snare on 2 and 4", () => {
    const events = drumGroove("boomchick", 1);
    const at = (drum) => events.filter((e) => e.midis[0] === drum).map((e) => e.t);
    expect(at(DRUMS.kick)).toEqual(expect.arrayContaining([0, 2]));
    expect(at(DRUMS.snare)).toEqual(expect.arrayContaining([1, 3]));
  });

  it("the ballad keeps it soft: side-stick, no full snare", () => {
    const events = drumGroove("ballad", 2);
    expect(events.some((e) => e.midis[0] === DRUMS.stick)).toBe(true);
    expect(events.some((e) => e.midis[0] === DRUMS.snare)).toBe(false);
  });

  it("the waltz has no backbeat snare and lands the kick on every ONE", () => {
    const events = drumGroove("waltz", 2);
    expect(events.some((e) => e.midis[0] === DRUMS.snare)).toBe(false);
    const kicks = events.filter((e) => e.midis[0] === DRUMS.kick).map((e) => e.t);
    expect(kicks).toEqual([0, 3]);
  });

  it("After Hours rides the classic swing pattern (straight grid; swing is applied later)", () => {
    const events = drumGroove("afterhours", 1);
    const rides = events.filter((e) => e.midis[0] === DRUMS.ride).map((e) => e.t);
    expect(rides).toEqual([0, 1, 1.5, 2, 3, 3.5]);
    const hats = events.filter((e) => e.midis[0] === DRUMS.hatP).map((e) => e.t);
    expect(hats).toEqual([1, 3]); // the drummer's left foot on 2 and 4
  });
});

describe("bassLine", () => {
  const RANGE_LO = 26, RANGE_HI = 55; // D1..G3 — where an upright lives

  for (const styleId of Object.keys(STYLES)) {
    it(`${styleId}: bass notes stay in register, one note at a time`, () => {
      const chords = prog("C", "Am/G", "F", "G7", "Bdim", "Dsus4", "E7/G#");
      const events = bassLine(chords, styleId);
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.ch).toBe("bass");
        expect(e.midis).toHaveLength(1);
        expect(e.midis[0]).toBeGreaterThanOrEqual(RANGE_LO);
        expect(e.midis[0]).toBeLessThanOrEqual(RANGE_HI);
        expect(e.dur).toBeGreaterThan(0);
        expect(e.v).toBeGreaterThan(0);
        expect(e.v).toBeLessThanOrEqual(1);
      }
    });

    it(`${styleId}: every bar opens on the written bass (slash-aware)`, () => {
      const chords = prog("C", "Am/G", "Fmaj7", "E7/G#");
      const events = bassLine(chords, styleId);
      const bpb = STYLES[styleId].beatsPerBar;
      chords.forEach((ch, i) => {
        const first = events.find((e) => e.t === i * bpb);
        expect(first, `${styleId}: bar ${i} has no downbeat bass note`).toBeTruthy();
        expect(pc(first.midis[0])).toBe(bassPc(ch));
      });
    });
  }

  it("boom-chick alternates root and fifth", () => {
    const events = bassLine(prog("C"), "boomchick");
    expect(events.map((e) => e.t)).toEqual([0, 2]);
    expect(pc(events[0].midis[0])).toBe(0);
    expect(pc(events[1].midis[0])).toBe(7);
  });

  it("the waltz bass is one warm note per bar", () => {
    const events = bassLine(prog("C", "F"), "waltz");
    expect(events.map((e) => e.t)).toEqual([0, 3]);
    expect(events[0].dur).toBeGreaterThanOrEqual(2.5);
  });

  describe("After Hours: the walking line", () => {
    const chords = prog("Cmaj7", "Am7", "Dm7", "G7");
    const events = bassLine(chords, "afterhours");
    const bars = chords.map((_, i) => events.filter((e) => e.t >= i * 4 && e.t < (i + 1) * 4));

    it("walks four quarter notes to the bar", () => {
      bars.forEach((bar, i) => {
        expect(bar.map((e) => e.t), `bar ${i}`).toEqual([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3]);
      });
    });

    it("lands chord tones on the strong beats (1 and 3)", () => {
      bars.forEach((bar, i) => {
        const allowed = chordPcs(chords[i]);
        expect(allowed.has(pc(bar[0].midis[0])), `bar ${i} beat 1`).toBe(true);
        expect(allowed.has(pc(bar[2].midis[0])), `bar ${i} beat 3`).toBe(true);
      });
    });

    it("beat 2 is a chord tone or a genuine passing tone (stepwise between its neighbors)", () => {
      bars.forEach((bar, i) => {
        const m = bar[1].midis[0];
        const ok = chordPcs(chords[i]).has(pc(m)) ||
          (Math.abs(m - bar[0].midis[0]) <= 2 && Math.abs(m - bar[2].midis[0]) <= 2);
        expect(ok, `bar ${i} beat 2 (midi ${m}) is neither chord tone nor passing`).toBe(true);
      });
    });

    it("beat 4 approaches the next bar's downbeat (or stays a chord tone)", () => {
      bars.forEach((bar, i) => {
        if (i === bars.length - 1) return; // the last bar resolves instead
        const m = bar[3].midis[0];
        const nextDown = bars[i + 1][0].midis[0];
        const ok = chordPcs(chords[i]).has(pc(m)) || Math.abs(m - nextDown) <= 2;
        expect(ok, `bar ${i} beat 4 (midi ${m}) neither approaches ${nextDown} nor belongs to the chord`).toBe(true);
      });
    });

    it("the last bar is all chord tones — it resolves, it doesn't dangle", () => {
      const last = bars[bars.length - 1];
      const allowed = chordPcs(chords[chords.length - 1]);
      for (const e of last) expect(allowed.has(pc(e.midis[0]))).toBe(true);
    });

    it("never leaps more than a sixth mid-line — it walks, it doesn't hop fences", () => {
      const line = events.map((e) => e.midis[0]);
      for (let i = 1; i < line.length; i++) {
        expect(Math.abs(line[i] - line[i - 1]), `leap into note ${i}`).toBeLessThanOrEqual(9);
      }
    });
  });

  it("empty progression: silence", () => {
    expect(bassLine([], "ballad")).toEqual([]);
  });

  for (const styleId of Object.keys(STYLES)) {
    it(`${styleId}: the bass is one voice — notes never overlap (mono synth live, mono stem exported)`, () => {
      const events = bassLine(prog("C", "Am/G", "F", "G7"), styleId);
      const sorted = [...events].sort((a, b) => a.t - b.t);
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i - 1].t + sorted[i - 1].dur,
          `${styleId}: note at ${sorted[i - 1].t} rings into the note at ${sorted[i].t}`
        ).toBeLessThanOrEqual(sorted[i].t + 1e-9);
      }
    });
  }
});

describe("arrangeBand — the whole rhythm section", () => {
  const chords = prog("C", "Am/G", "F", "G7");

  it("hands the low end to the bassist: piano left-hand events are dropped when bass is on", () => {
    const { tracks } = arrangeBand(chords, "ballad");
    expect(tracks.piano.length).toBeGreaterThan(0);
    expect(tracks.piano.every((e) => e.hand !== "L")).toBe(true);
    expect(tracks.bass.length).toBeGreaterThan(0);
  });

  it("keeps the piano's own left hand when the bass stays home", () => {
    const { tracks } = arrangeBand(chords, "ballad", { bass: false });
    expect(tracks.piano.some((e) => e.hand === "L")).toBe(true);
    expect(tracks.bass).toEqual([]);
  });

  it("drums can sit out too", () => {
    const { tracks, events } = arrangeBand(chords, "ballad", { drums: false });
    expect(tracks.drums).toEqual([]);
    expect(events.every((e) => e.ch !== "drums")).toBe(true);
  });

  it("tags every merged event with its part and keeps them sorted", () => {
    const { events } = arrangeBand(chords, "boomchick");
    expect(events.length).toBeGreaterThan(0);
    let last = -Infinity;
    for (const e of events) {
      expect(["piano", "bass", "drums"]).toContain(e.ch);
      expect(e.t).toBeGreaterThanOrEqual(last);
      last = e.t;
    }
  });

  it("the piano part still follows the iron rule under the band", () => {
    const tricky = prog("C", "Am/G", "F", "G7", "Bdim", "Dsus4", "E7/G#");
    for (const styleId of Object.keys(STYLES)) {
      const { tracks } = arrangeBand(tricky, styleId);
      for (const e of tracks.piano) {
        const allowed = chordPcs(tricky[e.stepIdx]);
        for (const m of e.midis) {
          expect(allowed.has(pc(m)), `${styleId}: piano midi ${m} escaped at step ${e.stepIdx}`).toBe(true);
        }
      }
    }
  });

  it("count-in: one bar of clicks up front, the band enters on the next ONE", () => {
    const { events, countInBeats, totalBeats, beatsPerBar } = arrangeBand(chords, "ballad", { count: true });
    expect(countInBeats).toBe(4);
    expect(totalBeats).toBe(4 * beatsPerBar + 4);
    const clicks = events.filter((e) => e.count);
    expect(clicks.map((e) => e.t)).toEqual([0, 1, 2, 3]);
    const band = events.filter((e) => !e.count);
    expect(Math.min(...band.map((e) => e.t))).toBeGreaterThanOrEqual(4);
  });

  it("the export tracks never include the count-in and start at zero", () => {
    const { tracks } = arrangeBand(chords, "ballad", { count: true });
    expect(Math.min(...tracks.piano.map((e) => e.t))).toBe(0);
    expect(tracks.piano.every((e) => !e.count)).toBe(true);
  });

  it("After Hours swings the whole band: off-beat eighths land at the 2/3 point", () => {
    const { events, swing } = arrangeBand(chords, "afterhours");
    expect(swing).toBe(true);
    const rideTs = events.filter((e) => e.ch === "drums" && e.midis[0] === DRUMS.ride).map((e) => e.t % 4);
    expect(rideTs.some((t) => Math.abs(t - (1 + 2 / 3)) < 1e-6)).toBe(true);
    expect(events.some((e) => e.t % 1 === 0.5)).toBe(false); // nothing straight survives
  });

  it("straight styles stay straight", () => {
    const { events, swing } = arrangeBand(chords, "boomchick");
    expect(swing).toBeFalsy();
    expect(events.some((e) => e.t % 1 === 0.5)).toBe(true); // the hat eighths
  });

  it("bass and drums carry a stepIdx so the UI can follow along", () => {
    const { tracks } = arrangeBand(chords, "afterhours");
    for (const e of [...tracks.bass, ...tracks.drums]) {
      expect(Number.isInteger(e.stepIdx)).toBe(true);
      expect(e.stepIdx).toBeGreaterThanOrEqual(0);
      expect(e.stepIdx).toBeLessThan(chords.length);
    }
  });

  it("empty progression: an empty stage", () => {
    const { events, tracks, totalBeats } = arrangeBand([], "ballad");
    expect(events).toEqual([]);
    expect(tracks.piano).toEqual([]);
    expect(tracks.bass).toEqual([]);
    expect(tracks.drums).toEqual([]);
    expect(totalBeats).toBe(0);
  });
});
