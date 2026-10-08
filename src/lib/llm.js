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

const OFFLINE_COMPOSER_HINT =
  "Deep progression ideas are unavailable right now; offline ideas still work.";

const COMPOSE_INTENTS = new Set(["next", "lead-in", "between", "turnaround", "contrast"]);
const COMPOSE_KINDS = new Set(["insertBefore", "insertAfter", "replace", "newSection"]);
const MAX_COMPOSE_IDEAS = 8;
const MAX_COMPOSE_SYMBOLS = 8;
const MAX_PROGRESSION_SYMBOLS = 256;
const MAX_SYMBOL_LENGTH = 64;
const MAX_KEY_LENGTH = 80;
const MAX_RATIONALE_LENGTH = 500;
const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KIND_FOR_INTENT = {
  next: "insertAfter",
  "lead-in": "insertBefore",
  between: "insertBefore",
  turnaround: "insertAfter",
  contrast: "newSection",
};

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
    if (!data || !Array.isArray(data.suggestions)) throw new Error("invalid suggestions response");
  } catch (e) {
    return { ok: false, error: OFFLINE_HINT, detail: String(e?.message || e) };
  }

  const clean = [];
  for (const s of data.suggestions.slice(0, 32)) {
    if (!s || !Array.isArray(s.chords)) continue;
    const parsed = s.chords.slice(0, MAX_COMPOSE_SYMBOLS).filter((symbol) => typeof symbol === "string" && symbol.length <= MAX_SYMBOL_LENGTH).map(parseChord).filter(Boolean);
    if (!parsed.length) continue; // drop any suggestion the model spelled wrong
    if (!Number.isInteger(s.targetIndex) || s.targetIndex < 0 || s.targetIndex >= progression.length) continue;
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

function limitedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseableSymbol(value) {
  let symbol = "";
  if (typeof value === "string") symbol = value;
  else if (typeof value?.symbol === "string") symbol = value.symbol;
  else if (value && typeof value === "object") {
    try { symbol = chordSymbol(value); } catch { return null; }
  }
  const clean = limitedString(symbol, MAX_SYMBOL_LENGTH);
  return clean && parseChord(clean) ? clean : null;
}

function progressionSymbols(progression) {
  if (!Array.isArray(progression)) return [];
  return progression
    .slice(0, MAX_PROGRESSION_SYMBOLS)
    .map(parseableSymbol)
    .filter(Boolean);
}

function keyLabel(key) {
  const direct = limitedString(key, MAX_KEY_LENGTH);
  if (direct) return direct;
  if (key && typeof key === "object" && Number.isFinite(key.tonic)) {
    const tonic = ((Math.trunc(key.tonic) % 12) + 12) % 12;
    return `${KEY_NAMES[tonic]} ${key.mode === "minor" ? "minor" : "major"}`;
  }
  return "C major";
}

function derivedComposeContext(context, intent) {
  const sections = Array.isArray(context?.draft?.sections) ? context.draft.sections : [];
  const section = sections.find((candidate) => candidate?.id === context.sectionId);
  if (!section || !Array.isArray(section.chords)) return {};
  const slots = section.chords;
  const symbols = slots.map((slot) => parseableSymbol(slot));
  const selectedIndex = slots.findIndex((slot) => slot?.id === context.chordId);
  const gap = Number.isInteger(context.gapIndex)
    && context.gapIndex >= 0
    && context.gapIndex <= slots.length
    ? context.gapIndex
    : null;
  const at = (index) => index >= 0 && index < symbols.length ? symbols[index] : null;
  const out = {};
  if (selectedIndex >= 0 && at(selectedIndex)) out.selected = at(selectedIndex);
  const anchor = selectedIndex >= 0 ? selectedIndex : (gap == null ? -1 : gap - 1);
  if (at(anchor - 1)) out.previous = at(anchor - 1);
  if (at(anchor + 1)) out.next = at(anchor + 1);
  if (at(0)) out.opening = at(0);
  if (at(symbols.length - 1)) out.closing = at(symbols.length - 1);
  let targetIndex = null;
  if (intent === "lead-in") targetIndex = selectedIndex >= 0 ? selectedIndex : gap;
  else if (intent === "between") targetIndex = gap ?? (selectedIndex >= 0 ? selectedIndex : null);
  else if (intent === "turnaround") targetIndex = 0;
  else if (intent === "next") targetIndex = anchor + 1;
  if (targetIndex != null && at(targetIndex)) out.target = at(targetIndex);
  return out;
}

function composeContext(context, intent) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  const out = derivedComposeContext(context, intent);
  for (const key of ["selected", "previous", "next", "target", "opening", "closing"]) {
    const symbol = parseableSymbol(context[key]);
    if (symbol) out[key] = symbol;
  }
  for (const key of ["before", "after", "section", "chords"]) {
    if (!Array.isArray(context[key])) continue;
    const symbols = progressionSymbols(context[key]).slice(0, MAX_COMPOSE_SYMBOLS);
    if (symbols.length) out[key] = symbols;
  }
  return out;
}

function cleanComposeIdea(rawIdea, requestedIntent) {
  if (!rawIdea || typeof rawIdea !== "object" || Array.isArray(rawIdea)) return null;
  if (rawIdea.intent !== requestedIntent || !COMPOSE_INTENTS.has(rawIdea.intent)) return null;
  if (!COMPOSE_KINDS.has(rawIdea.kind)
    || rawIdea.kind !== KIND_FOR_INTENT[requestedIntent]
    || !Array.isArray(rawIdea.symbols)
    || rawIdea.symbols.length > MAX_COMPOSE_SYMBOLS) return null;
  const rawSymbols = rawIdea.symbols;
  if (!rawSymbols.length) return null;
  const symbols = rawSymbols.map(parseableSymbol);
  if (symbols.some((symbol) => !symbol)) return null;
  if (typeof rawIdea.rationale !== "string") return null;
  return {
    intent: rawIdea.intent,
    kind: rawIdea.kind,
    symbols,
    rationale: limitedString(rawIdea.rationale, MAX_RATIONALE_LENGTH),
  };
}

// Whole-progression idea source for Write. This boundary only accepts chord
// symbols and proposal prose; all theory evidence is recomputed offline later.
export async function deepProgressionIdeas(
  { progression = [], key = "C major", intent = "next", context = {} } = {},
  { signal } = {},
) {
  if (!COMPOSE_INTENTS.has(intent)) {
    return { ok: false, error: OFFLINE_COMPOSER_HINT, detail: "invalid compose intent" };
  }
  const payload = {
    task: "compose",
    progression: progressionSymbols(progression),
    key: keyLabel(key),
    intent,
    context: composeContext(context, intent),
  };
  try {
    const data = await post(payload, signal);
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.ideas)) {
      throw new TypeError("malformed compose response");
    }
    const ideas = data.ideas
      .slice(0, MAX_COMPOSE_IDEAS)
      .map((idea) => cleanComposeIdea(idea, intent))
      .filter(Boolean);
    return { ok: true, data: { ideas } };
  } catch (e) {
    return { ok: false, error: OFFLINE_COMPOSER_HINT, detail: String(e?.message || e) };
  }
}
