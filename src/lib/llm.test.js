import { afterEach, describe, expect, it, vi } from "vitest";
import { deepProgressionIdeas } from "./llm.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deepProgressionIdeas", () => {
  it("requests structured whole-progression ideas and drops an idea if any symbol is invalid", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ideas: [
          {
            intent: "contrast",
            kind: "newSection",
            symbols: ["Am", "Dm", "F", "E7"],
            rationale: "new center",
          },
          {
            intent: "contrast",
            kind: "newSection",
            symbols: ["Dm", "H13"],
            rationale: "invalid",
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await deepProgressionIdeas({
      progression: ["C", "G", "Am", "F"],
      key: "C major",
      intent: "contrast",
      context: { selected: "Am", target: "F", ignored: "do not send" },
    });

    expect(out).toMatchObject({
      ok: true,
      data: { ideas: [{ symbols: ["Am", "Dm", "F", "E7"] }] },
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      task: "compose",
      progression: ["C", "G", "Am", "F"],
      key: "C major",
      intent: "contrast",
      context: { selected: "Am", target: "F" },
    });
    expect(request.context).not.toHaveProperty("ignored");
  });

  it("caps response arrays and strings and never accepts model-authored evidence", async () => {
    const ideas = Array.from({ length: 10 }, (_, index) => ({
      intent: "next",
      kind: "insertAfter",
      symbols: index === 0 ? Array.from({ length: 9 }, () => "C") : [index % 2 ? "G7" : "C"],
      rationale: "r".repeat(2000),
      evidence: ["model-claim"],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ideas }),
    })));

    const out = await deepProgressionIdeas({
      progression: ["C"],
      key: "C major",
      intent: "next",
      context: {},
    });

    expect(out.ok).toBe(true);
    expect(out.data.ideas).toHaveLength(7);
    expect(out.data.ideas.every((idea) => idea.symbols.length === 1)).toBe(true);
    expect(out.data.ideas.every((idea) => idea.rationale.length <= 500)).toBe(true);
    expect(out.data.ideas.every((idea) => !("evidence" in idea))).toBe(true);
  });

  it.each([
    ["proxy rejection", async () => ({ ok: false, status: 502, json: async () => ({}) })],
    ["abort", async () => { throw new DOMException("aborted", "AbortError"); }],
    ["malformed JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } })],
    ["malformed shape", async () => ({ ok: true, json: async () => ({ ideas: "nope" }) })],
  ])("returns the stable offline error for %s", async (_label, implementation) => {
    vi.stubGlobal("fetch", vi.fn(implementation));

    const out = await deepProgressionIdeas({
      progression: ["C"],
      key: "C major",
      intent: "next",
      context: {},
    });

    expect(out).toMatchObject({
      ok: false,
      error: expect.stringMatching(/offline ideas still work/i),
    });
  });
});
