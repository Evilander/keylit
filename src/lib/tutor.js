// tutor.js — the BYO-key music tutor. The player brings their own API key
// (Anthropic / OpenAI / Google / xAI, or a local Ollama — no key at all);
// API-key calls go straight from the browser to the provider; subscription
// calls use the local server without exposing its credentials. Browser API
// keys live in localStorage. Follows lib/llm.js's network-touching precedent in
// lib/ — prompt building and request shaping are pure and tested.
//
// The tutor's soul is the system prompt: a working musician's teacher who
// speaks shape-first guitar (capo arithmetic included), ties every claim to
// something you can hear or finger, and knows whose records the player
// loves. The CONTEXT packet tells it what's on the stand right now.

export const TUTOR_STORE_KEY = "keylit.tutor.v1";

/* ================================================================== *
 * THE PERSONA
 * ================================================================== */
export function buildSystemPrompt() {
  return `You are the Keylit tutor — a working musician's teacher living inside Keylit, a chord-sheet-to-piano practice app. The player you teach is primarily a guitarist learning piano and songwriting. They read the fretboard in SHARPS (G#, C#7, D#), and they think in shapes and capos, not staff notation.

HOW TO TEACH
- Answer the asked question first, in 2–6 sentences. Then at most ONE follow-up question or ONE next move. Never a lecture.
- Shape-first arithmetic, always both names: "the Am shape at capo 2 sounds as Bm." Written shapes vs sounding pitch is the app's core distinction — keep them straight and say which one you mean.
- Ground every theory claim in something they can HEAR or FINGER right now ("hold the C, lift one finger to..."). Prefer "try this" over "know this."
- Use the app's function language: home (tonic, T), away (subdominant, S), pull (dominant, D). Numbers as Nashville (1, 4, 5) with the Roman (I, IV, V) in parentheses on first use only.
- When they ask WHY something sounds good, name the mechanism precisely: shared tones, stepwise voice motion, the leading tone's pull, borrowed color, a pedal grinding against change — then point at the exact notes involved.
- Their shelf runs Berman, Callahan, Elliott Smith, Kozelek, Malkmus, Tweedy, Modest Mouse, the Kinsella bands. Reference a real song when it genuinely illuminates a move. NEVER invent a song, a lyric, or a chord change you aren't sure of — say "I'd want to check" instead.
- Honesty over authority: taste gets called taste. Uncertainty gets said out loud.
- No jargon walls: any term a kitchen-table guitarist might not know gets a six-word gloss in passing, once.

CONTEXT
A message may open with a CONTEXT block describing what's on their stand (song, key, capo, tuning, dialect, progression, current chord). That's what they're looking at — refer to it naturally ("your chorus lands on F#m..."), never recite it back.

HOUSE RULES
- Chord names in the sharps dialect unless discussing key signatures on paper.
- Plain text only — no markdown headers, no bullet-list answers unless they ask for steps.
- Never say "as an AI." Never pad. Never close with an offer to answer more questions.`;
}

/** The stand, described compactly. All fields optional; empty stand → "". */
export function buildContext({ title, artist, keyName, soundingKeyName, capo, tuning, spelling, progression, currentSymbol, room } = {}) {
  const lines = [];
  if (title) lines.push(`Song: ${title}${artist ? ` — ${artist}` : ""}`);
  if (keyName) lines.push(`Written key: ${keyName}${soundingKeyName && soundingKeyName !== keyName ? ` · sounds in ${soundingKeyName}` : ""}`);
  if (capo) lines.push(`Capo: ${capo}`);
  if (tuning && tuning !== "standard") lines.push(`Tuning: ${tuning}`);
  if (spelling) lines.push(`Chord-name dialect: ${spelling === "sharps" ? "sharps (G#, C#7)" : spelling}`);
  if (progression?.length) {
    const shown = progression.slice(0, 32);
    lines.push(`Progression: ${shown.join(" ")}${progression.length > 32 ? " …" : ""}`);
  }
  if (currentSymbol) lines.push(`Current chord: ${currentSymbol}`);
  if (room) lines.push(`Open room: ${room}`);
  return lines.length ? `CONTEXT\n${lines.join("\n")}` : "";
}

/* ================================================================== *
 * PROVIDERS — request shaping is pure (tested); streaming is fetch.
 * ================================================================== */
