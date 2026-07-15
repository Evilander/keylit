import { describe, it, expect } from "vitest";
import { METERS, meterById, clickPattern, secondsPerPulse, tapTempo, tempoName } from "./click.js";

describe("clickPattern — the metronome's bar", () => {
  it("4/4 plain: accent then three beats, one pulse each", () => {
    const { steps, totalPulses, pulsesPerBeat } = clickPattern("4/4");
    expect(steps.map((s) => s.kind)).toEqual(["accent", "beat", "beat", "beat"]);
    expect(steps.map((s) => s.t)).toEqual([0, 1, 2, 3]);
    expect(totalPulses).toBe(4);
    expect(pulsesPerBeat).toBe(1);
  });

  it("4/4 with 8th subdivision: subs land exactly between beats", () => {
    const { steps } = clickPattern("4/4", 2);
    expect(steps).toHaveLength(8);
    expect(steps[0]).toEqual({ t: 0, kind: "accent" });
    expect(steps[1]).toEqual({ t: 0.5, kind: "sub" });
    expect(steps[2]).toEqual({ t: 1, kind: "beat" });
    // every off-tick is a sub, every on-tick keeps its identity
    for (const s of steps) {
      if (Number.isInteger(s.t)) expect(s.kind === "accent" || s.kind === "beat").toBe(true);
      else expect(s.kind).toBe("sub");
    }
  });

  it("4/4 triplet subdivision: three ticks per beat, twelve per bar", () => {
    const { steps } = clickPattern("4/4", 3);
    expect(steps).toHaveLength(12);
    expect(steps.filter((s) => s.kind === "sub")).toHaveLength(8);
  });

  it("6/8: the ONE accents, the four lifts, inner 8ths tick as subs", () => {
    const { steps, pulsesPerBeat } = clickPattern("6/8");
    expect(pulsesPerBeat).toBe(3); // bpm names the dotted quarter
    expect(steps.map((s) => s.kind)).toEqual(["accent", "sub", "sub", "beat", "sub", "sub"]);
  });

  it("5/4 (3+2): accents at 0 and 3 — the limp is the point", () => {
    const { steps } = clickPattern("5/4");
    expect(steps.map((s) => s.kind)).toEqual(["accent", "beat", "beat", "accent", "beat"]);
  });

  it("7/8 (2+2+3): group starts are the felt beats", () => {
    const { steps } = clickPattern("7/8");
    expect(steps.map((s) => s.kind)).toEqual(["accent", "sub", "beat", "sub", "beat", "sub", "sub"]);
  });

  it("subdivision is ignored where the meter already owns its pulses", () => {
    expect(clickPattern("6/8", 4).steps).toEqual(clickPattern("6/8").steps);
  });

  it("every meter's groups sum to its bar", () => {
    for (const m of METERS) {
      expect(m.groups.reduce((a, b) => a + b, 0), m.id).toBe(m.pulsesPerBar);
    }
    expect(meterById("nope").id).toBe("4/4"); // unknown falls back, never throws
  });
});

describe("secondsPerPulse", () => {
  it("quarters at 120 are half a second", () => {
    expect(secondsPerPulse("4/4", 120)).toBeCloseTo(0.5);
  });
  it("6/8 at 60 (dotted quarters) ticks 8ths at a third of a second", () => {
    expect(secondsPerPulse("6/8", 60)).toBeCloseTo(1 / 3);
  });
});

describe("tapTempo", () => {
  it("reads a steady 120 from 500ms taps", () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
  });
  it("uses the median so one hiccup doesn't drag the tempo", () => {
    expect(tapTempo([0, 500, 1000, 1650, 2150, 2650])).toBe(120);
  });
  it("a long silence resets the count", () => {
    // old fast taps, 3s hole, then two slow taps → reads the slow tempo
    expect(tapTempo([0, 250, 500, 3500, 4500])).toBe(60);
  });
  it("needs at least two taps after a reset", () => {
    expect(tapTempo([0])).toBeNull();
    expect(tapTempo([0, 5000])).toBeNull();
  });
  it("clamps to the dial", () => {
    expect(tapTempo([0, 100, 200])).toBe(260);
    expect(tapTempo([0, 1990, 3980])).toBe(30);
  });
});

describe("tempoName", () => {
  it("names the classic bands", () => {
    expect(tempoName(40)).toBe("Grave");
    expect(tempoName(60)).toBe("Largo");
    expect(tempoName(72)).toBe("Adagio");
    expect(tempoName(92)).toBe("Andante");
    expect(tempoName(116)).toBe("Moderato");
    expect(tempoName(140)).toBe("Allegro");
    expect(tempoName(168)).toBe("Vivace");
    expect(tempoName(190)).toBe("Presto");
    expect(tempoName(220)).toBe("Prestissimo");
  });
});
