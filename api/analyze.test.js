// The proxy spends real API budget — the door policy is worth pinning.
import { Readable } from "node:stream";
import { ServerResponse } from "node:http";
import { afterEach, describe, it, expect, vi } from "vitest";
import handler, { originAllowed, createRateLimiter, clientIp } from "./analyze.js";

afterEach(() => vi.unstubAllEnvs());

it("handles a wildcard client with no Origin using real HTTP header validation", async () => {
  vi.stubEnv("KEYLIT_ALLOW_ORIGIN", "*");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const req = Readable.from([]);
  req.method = "POST";
  req.headers = {};
  req.socket = { remoteAddress: "fixture-wildcard" };
  const res = new ServerResponse(req);
  await expect(handler(req, res)).resolves.toBe(res);
  expect(res.statusCode).toBe(500);
  expect(res.getHeader("Access-Control-Allow-Origin")).toBe("*");
});

it("rejects non-object JSON before invoking the model", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-key");
  for (const body of [null, [], "text", 1]) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = "POST";
    req.headers = { origin: "http://localhost:5173" };
    req.socket = { remoteAddress: "fixture-json" };
    const res = { setHeader: vi.fn(), end: vi.fn() };
    await expect(handler(req, res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(400);
  }
});

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

describe("clientIp", () => {
  const req = (headers) => ({ headers, socket: { remoteAddress: "10.0.0.9" } });

  it("prefers the header the platform sets over the one the caller sends", () => {
    expect(clientIp(req({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4, 203.0.113.7",
    }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
  });

  // Rotating a spoofed first hop used to hand the caller a fresh rate-limit
  // bucket on every request. The nearest trusted hop is the LAST entry.
  it("reads the last x-forwarded-for hop, not the caller's first one", () => {
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-forwarded-for": "spoofed, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("does not let a rotating first hop mint new buckets", () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 60_000 });
    for (const spoof of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      allow(clientIp(req({ "x-forwarded-for": `${spoof}, 203.0.113.7` })));
    }
    expect(allow(clientIp(req({ "x-forwarded-for": "4.4.4.4, 203.0.113.7" })))).toBe(false);
  });

  it("falls back to the socket when no proxy header is present", () => {
    expect(clientIp(req({}))).toBe("10.0.0.9");
  });
});