export const PROVIDERS = {
  subscription: {
    name: "ChatGPT subscription (local gateway)",
    keyless: true,
    defaultModel: "gpt-6-astra",
    request({ system, messages, baseUrl }) {
      return {
        url: baseUrl || "http://127.0.0.1:8787/api/tutor",
        headers: { "content-type": "application/json" },
        body: { stream: true, messages: [{ role: "system", content: system }, ...messages] },
      };
    },
    parseLine(line) {
      if (!line.startsWith("data:")) return null;
      try { return JSON.parse(line.slice(5).trim()).choices?.[0]?.delta?.content || null; } catch { return null; }
    },
  },
  anthropic: {
    name: "Anthropic",
    keyHint: "sk-ant-…",
    defaultModel: "claude-sonnet-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    request({ apiKey, model, system, messages }) {
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          // Anthropic's explicit browser opt-in — the key is the user's own.
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: { model, max_tokens: 1024, system, stream: true, messages },
      };
    },
    parseLine(line) {
      if (!line.startsWith("data:")) return null;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return null;
      try {
        const j = JSON.parse(raw);
        if (j.type === "content_block_delta") return j.delta?.text || null;
      } catch { /* keepalive/event line */ }
      return null;
    },
  },

  openai: {
    name: "OpenAI",
    keyHint: "sk-…",
    defaultModel: "gpt-5.5-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    request({ apiKey, model, system, messages }) {
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: { model, stream: true, messages: [{ role: "system", content: system }, ...messages] },
      };
    },
    parseLine(line) {
      if (!line.startsWith("data:")) return null;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return null;
      try { return JSON.parse(raw).choices?.[0]?.delta?.content || null; } catch { return null; }
    },
  },

  google: {
    name: "Google",
    keyHint: "AIza…",
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    request({ apiKey, model, system, messages }) {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        headers: { "content-type": "application/json" },
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        },
      };
    },
    parseLine(line) {
      if (!line.startsWith("data:")) return null;
      const raw = line.slice(5).trim();
      if (!raw) return null;
      try { return JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text || null; } catch { return null; }
    },
  },

  xai: {
    name: "xAI",
    keyHint: "xai-…",
    defaultModel: "grok-4",
    keyUrl: "https://console.x.ai",
    request({ apiKey, model, system, messages }) {
      return {
        url: "https://api.x.ai/v1/chat/completions",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: { model, stream: true, messages: [{ role: "system", content: system }, ...messages] },
      };
    },
    parseLine(line) {
      if (!line.startsWith("data:")) return null;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return null;
      try { return JSON.parse(raw).choices?.[0]?.delta?.content || null; } catch { return null; }
    },
  },

  ollama: {
    name: "Ollama (local)",
    keyHint: "no key — runs on your machine",
    defaultModel: "llama3.2",
    keyless: true,
    keyUrl: "https://ollama.com",
    request({ model, system, messages, baseUrl }) {
      return {
        url: `${(baseUrl || "http://localhost:11434").replace(/\/$/, "")}/api/chat`,
        headers: { "content-type": "application/json" },
        body: { model, stream: true, messages: [{ role: "system", content: system }, ...messages] },
      };
    },
    parseLine(line) {
      const raw = line.trim();
      if (!raw) return null;
      try {
        const j = JSON.parse(raw);
        return j.done ? null : j.message?.content || null;
      } catch { return null; }
    },
  },
};

/**
 * Recognize a mid-stream error frame. Providers ship stream errors as
 * ordinary JSON lines that every parseLine silently discards — the chat then
 * "succeeds" with a truncated or empty reply and nobody is told. Returns the
 * provider's message, or null when the line is ordinary content/keepalive.
 */
export function parseErrorLine(line) {
  const raw = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!raw || raw === "[DONE]") return null;
  try {
    const j = JSON.parse(raw);
    if (j.type === "error") return j.error?.message || "the provider sent an error"; // Anthropic
    if (j.error) return typeof j.error === "string" ? j.error : j.error.message || "the provider sent an error"; // OpenAI/xAI/Google/Ollama
    // Google can end a candidate with a block reason and no text at all
    const cand = j.candidates?.[0];
    const fr = cand?.finishReason;
    if (fr && fr !== "STOP" && fr !== "MAX_TOKENS" && !cand?.content?.parts?.length) {
      return `the reply was blocked (${fr})`;
    }
  } catch { /* not JSON — an SSE comment/keepalive */ }
  return null;
}

function friendlyError(provider, status, detail = "") {
  const p = PROVIDERS[provider]?.name || provider;
  if (status === 401 || status === 403) return `${p} rejected that key. Double-check it in settings.`;
  if (status === 404) return `${p} doesn't know that model name — edit it in settings.`;
  if (status === 429) return `${p} says slow down (rate limit). Give it a minute.`;
  return `${p} answered ${status}${detail ? ` — ${detail.slice(0, 140)}` : ""}.`;
}

/**
 * Stream a chat turn. messages: [{role: "user"|"assistant", content}].
 * onToken(text) fires per delta; resolves to the full reply text.
 */
export async function sendChat({ provider, apiKey, model, baseUrl, system, messages, onToken, signal }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error("Pick a provider in settings.");
  if (!p.keyless && !apiKey) throw new Error(`${p.name} needs an API key — add one in settings.`);
  const { url, headers, body } = p.request({ apiKey, model: model || p.defaultModel, system, messages, baseUrl });

  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error(provider === "ollama"
      ? "Couldn't reach Ollama. Is it running? (`ollama serve` — and set OLLAMA_ORIGINS=* so the browser may call it.)"
      : `Couldn't reach ${p.name} — network or CORS. ${String(e.message || e)}`);
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).replace(/\s+/g, " "); } catch { /* body unreadable */ }
    throw new Error(friendlyError(provider, res.status, detail));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const streamErr = parseErrorLine(line);
      if (streamErr) throw new Error(`${p.name}: ${streamErr}`);
      const token = p.parseLine(line);
      if (token) { full += token; onToken?.(token); }
    }
  }
  const tailErr = parseErrorLine(buffer);
  if (tailErr) throw new Error(`${p.name}: ${tailErr}`);
  const tail = p.parseLine(buffer);
  if (tail) { full += tail; onToken?.(tail); }
  if (!full.trim()) throw new Error(`${p.name} returned an empty reply — try again, or check the model name in settings.`);
  return full;
}

/* ---- settings shape (persistence lives in TutorPanel — lib stays pure) ---- */
export function normalizeTutorSettings(raw, overrides = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    provider: PROVIDERS[overrides.provider] ? overrides.provider : PROVIDERS[r.provider] ? r.provider : "anthropic",
    models: r.models && typeof r.models === "object" ? r.models : {},
    keys: r.keys && typeof r.keys === "object" ? r.keys : {},
    ollamaUrl: typeof r.ollamaUrl === "string" ? r.ollamaUrl : "http://localhost:11434",
    subscriptionUrl: typeof overrides.subscriptionUrl === "string" && overrides.subscriptionUrl ? overrides.subscriptionUrl : typeof r.subscriptionUrl === "string" ? r.subscriptionUrl : "http://127.0.0.1:8787/api/tutor",
  };
}
