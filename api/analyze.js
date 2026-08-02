// api/analyze.js — Keylit AI proxy (Vercel-style Node serverless function).
//
// Holds the Anthropic API key server-side and exposes three tasks:
//   task: "analyze" — harmony read of a chord sheet (back-compat with v0.2 UI)
//   task: "reharm"  — context-aware "interesting chord moves" for a progression
//   task: "compose" — whole-progression ideas, verified by offline client theory
//
// Deploy on Vercel (drop this file under /api), Cloudflare (adapt the handler),
// or run locally with `node server.mjs` (see that file). Set ANTHROPIC_API_KEY.
//
// The client (src/lib/llm.js) re-validates every returned chord symbol through
// the pure parser before applying it, so a hallucinated symbol is dropped, never
// rendered. This proxy is best-effort; the app degrades gracefully without it.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.KEYLIT_MODEL || "claude-opus-4-8";

// Chord vocabulary Keylit's parser understands. Keep in sync with theory.js
// QUALITIES so the model only ever emits symbols the app can render.
const QUALITY_VOCAB = [
  "", "m", "maj7", "m7", "7", "6", "m6", "9", "maj9", "m9", "11", "m11",
  "13", "maj13", "m13", "add9", "madd9", "sus2", "sus4", "7sus4",
  "dim", "dim7", "m7b5", "aug", "6/9", "7b9", "7#9", "7#11",
];

const ANALYZE_SYSTEM = `You are a meticulous music theorist helping a guitarist read a chord chart on piano.
Return a tight, correct harmonic analysis. Be specific and never invent chords that aren't implied by the chart.
Identify the key, summarize the harmonic motion in 1-2 sentences, give 2-4 concrete piano tips, and flag any chords that are tricky to voice on piano with one-line advice each.`;

const REHARM_SYSTEM = `You are an expert reharmonization assistant for a guitarist learning piano.
Given a chord progression and its key, propose a SMALL number of tasteful, musically-correct moves that make the progression more interesting WITHOUT destroying its identity.

Hard rules:
- Every chord symbol you output MUST use this exact vocabulary for the quality part: ${QUALITY_VOCAB.map((q) => `"${q || "(major triad)"}"`).join(", ")}. Root names use sharps (C, C#, D, ... B). Slash chords as "ROOT/BASS" (e.g. "E/G#").
- Do NOT invent chords outside that vocabulary. If you want a sound you can't spell with it, pick the closest spelling that exists.
- Prefer moves that are well-known and idiomatic: secondary dominants, ii-V insertions, tritone substitution (on dominants), modal interchange (borrowed iv, bVI, bVII), passing diminished, line clichés, relative-minor substitution.
- Tie each suggestion to the actual chords by index. "replace" swaps one chord; "insertBefore"/"insertAfter" add chord(s) around the indexed chord.
- Keep it to 4-7 suggestions, ranked best-first. Explain WHY each works in one plain sentence a beginner understands.
- "boldness" is 0 (very safe) to 1 (adventurous). "function" is one of T, S, D, or "color".`;

const COMPOSE_SYSTEM = `You are a songwriting idea generator. Propose concise chord-sequence ideas for the requested intent while preserving the supplied song context.

Hard rules:
- Return proposals only. Never claim, label, or assign music-theory evidence; Keylit verifies every idea independently with its offline theory engine.
- Every chord symbol MUST use this exact vocabulary for the quality part: ${QUALITY_VOCAB.map((q) => `"${q || "(major triad)"}"`).join(", ")}. Root names use sharps (C, C#, D, ... B). Slash chords use "ROOT/BASS".
- Use the requested intent on every idea. Use insertAfter for next and turnaround, insertBefore for lead-in and between, and newSection for contrast.
- Suggest at most 8 ideas, with at most 8 chord symbols per idea. The rationale is optional creative context, not verified analysis.`;

const REHARM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggestions"],
  properties: {
    summary: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["targetIndex", "action", "chords", "rationale", "boldness", "function"],
        properties: {
          targetIndex: { type: "integer" },
          action: { type: "string", enum: ["replace", "insertBefore", "insertAfter"] },
          chords: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
          boldness: { type: "number" },
          function: { type: "string", enum: ["T", "S", "D", "color"] },
        },
      },
    },
  },
};

const ANALYZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["key", "confidence", "summary", "tips", "tricky"],
  properties: {
    key: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
    tricky: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chord", "advice"],
        properties: { chord: { type: "string" }, advice: { type: "string" } },
      },
    },
  },
};

const COMPOSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["intent", "kind", "symbols", "rationale"],
        properties: {
          intent: {
            type: "string",
            enum: ["next", "lead-in", "between", "turnaround", "contrast"],
          },
          kind: {
            type: "string",
            enum: ["insertBefore", "insertAfter", "replace", "newSection"],
          },
          symbols: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", maxLength: 64 },
          },
          rationale: { type: "string", maxLength: 500 },
        },
      },
    },
  },
};

