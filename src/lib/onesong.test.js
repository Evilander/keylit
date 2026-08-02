// The One Song room's brains: bench days, the streak, the finished shelf,
// and the exercise doors. All time flows in through `at`/`now` — nothing
// here reads a clock. The streak is deliberately anti-guilt: a day with no
// mark doesn't zero anything until the NEXT day has also passed.
import { describe, it, expect } from "vitest";
import {
  EXERCISES, dayKey, normalizeOneSongState, markDay, benchDays, streak,
  finishSong, removeFinished, exerciseDone, nextDoor,
} from "./onesong.js";

const DAY = 24 * 60 * 60 * 1000;
// noon local time, a Wednesday — away from midnight edges
const NOON = new Date(2026, 7, 5, 12, 0, 0).getTime();

describe("dayKey", () => {
  it("is a local calendar date, stable across a day", () => {
    expect(dayKey(NOON)).toBe("2026-08-05");
    expect(dayKey(NOON + 11 * 60 * 60 * 1000)).toBe("2026-08-05"); // 23:00 same day
    expect(dayKey(NOON + DAY)).toBe("2026-08-06");
  });
});

describe("normalizeOneSongState", () => {
  it("builds a clean empty state from junk", () => {
    for (const raw of [null, undefined, 42, "x", [], { days: "no", finished: 3, doors: [] }]) {
      const st = normalizeOneSongState(raw);
      expect(st.days).toEqual({});
      expect(st.finished).toEqual([]);
      expect(st.doors).toEqual({});
    }
  });

  it("keeps sane data and sheds junk rows", () => {
    const st = normalizeOneSongState({
      days: { "2026-08-01": ["timer"], "bad key": ["x"], "2026-08-02": "not-a-list" },
      finished: [{ title: "Coyote Time", at: NOON }, { nope: true }, null],
      doors: { "Word ladder": NOON, "Not a door": NOON },
    });
    expect(st.days).toEqual({ "2026-08-01": ["timer"] });
    expect(st.finished).toEqual([{ title: "Coyote Time", at: NOON, draftId: null }]);
    expect(st.doors).toEqual({ "Word ladder": NOON });
  });
});

describe("markDay", () => {
  it("records the first mark of a day and dedupes the reason", () => {
    let st = normalizeOneSongState(null);
    st = markDay(st, { at: NOON, what: "timer" });
    st = markDay(st, { at: NOON + 60_000, what: "timer" });
    st = markDay(st, { at: NOON + 120_000, what: "kept" });
    expect(st.days[dayKey(NOON)]).toEqual(["timer", "kept"]);
  });

  it("returns the same state when nothing changes", () => {
    let st = markDay(normalizeOneSongState(null), { at: NOON, what: "timer" });
    expect(markDay(st, { at: NOON, what: "timer" })).toBe(st);
  });

  it("caps the ledger instead of growing forever", () => {
    let st = normalizeOneSongState(null);
    for (let i = 0; i < 500; i++) st = markDay(st, { at: NOON - i * DAY, what: "timer" });
    expect(Object.keys(st.days).length).toBeLessThanOrEqual(400);
    // the most recent day survives the trim
    expect(st.days[dayKey(NOON)]).toBeTruthy();
  });
});

describe("streak", () => {
  const mark = (st, daysAgo) => markDay(st, { at: NOON - daysAgo * DAY, what: "timer" });

  it("counts consecutive days ending today", () => {
    let st = normalizeOneSongState(null);
    st = mark(st, 2); st = mark(st, 1); st = mark(st, 0);
    expect(streak(st, NOON)).toBe(3);
  });

  it("stays alive when today simply hasn't happened yet", () => {
    let st = normalizeOneSongState(null);
    st = mark(st, 3); st = mark(st, 2); st = mark(st, 1);
    expect(streak(st, NOON)).toBe(3); // yesterday ended it, today is still open
  });

  it("a real gap resets it", () => {
    let st = normalizeOneSongState(null);
    st = mark(st, 5); st = mark(st, 4); st = mark(st, 0);
    expect(streak(st, NOON)).toBe(1);
  });

  it("empty state is zero, not an error", () => {
    expect(streak(normalizeOneSongState(null), NOON)).toBe(0);
  });
});

describe("benchDays", () => {
  it("returns the last N days oldest-first with lit flags", () => {
    let st = normalizeOneSongState(null);
    st = markDay(st, { at: NOON, what: "timer" });
    st = markDay(st, { at: NOON - 2 * DAY, what: "kept" });
    const strip = benchDays(st, { now: NOON, days: 4 });
    expect(strip).toHaveLength(4);
    expect(strip.map((d) => d.wrote)).toEqual([false, true, false, true]);
    expect(strip[3].key).toBe(dayKey(NOON));
  });
});

describe("the finished shelf", () => {
  it("numbers songs in the order they were finished", () => {
    let st = normalizeOneSongState(null);
    st = finishSong(st, { title: "Coyote Time", at: NOON, draftId: "d1" });
    st = finishSong(st, { title: "Second Wind", at: NOON + DAY });
    expect(st.finished.map((f) => f.title)).toEqual(["Coyote Time", "Second Wind"]);
    expect(st.finished[0].draftId).toBe("d1");
  });

  it("finishing marks the bench day too", () => {
    const st = finishSong(normalizeOneSongState(null), { title: "X", at: NOON });
    expect(st.days[dayKey(NOON)]).toContain("finished");
  });

  it("refuses a blank title and double-finishing the same draft", () => {
    let st = normalizeOneSongState(null);
    expect(finishSong(st, { title: "   ", at: NOON })).toBe(st);
    st = finishSong(st, { title: "X", at: NOON, draftId: "d1" });
    expect(finishSong(st, { title: "X again", at: NOON, draftId: "d1" })).toBe(st);
  });

  it("removeFinished takes a song back off the shelf", () => {
    let st = normalizeOneSongState(null);
    st = finishSong(st, { title: "Keep", at: NOON });
    st = finishSong(st, { title: "Oops", at: NOON + 1 });
    st = removeFinished(st, 1);
    expect(st.finished.map((f) => f.title)).toEqual(["Keep"]);
  });
});

describe("the doors", () => {
  it("EXERCISES carries the six doors, named", () => {
    expect(EXERCISES).toHaveLength(6);
    expect(EXERCISES.map(([name]) => name)).toContain("Word ladder");
  });

  it("exerciseDone stamps the door and the day", () => {
    const st = exerciseDone(normalizeOneSongState(null), "Word ladder", NOON);
    expect(st.doors["Word ladder"]).toBe(NOON);
    expect(st.days[dayKey(NOON)]).toContain("door");
  });

  it("an unknown door changes nothing", () => {
    const st = normalizeOneSongState(null);
    expect(exerciseDone(st, "Trap door", NOON)).toBe(st);
  });

  it("nextDoor suggests the door least recently worked", () => {
    let st = normalizeOneSongState(null);
    expect(nextDoor(st)).toBe(EXERCISES[0][0]); // untouched → the first door
    for (const [name] of EXERCISES) st = exerciseDone(st, name, NOON);
    st = exerciseDone(st, EXERCISES[2][0], NOON + DAY); // re-work one door
    const suggested = nextDoor(st);
    expect(suggested).not.toBe(EXERCISES[2][0]);
    expect(suggested).toBe(EXERCISES[0][0]); // oldest stamp wins, first-listed breaks ties
  });
});
