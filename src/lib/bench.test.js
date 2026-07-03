import { describe, it, expect } from "vitest";
import { slugSongKey, practiceStats, coldSongs } from "./bench.js";

const DAY = 24 * 60 * 60 * 1000;

describe("slugSongKey", () => {
  it("normalizes artist + title into one stable key", () => {
    expect(slugSongKey("Buck Meek", "Candle")).toBe("buck-meek-candle");
    expect(slugSongKey("Neil Young", "Tell Me Why")).toBe("neil-young-tell-me-why");
    expect(slugSongKey("", "Untitled  Chart!")).toBe("untitled-chart");
  });
  it("never returns empty", () => {
    expect(slugSongKey("", "")).toBe("untitled-chart");
  });
});

describe("practiceStats", () => {
  it("aggregates count, last time and accuracies per song", () => {
    const log = [
      { songKey: "a", title: "A", at: 100, kind: "playalong", accuracy: 0.5 },
      { songKey: "a", title: "A", at: 300, kind: "playalong", accuracy: 0.9 },
      { songKey: "b", title: "B", at: 200, kind: "ran-it" },
    ];
    const stats = practiceStats(log);
    expect(stats.get("a")).toMatchObject({ count: 2, lastAt: 300, lastAccuracy: 0.9, bestAccuracy: 0.9 });
    expect(stats.get("b")).toMatchObject({ count: 1, lastAt: 200, lastAccuracy: null });
  });
});

describe("coldSongs — staleness × (how rough it was)", () => {
  const now = 100 * DAY;
  it("ranks old + rough above fresh + clean", () => {
    const log = [
      { songKey: "fresh-clean", title: "Fresh", at: now - 1 * DAY, kind: "playalong", accuracy: 0.95 },
      { songKey: "old-rough", title: "Old", at: now - 30 * DAY, kind: "playalong", accuracy: 0.4 },
      { songKey: "old-clean", title: "OldClean", at: now - 30 * DAY, kind: "playalong", accuracy: 1.0 },
    ];
    const ranked = coldSongs(log, now);
    expect(ranked[0].songKey).toBe("old-rough");
    expect(ranked[ranked.length - 1].songKey).toBe("fresh-clean");
    // even a perfect song grows cold — staleness keeps a positive floor
    expect(ranked.find((r) => r.songKey === "old-clean").score).toBeGreaterThan(0);
  });
  it("treats accuracy-less runs as middling, reports days since", () => {
    const log = [{ songKey: "x", title: "X", at: now - 10 * DAY, kind: "ran-it" }];
    const [r] = coldSongs(log, now);
    expect(r.daysSince).toBe(10);
    expect(r.lastAccuracy).toBe(null);
    expect(r.score).toBeCloseTo(10 * (1.25 - 0.6), 5);
  });
  it("honors the limit and keeps display fields", () => {
    const log = Array.from({ length: 8 }, (_, i) => ({ songKey: `s${i}`, title: `S${i}`, artist: "Art", at: now - (i + 1) * DAY, kind: "ran-it" }));
    const ranked = coldSongs(log, now, { limit: 3 });
    expect(ranked).toHaveLength(3);
    expect(ranked[0]).toMatchObject({ songKey: "s7", title: "S7", artist: "Art" });
  });
});