const COMPOSE_INTENTS = new Set(["next", "lead-in", "between", "turnaround", "contrast"]);

function cappedStrings(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, 64))
    .filter(Boolean);
}

function composeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const key of ["selected", "previous", "next", "target", "opening", "closing"]) {
    if (typeof value[key] === "string" && value[key].trim()) {
      out[key] = value[key].trim().slice(0, 64);
    }
  }
  for (const key of ["before", "after", "section", "chords"]) {
    const symbols = cappedStrings(value[key], 8);
    if (symbols.length) out[key] = symbols;
  }
  return out;
}

const MAX_BODY_BYTES = 64 * 1024; // the biggest legal payload is a 12KB sheet

function readBody(req) {
  if (req.body) return Promise.resolve(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY_BYTES) { reject(Object.assign(new Error("too large"), { tooLarge: true })); req.destroy(); }
    });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// The proxy spends the owner's API budget, so it answers only its own UI.
// KEYLIT_ALLOW_ORIGIN: comma-separated origins, or "*" to deliberately open up.
const DEFAULT_ORIGINS = [
  "https://tylereveland.com", "https://www.tylereveland.com",
  "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173",
];

export function allowedOrigins() {
  const env = (process.env.KEYLIT_ALLOW_ORIGIN || "").trim();
  if (!env) return DEFAULT_ORIGINS;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export function originAllowed(origin, list = allowedOrigins()) {
  if (list.includes("*")) return true;
  return typeof origin === "string" && list.includes(origin);
}

/** Sliding-window per-IP limiter. In-memory: each serverless instance counts
 *  alone, which still stops the only abuse a browser or a loop can mount. */
export function createRateLimiter({ limit = 20, windowMs = 60_000, maxIps = 2000 } = {}) {
  const hits = new Map(); // ip -> [timestamps]
  return function allow(ip, now = Date.now()) {
    if (hits.size > maxIps) {
      for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    }
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= limit) { hits.set(ip, list); return false; }
    list.push(now);
    hits.set(ip, list);
    return true;
  };
}

const rateAllow = createRateLimiter();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  // CORS: reflect the origin only when it's on the list; everyone else gets
  // no ACAO header and the browser refuses them the response.
  const origin = req.headers.origin;
  if (originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "POST only" })); }
  if (origin && !originAllowed(origin)) {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: "origin not allowed" }));
  }
  if (!rateAllow(clientIp(req))) {
    res.statusCode = 429;
    res.setHeader("Retry-After", "60");
    return res.end(JSON.stringify({ error: "slow down — try again in a minute" }));
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Server missing ANTHROPIC_API_KEY" }));
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    res.statusCode = e?.tooLarge ? 413 : 400;
    return res.end(JSON.stringify({ error: e?.tooLarge ? "body too large" : "bad JSON" }));
  }

  const client = new Anthropic();
  const task = body.task || "analyze";

  try {
    if (task === "compose") {
      const intent = typeof body.intent === "string" ? body.intent : "";
      if (!COMPOSE_INTENTS.has(intent)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "invalid compose intent" }));
      }
      const progression = cappedStrings(body.progression, 256);
      const key = String(body.key || "C major").trim().slice(0, 80) || "C major";
      const context = composeContext(body.context);
      const numbered = progression.map((symbol, index) => `${index}: ${symbol}`).join("\n");
      const userText = [
        `Requested intent: ${intent}`,
        `Key/mode: ${key}`,
        `Selected chord context: ${JSON.stringify(context)}`,
        `Complete current progression (index: chord):\n${numbered || "(empty)"}`,
        "Propose whole-progression ideas using only the proposal fields in the schema.",
      ].join("\n\n");
      const data = await callJSON(client, COMPOSE_SYSTEM, userText, COMPOSE_SCHEMA);
      res.statusCode = 200;
      return res.end(JSON.stringify(data));
    }

    if (task === "reharm") {
      const { progression = [], key = "C major", style = "any" } = body;
      const numbered = progression.map((c, i) => `${i}: ${c}`).join("\n");
      const userText = `Key: ${key}\nStyle preference: ${style}\nProgression (index: chord):\n${numbered}\n\nPropose your best interesting moves.`;
      const data = await callJSON(client, REHARM_SYSTEM, userText, REHARM_SCHEMA);
      res.statusCode = 200;
      return res.end(JSON.stringify(data));
    }

    // default: analyze
    const sheet = String(body.sheet || "").slice(0, 12000);
    const data = await callJSON(client, ANALYZE_SYSTEM, `Chord chart:\n\n${sheet}`, ANALYZE_SCHEMA);
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: "model call failed", detail: String(e?.message || e) }));
  }
}

async function callJSON(client, system, userText, schema) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: userText }],
  });
  const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

// Exported for the local dev server and tests.
export {
  REHARM_SCHEMA,
  ANALYZE_SCHEMA,
  COMPOSE_SCHEMA,
  QUALITY_VOCAB,
  MODEL,
};
