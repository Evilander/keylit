import { describe, it, expect } from "vitest";
import { QUOTES, pickQuote, shuffledQuotes } from "./quotes.js";

describe("QUOTES — the borrowed lines", () => {
  it("is a real bank: 40+ lines, every one attributed", () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(40);
    for (const { q, by } of QUOTES) {
      expect(q.trim().length).toBeGreaterThan(8);
      // heroes render length-adaptively, but past ~260 chars nothing reads as a line
      expect(q.length).toBeLessThanOrEqual(260);
      expect(by).toContain(" · "); // writer · source — never a bare name
    }
  });

  it("never repeats a line", () => {
    const seen = new Set(QUOTES.map((x) => x.q));
    expect(seen.size).toBe(QUOTES.length);
  });

  it("keeps the poster clichés out", () => {
    for (const { q } of QUOTES) {
      const low = q.toLowerCase();
      expect(low).not.toContain("costume");
      // the two most-quoted Lennon lines were evicted on purpose (2026-07-15)
      expect(low).not.toContain("life is what happens");
      expect(low).not.toContain("all you need is love");
    }
  });

  it("pickQuote is deterministic under a supplied rand", () => {
    expect(pickQuote(() => 0)).toBe(QUOTES[0]);
    expect(pickQuote(() => 0.999)).toBe(QUOTES[QUOTES.length - 1]);
  });

  it("shuffledQuotes deals the whole deck without mutating it", () => {
    const before = QUOTES.slice();
    const deck = shuffledQuotes(() => 0.42);
    expect(deck).toHaveLength(QUOTES.length);
    expect(new Set(deck.map((x) => x.q)).size).toBe(QUOTES.length);
    expect(QUOTES).toEqual(before);
    expect(shuffledQuotes(() => 0.42)).toEqual(deck);
  });
});
