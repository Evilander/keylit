// llm.js — thin client for the Keylit AI proxy. Browser-side, no key here.
//
// Every chord symbol the model returns is re-parsed through the pure parser
// before it reaches the UI; anything that doesn't parse is dropped. The model
// is an idea source, never a source of truth for what gets played.

import { parseChord, chordSymbol } from "./theory.js";

const PROXY_URL = import.meta.env?.VITE_AI_PROXY_URL || "/api/analyze";

const OFFLINE_HINT =
  "AI deep-mode needs the proxy. Set VITE_AI_PROXY_URL (see README / api/analyze.js). " +
  "The offline Chord Lab still works without it.";

async function post(payload, signal) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  return res.json();
}

// Harmony read of a sheet (back-compat with the original Analyze button).
export async function analyzeSheet(sheet, { signal } = {}) {
  try {
    const data = await post({ task: "analyze", sheet }, signal);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: OFFLINE_HINT, detail: String(e?.message || e) };
  }
}

// Context-aware reharmonization. Returns suggestions whose chords are guaranteed
// to be parseable Keylit chords (invalid ones are filtered out).
export async function reharmonize({ progression, key, style = "any" }, { signal } = {}) {
  const symbols = progression.map((c) => (typeof c === "string" ? c : chordSymbol(c)));
  let data;
  try {
    data = await post({ task: "reharm", progression: symbols, key, style }, signal);
  } catch (e) {
    return { ok: false, error: OFFLINE_HINT, detail: String(e?.message || e) };
  }

  const clean = [];
  for (const s of data.suggestions || []) {
    const parsed = (s.chords || []).map(parseChord).filter(Boolean);
    if (!parsed.length) continue; // drop any suggestion the model spelled wrong
    if (typeof s.targetIndex !== "number" || s.targetIndex < 0 || s.targetIndex >= progression.length) continue;
    clean.push({
      targetIndex: s.targetIndex,
      action: ["replace", "insertBefore", "insertAfter"].includes(s.action) ? s.action : "replace",
      chords: parsed,
      rationale: String(s.rationale || ""),
      boldness: typeof s.boldness === "number" ? Math.max(0, Math.min(1, s.boldness)) : 0.5,
      function: ["T", "S", "D", "color"].includes(s.function) ? s.function : "color",
      source: "ai",
    });
  }
  return { ok: true, data: { summary: String(data.summary || ""), suggestions: clean } };
}
