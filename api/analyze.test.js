// The proxy spends real API budget — the door policy is worth pinning.
import { describe, it, expect } from "vitest";
import { originAllowed, createRateLimiter } from "./analyze.js";

describe("originAllowed", () => {
  const list = ["https://tylereveland.com", "http://localhost:5173"];

  it("admits listed origins and refuses strangers", () => {
    expect(originAllowed("https://tylereveland.com", list)).toBe(true);
    expect(originAllowed("http://localhost:5173", list)).toBe(true);
    expect(originAllowed("https://evil.example", list)).toBe(false);
    expect(originAllowed(undefined, list)).toBe(false);
  });

  it('"*" deliberately opens the door', () => {
    expect(originAllowed("https://anywhere.example", ["*"])).toBe(true);
  });
});

describe("createRateLimiter", () => {
  it("admits up to the limit inside the window, then refuses", () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t = 1_000_000;
    expect(allow("1.2.3.4", t)).toBe(true);
    expect(allow("1.2.3.4", t + 1)).toBe(true);
    expect(allow("1.2.3.4", t + 2)).toBe(true);
    expect(allow("1.2.3.4", t + 3)).toBe(false);
  });

  it("counts each caller separately", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const t = 1_000_000;
    expect(allow("1.1.1.1", t)).toBe(true);
    expect(allow("2.2.2.2", t)).toBe(true);
    expect(allow("1.1.1.1", t + 1)).toBe(false);
  });

  it("the window slides — old hits stop counting", () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1_000 });
    const t = 1_000_000;
    expect(allow("ip", t)).toBe(true);
    expect(allow("ip", t + 10)).toBe(true);
    expect(allow("ip", t + 20)).toBe(false);
    expect(allow("ip", t + 1_500)).toBe(true); // both earlier hits aged out
  });
});
