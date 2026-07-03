import { describe, it, expect } from "vitest";
import { matchStep, createRun, summarize, buildChordSteps, buildTabSteps } from "./playalong.js";

const CEG = [48, 52, 55];

describe("matchStep — exact (octaveStrict)", () => {
  it("matches when held equals target", () => {
    const r = matchStep([48, 52, 55], CEG);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.wrong).toEqual([]);
  });
  it("lists missing notes while building the chord", () => {
    const r = matchStep([48, 52], CEG);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([55]);
    expect(r.wrong).toEqual([]);
  });
  it("an octave transposition is WRONG when strict", () => {
    const r = matchStep([60, 64, 67], CEG);
    expect(r.ok).toBe(false);
    expect(r.wrong).toEqual([60, 64, 67]);
  });
  it("a stray note blocks ok and is reported wrong", () => {
    const r = matchStep([48, 52, 55, 56], CEG);
    expect(r.ok).toBe(false);
    expect(r.wrong).toEqual([56]);
  });
  it("allowExtra forgives extra notes but still requires the target", () => {
    expect(matchStep([48, 52, 55, 60], CEG, { allowExtra: true }).ok).toBe(true);
    expect(matchStep([48, 52, 60], CEG, { allowExtra: true }).ok).toBe(false);
  });
});

describe("matchStep — any octave (octaveStrict: false)", () => {
  it("accepts the chord played in another octave", () => {
    const r = matchStep([60, 64, 67], CEG, { octaveStrict: false });
    expect(r.ok).toBe(true);
  });
  it("covers doubled pitch classes with a single key", () => {
    // target voicing doubles the root (C2 + C3): one C held suffices per pc
    const r = matchStep([60, 64, 67], [36, 48, 52, 55], { octaveStrict: false });
    expect(r.ok).toBe(true);
  });
  it("flags out-of-chord pitch classes as wrong", () => {
    const r = matchStep([60, 64, 66], CEG, { octaveStrict: false });
    expect(r.ok).toBe(false);
    expect(r.wrong).toEqual([66]);
  });
});

describe("createRun — the wait-mode walker", () => {
  const steps = [
    { notes: [48, 52, 55], label: "C", section: "Verse" },
    { notes: [53, 57, 60], label: "F", section: "Verse" },
    { notes: [55, 59, 62], label: "G", section: "Chorus" },
  ];

  it("advances on an attack that satisfies the step", () => {
    const run = createRun(steps);
    expect(run.i).toBe(0);
    let r = run.observe([48, 52], { attack: true });
    expect(r.advanced).toBe(false);
    r = run.observe([48, 52, 55], { attack: true });
    expect(r.advanced).toBe(true);
    expect(run.i).toBe(1);
  });

  it("never advances on a release, even if the target is somehow held", () => {
    const run = createRun(steps);
    const r = run.observe([48, 52, 55], { attack: false });
    expect(r.advanced).toBe(false);
    expect(run.i).toBe(0);
  });

  it("a wrong note taints the step; the taint clears on advance", () => {
    const run = createRun(steps);
    run.observe([49], { attack: true });                 // wrong
    run.observe([], { attack: false });
    run.observe([48, 52, 55], { attack: true });         // completes, but dirty
    run.observe([53, 57, 60], { attack: true });         // step 2 clean
    expect(run.results[0].clean).toBe(false);
    expect(run.results[1].clean).toBe(true);
  });

  it("identical consecutive chords require a re-strike", () => {
    const twice = [{ notes: CEG }, { notes: CEG }];
    const run = createRun(twice);
    run.observe(CEG, { attack: true });
    expect(run.i).toBe(1);
    // still holding — a release must NOT complete the repeat
    let r = run.observe([48, 52], { attack: false });
    expect(r.advanced).toBe(false);
    r = run.observe(CEG, { attack: true });
    expect(r.advanced).toBe(true);
    expect(run.done).toBe(true);
  });

  it("skips empty steps and reports done after the last", () => {
    const run = createRun([{ notes: [] }, { notes: [60] }]);
    expect(run.steps.length).toBe(1);
    const r = run.observe([60], { attack: true });
    expect(r.done).toBe(true);
    expect(run.done).toBe(true);
  });

  it("octave-tolerant mode passes through to matching", () => {
    const run = createRun(steps, { octaveStrict: false });
    const r = run.observe([60, 64, 67], { attack: true });
    expect(r.advanced).toBe(true);
  });

  it("skip advances with a not-clean result", () => {
    const run = createRun(steps);
    const r = run.skip();
    expect(r.advanced).toBe(true);
    expect(run.i).toBe(1);
    expect(run.results[0].clean).toBe(false);
    run.skip(); run.skip();
    expect(run.done).toBe(true);
  });

  it("reset rewinds everything", () => {
    const run = createRun(steps);
    run.observe([48, 52, 55], { attack: true });
    run.reset();
    expect(run.i).toBe(0);
    expect(run.results).toEqual([]);
    expect(run.done).toBe(false);
  });
});

describe("summarize", () => {
  it("rolls accuracy up overall and per section", () => {
    const run = createRun([
      { notes: [60], section: "Verse" },
      { notes: [62], section: "Verse" },
      { notes: [64], section: "Chorus" },
    ]);
    run.observe([61], { attack: true });          // taint verse step 1
    run.observe([60], { attack: true });
    run.observe([62], { attack: true });
    run.observe([64], { attack: true });
    const s = summarize(run);
    expect(s.total).toBe(3);
    expect(s.clean).toBe(2);
    expect(s.accuracy).toBeCloseTo(2 / 3);
    expect(s.bySection).toEqual([
      { section: "Verse", total: 2, clean: 1 },
      { section: "Chorus", total: 1, clean: 1 },
    ]);
  });
});

describe("step builders", () => {
  it("buildChordSteps zips progression + voicings, skipping empties", () => {
    const prog = [{ section: "Verse" }, { section: "Verse" }];
    const voicings = [[48, 52, 55], []];
    const steps = buildChordSteps(prog, voicings, (ch, i) => `chord${i}`);
    expect(steps).toEqual([{ notes: [48, 52, 55], label: "chord0", section: "Verse" }]);
  });
  it("buildTabSteps flattens fingering events into note steps", () => {
    const events = [
      { notes: [{ midi: 40, hand: "L", finger: 5 }, { midi: 52, hand: "R", finger: 1 }] },
      { notes: [] },
    ];
    const steps = buildTabSteps(events);
    expect(steps).toEqual([{ notes: [40, 52], label: null, section: null }]);
  });
});
