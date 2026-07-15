import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildContext, PROVIDERS } from "./tutor.js";

describe("the tutor's system prompt", () => {
  const sys = buildSystemPrompt();
  it("carries the load-bearing teaching rules", () => {
    expect(sys).toContain("Am shape at capo 2 sounds as Bm"); // shape-first arithmetic
    expect(sys).toContain("SHARPS");                            // the dialect
    expect(sys).toContain("2–6 sentences");                     // brevity contract
    expect(sys).toContain("NEVER invent a song");               // honesty rule
    expect(sys).toContain("CONTEXT");                           // packet awareness
    expect(sys).toContain("Kinsella");                          // knows the shelf
  });
  it("bans the AI tells", () => {
    expect(sys).toContain('Never say "as an AI."');
    expect(sys).toContain("Never pad.");
  });
});

describe("buildContext — the stand, described", () => {
  it("describes a capo'd song compactly", () => {
    const ctx = buildContext({
      title: "Jim Cain", artist: "Bill Callahan",
      keyName: "D major", soundingKeyName: "F major", capo: 3,
      spelling: "sharps",
      progression: ["D", "Gmaj7", "A", "Bm"],
      currentSymbol: "Gmaj7", room: "Song",
    });
    expect(ctx).toContain("CONTEXT");
    expect(ctx).toContain("Jim Cain — Bill Callahan");
    expect(ctx).toContain("Written key: D major · sounds in F major");
    expect(ctx).toContain("Capo: 3");
    expect(ctx).toContain("Progression: D Gmaj7 A Bm");
    expect(ctx).toContain("Current chord: Gmaj7");
  });
  it("an empty stand says nothing at all", () => {
    expect(buildContext({})).toBe("");
    expect(buildContext()).toBe("");
  });
  it("long progressions truncate with an ellipsis", () => {
    const ctx = buildContext({ progression: Array.from({ length: 50 }, () => "C") });
    expect(ctx).toContain("…");
    expect(ctx.split("C").length - 1).toBeLessThanOrEqual(33);
  });
  it("standard tuning stays unmentioned", () => {
    expect(buildContext({ tuning: "standard", capo: 2 })).not.toContain("Tuning");
  });
});

describe("provider request shaping (pure)", () => {
  const args = { apiKey: "k", model: "m", system: "SYS", messages: [{ role: "user", content: "hi" }] };

  it("anthropic: system field, browser opt-in header, stream on", () => {
    const r = PROVIDERS.anthropic.request(args);
    expect(r.url).toContain("api.anthropic.com/v1/messages");
    expect(r.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(r.body.system).toBe("SYS");
    expect(r.body.stream).toBe(true);
    expect(r.body.messages).toEqual(args.messages);
  });

  it("openai/xai: system rides as the first message", () => {
    for (const id of ["openai", "xai"]) {
      const r = PROVIDERS[id].request(args);
      expect(r.body.messages[0]).toEqual({ role: "system", content: "SYS" });
      expect(r.headers.authorization).toBe("Bearer k");
    }
  });

  it("google: assistant maps to model, system rides as systemInstruction", () => {
    const r = PROVIDERS.google.request({ ...args, messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] });
    expect(r.url).toContain(":streamGenerateContent");
    expect(r.body.systemInstruction.parts[0].text).toBe("SYS");
    expect(r.body.contents[1].role).toBe("model");
  });

  it("ollama: keyless, local url, custom base respected", () => {
    expect(PROVIDERS.ollama.keyless).toBe(true);
    const r = PROVIDERS.ollama.request({ ...args, baseUrl: "http://box:11434/" });
    expect(r.url).toBe("http://box:11434/api/chat");
  });
});

describe("stream line parsing", () => {
  it("anthropic content_block_delta", () => {
    const line = 'data: {"type":"content_block_delta","delta":{"text":"he"}}';
    expect(PROVIDERS.anthropic.parseLine(line)).toBe("he");
    expect(PROVIDERS.anthropic.parseLine("event: ping")).toBeNull();
    expect(PROVIDERS.anthropic.parseLine("data: [DONE]")).toBeNull();
  });
  it("openai delta content and [DONE]", () => {
    const line = 'data: {"choices":[{"delta":{"content":"yo"}}]}';
    expect(PROVIDERS.openai.parseLine(line)).toBe("yo");
    expect(PROVIDERS.openai.parseLine("data: [DONE]")).toBeNull();
  });
  it("google sse candidates", () => {
    const line = 'data: {"candidates":[{"content":{"parts":[{"text":"sup"}]}}]}';
    expect(PROVIDERS.google.parseLine(line)).toBe("sup");
  });
  it("ollama ndjson until done", () => {
    expect(PROVIDERS.ollama.parseLine('{"message":{"content":"hey"},"done":false}')).toBe("hey");
    expect(PROVIDERS.ollama.parseLine('{"done":true}')).toBeNull();
    expect(PROVIDERS.ollama.parseLine("garbage")).toBeNull();
  });
});
