import { describe, it, expect } from "vitest";
import { parseTab } from "./tab.js";
import { stepUnit, tabEvents, tabBlocks } from "./tabplay.js";

// A riff with DELIBERATE spacing: the 7 is held twice as long as the rest —
// its gap to the next note is two units wide. Spacing is the only rhythm an
// ASCII tab carries, and it must survive into the schedule.
const SPACED = [
  "e|----------------|",
  "B|----------------|",
  "G|--7-----9--7----|",
  "D|----------------|",
  "A|----------------|",
  "E|----------------|",
].join("\n");

const EVEN = [
  "e|-0--1--3--1--|",
  "B|-------------|",
  "G|-------------|",
  "D|-------------|",
  "A|-------------|",
  "E|-------------|",
].join("\n");

describe("stepUnit — the tab's own pulse", () => {
  it("finds the mode gap as the unit", () => {
    const b = parseTab(EVEN).blocks[0];
    expect(stepUnit(b.events)).toBe(3); // -0--1--3--1: columns 3 apart
  });
  it("one wide hold doesn't fool it", () => {
    const b = parseTab(SPACED).blocks[0];
    expect(stepUnit(b.events)).toBe(3); // unit from the tight pairs, not the hold
  });
  it("degenerate inputs fall back to 1", () => {
    expect(stepUnit([])).toBe(1);
    expect(stepUnit([{ col: 0, notes: [] }])).toBe(1);
  });
});

describe("tabEvents — spacing becomes time", () => {
  it("even spacing → even beats, legato durations", () => {
    const b = parseTab(EVEN).blocks[0];
    const { events, totalBeats } = tabEvents(b.events, { stepsPerBeat: 2 });
    expect(events.map((e) => e.t)).toEqual([0, 0.5, 1, 1.5]);
    expect(events.every((e) => e.dur === 0.5)).toBe(true);
    expect(totalBeats).toBe(2);
  });

  it("a double-width gap holds the note twice as long", () => {
    const b = parseTab(SPACED).blocks[0];
    const { events } = tabEvents(b.events, { stepsPerBeat: 2 });
    // 7 (held), 9, 7 — the held note's duration doubles the others'
    expect(events).toHaveLength(3);
    expect(events[0].dur).toBe(events[1].dur * 2);
  });

  it("carries pitches, applies shift, keeps event order", () => {
    const b = parseTab(EVEN).blocks[0];
    const { events } = tabEvents(b.events, { shift: 2 });
    // e string: 64+0, +1, +3, +1 → shifted +2
    expect(events.map((e) => e.midis[0])).toEqual([66, 67, 69, 67]);
    for (let i = 1; i < events.length; i++) expect(events[i].t).toBeGreaterThan(events[i - 1].t);
  });

  it("caps absurd gaps so a formatting hole can't freeze the playback", () => {
    const wide = [
      "e|-0-------------------------------3--|",
      "B|-------------------------------------|",
      "G|-------------------------------------|",
      "D|-------------------------------------|",
      "A|-------------------------------------|",
      "E|-------------------------------------|",
    ].join("\n");
    const b = parseTab(wide).blocks[0];
    const { events } = tabEvents(b.events, { stepsPerBeat: 2 });
    expect(events[0].dur).toBeLessThanOrEqual(4); // maxHold default
  });

  it("empty input is an empty schedule, never a crash", () => {
    expect(tabEvents([])).toEqual({ events: [], totalBeats: 0 });
  });
});

describe("tabBlocks — a whole document, block by block", () => {
  it("labels every playable block and skips event-less ones", () => {
    const doc = `[Intro]\n${EVEN}\nwords in the middle\n[Solo]\n${SPACED}`;
    const parsed = parseTab(doc);
    const blocks = tabBlocks(parsed);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].count).toBe(4);
    expect(blocks[1].count).toBe(3);
    expect(blocks[0].totalBeats).toBeGreaterThan(0);
    expect(blocks.every((b) => b.events.length === b.count)).toBe(true);
  });
});
