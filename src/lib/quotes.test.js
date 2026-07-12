import { describe, it, expect } from "vitest";
import { QUOTES, pickQuote } from "./quotes.js";

describe("QUOTES — the borrowed hero lines", () => {
  it("all six writers are on the shelf, two lines each", () => {
    const WRITERS = ["Bill Callahan", "David Berman", "Jeff Tweedy", "John Lennon", "Isaac Brock", "Bonnie “Prince” Billy"];
    for (const w of WRITERS) {
      expect(QUOTES.filter((x) => x.by.startsWith(w)).length, w).toBe(2);
    }
    expect(QUOTES.length).toBe(12);
  });

  it("every line is attributed and headline-sized", () => {
    for (const { q, by } of QUOTES) {
      expect(q.trim().length).toBeGreaterThan(10);
      expect(q.length).toBeLessThanOrEqual(90); // a 58px hero can't take a paragraph
      expect(by).toMatch(/·/);
    }
  });

  it("no marketing taglines snuck in", () => {
    for (const { q } of QUOTES) expect(q.toLowerCase()).not.toContain("costume");
  });

  it("pickQuote is deterministic under a supplied rand", () => {
    expect(pickQuote(() => 0)).toBe(QUOTES[0]);
    expect(pickQuote(() => 0.999)).toBe(QUOTES[QUOTES.length - 1]);
  });
});
