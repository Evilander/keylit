import { chordSymbol, parseChord, parseSheet, transposeChord } from "./theory.js";
import { chartOutline } from "./chartlines.js";

const cleanKey = (key) => ({
  tonic: ((Number(key?.tonic) || 0) % 12 + 12) % 12,
  mode: key?.mode === "minor" ? "minor" : "major",
});

const validSymbol = (value) => {
  const symbol = String(value || "").trim();
  return symbol && parseChord(symbol) ? symbol : null;
};

const cleanId = (value) => String(value || "").trim();
const isCanonicalId = (value) => typeof value === "string" && value.length > 0 && value.trim() === value;
const cleanName = (value, fallback) => {
  const name = String(value || "").trim();
  return name || fallback;
};
const isIndex = (value, length, allowEnd = false) =>
  Number.isInteger(value) && value >= 0 && value < length + (allowEnd ? 1 : 0);

function uniqueId(value, fallback, used) {
  const base = cleanId(value) || fallback;
  let id = base;
  for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function allSlotIds(draft) {
  const ids = new Set();
  for (const section of draft.sections) {
    ids.add(section.id);
    for (const chord of section.chords) ids.add(chord.id);
  }
  return ids;
}

function fallbackId(prefix, used) {
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}

function mintId(value, prefix, used, makeId) {
  const requested = value || (typeof makeId === "function" ? makeId(prefix) : fallbackId(prefix, used));
  if (!isCanonicalId(requested) || used.has(requested)) return null;
  used.add(requested);
  return requested;
}

function sectionIndex(draft, sectionId) {
  return draft.sections.findIndex((section) => section.id === sectionId);
}

function slotIndex(section, chordId) {
  return section.chords.findIndex((slot) => slot.id === chordId);
}

function withSection(draft, index, section) {
  const sections = draft.sections.slice();
  sections[index] = section;
  return { ...draft, sections };
}

function withChords(draft, sectionAt, chords) {
  return withSection(draft, sectionAt, { ...draft.sections[sectionAt], chords });
}

function slotsForSymbols(symbols, used, makeId, firstId) {
  if (!Array.isArray(symbols)) return null;
  const clean = symbols.map(validSymbol);
  if (clean.some((symbol) => !symbol)) return null;
  const slots = [];
  for (let i = 0; i < clean.length; i++) {
    const id = i === 0 && firstId ? firstId : mintId(null, "chord", used, makeId);
    if (!id) return null;
    slots.push({ id, symbol: clean[i] });
  }
  return slots;
}

export function createDraft(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const id = cleanId(source.id) || "draft";
  const rawSections = Array.isArray(source.sections) && source.sections.length
    ? source.sections
    : [{ id: `${id}-section-0`, name: "Section", chords: [] }];
  const usedIds = new Set();
  const sections = rawSections.map((rawSection, sectionAt) => {
    const section = rawSection && typeof rawSection === "object" ? rawSection : {};
    const sectionId = uniqueId(section.id, `${id}-section-${sectionAt}`, usedIds);
    const rawChords = Array.isArray(section.chords) ? section.chords : [];
    const chords = [];
    rawChords.forEach((rawSlot, chordAt) => {
      const slot = rawSlot && typeof rawSlot === "object" ? rawSlot : {};
      chords.push({
        id: uniqueId(slot.id, `${sectionId}-chord-${chordAt}`, usedIds),
        symbol: String(slot.symbol || "").trim(),
      });
    });
    return { id: sectionId, name: cleanName(section.name, "Section"), chords };
  });

  return {
    id,
    name: cleanName(source.name, "Untitled"),
    key: cleanKey(source.key),
    sections,
    lyrics: String(source.lyrics || ""),
    savedAt: Number.isFinite(Number(source.savedAt)) ? Number(source.savedAt) : 0,
  };
}

export function validateDraft(draft) {
  const errors = [];
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return { ok: false, errors: ["draft must be an object"] };
  }
  if (!isCanonicalId(draft.id)) errors.push("draft id is required");
  if (!cleanName(draft.name, "")) errors.push("draft name is required");
  if (!draft.key || typeof draft.key !== "object"
    || !Number.isInteger(draft.key.tonic) || draft.key.tonic < 0 || draft.key.tonic > 11
    || !["major", "minor"].includes(draft.key.mode)) {
    errors.push("draft key is invalid");
  }
  if (!Array.isArray(draft.sections) || !draft.sections.length) {
    errors.push("draft needs at least one section");
  }
  if ("lyrics" in draft && typeof draft.lyrics !== "string") errors.push("draft lyrics are invalid");
  if ("savedAt" in draft && (!Number.isFinite(draft.savedAt))) errors.push("draft savedAt is invalid");

  const ids = new Set();
  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  const addId = (value, label) => {
    const canonical = typeof value === "string" ? value.trim() : "";
    if (!isCanonicalId(value)) errors.push(`${label} id is required`);
    if (!canonical) return;
    if (ids.has(canonical)) errors.push(`duplicate id ${canonical}`);
    else ids.add(canonical);
  };
  for (const [sectionAt, section] of sections.entries()) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      errors.push(`section ${sectionAt} is invalid`);
      continue;
    }
    addId(section.id, `section ${sectionAt}`);
    if (!cleanName(section.name, "")) errors.push(`section ${sectionAt} name is required`);
    if (!Array.isArray(section.chords)) {
      errors.push(`section ${sectionAt} chords are invalid`);
      continue;
    }
    for (const [chordAt, slot] of section.chords.entries()) {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
        errors.push(`chord ${sectionAt}:${chordAt} is invalid`);
        continue;
      }
      addId(slot.id, `chord ${sectionAt}:${chordAt}`);
      if (!validSymbol(slot.symbol)) errors.push(`chord ${sectionAt}:${chordAt} symbol is invalid`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function deriveProgression(draft) {
  const progression = [], invalid = [];
  for (const section of draft?.sections || []) {
    for (const slot of section.chords || []) {
      const chord = parseChord(slot.symbol);
      if (!chord) invalid.push({ sectionId: section.id, chordId: slot.id, symbol: slot.symbol });
      else progression.push({ ...chord, section: section.name, slotId: slot.id, sectionId: section.id });
    }
  }
  return { progression, invalid };
}

export function serializeDraft(draft) {
  return (draft?.sections || [])
    .map((section) => `[${section.name}]\n${section.chords.map((c) => c.symbol).join(" ")}`)
    .join("\n\n");
}

export function flattenDraft(draft) {
  const flat = [];
  for (const [sectionIndex, section] of (draft?.sections || []).entries()) {
    for (const [chordIndex, slot] of (section.chords || []).entries()) {
      flat.push({
        sectionId: section.id,
        chordId: slot.id,
        sectionIndex,
        chordIndex,
        symbol: slot.symbol,
        chord: parseChord(slot.symbol),
      });
    }
  }
  return flat;
}

function outlineSections(sheet) {
  const sections = [];
  let current = null;
  let chordCount = 0;
  const startSection = (name) => {
    current = { name: cleanName(name, "Section"), symbols: [] };
    sections.push(current);
  };

  for (const line of chartOutline(String(sheet || ""))) {
    if (line.kind === "header") {
      startSection(line.title);
      continue;
    }
    if (line.kind !== "chords") continue;
    for (const token of line.tokens) {
      if (!token.parsed) continue;
      if (!current) startSection("Section");
      current.symbols.push(token.parsed.raw);
      chordCount++;
    }
  }
  return { sections, chordCount };
}

function parsedSections(sheet) {
  const sections = [];
  let current = null;
  for (const chord of parseSheet(String(sheet || "")).progression) {
    const name = cleanName(chord.section, "Section");
    if (!current || current.name !== name) {
      current = { name, symbols: [] };
      sections.push(current);
    }
    current.symbols.push(chord.raw);
  }
  return sections;
}

export function adaptLegacySketch(sketch = {}) {
  const source = sketch && typeof sketch === "object" ? sketch : {};
  const legacyId = cleanId(source.id) || "legacy";
  const outlined = outlineSections(source.sheet);
  const fallback = outlined.chordCount ? [] : parsedSections(source.sheet);
  const sections = outlined.chordCount ? outlined.sections : (fallback.length ? fallback : outlined.sections);
  return createDraft({
    id: legacyId,
    name: source.name,
    key: source.key,
    lyrics: source.lyrics,
    savedAt: source.savedAt,
    sections: sections.map((section, sectionAt) => ({
      id: `legacy-${legacyId}-s${sectionAt}`,
      name: section.name,
      chords: section.symbols.map((symbol, chordAt) => ({
        id: `legacy-${legacyId}-s${sectionAt}-c${chordAt}`,
        symbol,
      })),
    })),
  });
}

export function applyCompositionOp(draft, op, { makeId } = {}) {
  if (!validateDraft(draft).ok || !op || typeof op !== "object") return draft;

  switch (op.type) {
    case "draft/name": {
      const name = cleanName(op.name, "");
      return !name || name === draft.name ? draft : { ...draft, name };
    }
    case "draft/lyrics": {
      const lyrics = String(op.lyrics || "");
      return lyrics === draft.lyrics ? draft : { ...draft, lyrics };
    }
    case "draft/key": {
      if (!op.key || typeof op.key !== "object") return draft;
      const key = cleanKey(op.key);
      if (key.tonic === draft.key.tonic) {
        return key.mode === draft.key.mode ? draft : { ...draft, key };
      }
      const delta = key.tonic - draft.key.tonic;
      const sections = [];
      for (const section of draft.sections) {
        const chords = [];
        for (const slot of section.chords) {
          const parsed = parseChord(slot.symbol);
          const symbol = parsed && validSymbol(chordSymbol(transposeChord(parsed, delta)));
          if (!symbol) return draft;
          chords.push({ ...slot, symbol });
        }
        sections.push({ ...section, chords });
      }
      return { ...draft, key, sections };
    }
    case "section/add": {
      const name = cleanName(op.name, "");
      const index = op.index === undefined ? draft.sections.length : op.index;
      if (!name || !isIndex(index, draft.sections.length, true)) return draft;
      const used = allSlotIds(draft);
      const id = mintId(op.id, "section", used, makeId);
      if (!id) return draft;
      const sections = draft.sections.slice();
      sections.splice(index, 0, { id, name, chords: [] });
      return { ...draft, sections };
    }
    case "section/rename": {
      const index = sectionIndex(draft, op.sectionId);
      const name = cleanName(op.name, "");
      if (index < 0 || !name || name === draft.sections[index].name) return draft;
      return withSection(draft, index, { ...draft.sections[index], name });
    }
    case "section/duplicate": {
      const index = sectionIndex(draft, op.sectionId);
      if (index < 0) return draft;
      const source = draft.sections[index];
      const used = allSlotIds(draft);
      const id = mintId(op.id, "section", used, makeId);
      if (!id) return draft;
      const chords = [];
      for (const slot of source.chords) {
        const chordId = mintId(null, "chord", used, makeId);
        if (!chordId) return draft;
        chords.push({ id: chordId, symbol: slot.symbol });
      }
      const sections = draft.sections.slice();
      sections.splice(index + 1, 0, {
        id,
        name: cleanName(op.name, source.name),
        chords,
      });
      return { ...draft, sections };
    }
    case "section/delete": {
      const index = sectionIndex(draft, op.sectionId);
      if (index < 0 || draft.sections.length === 1) return draft;
      const sections = draft.sections.slice();
      sections.splice(index, 1);
      return { ...draft, sections };
    }
    case "section/move": {
      const index = sectionIndex(draft, op.sectionId);
      if (index < 0 || !isIndex(op.toIndex, draft.sections.length) || index === op.toIndex) return draft;
      const sections = draft.sections.slice();
      const [section] = sections.splice(index, 1);
      sections.splice(op.toIndex, 0, section);
      return { ...draft, sections };
    }
    case "section/reverse": {
      const index = sectionIndex(draft, op.sectionId);
      const section = draft.sections[index];
      if (index < 0 || section.chords.length < 2) return draft;
      return withChords(draft, index, section.chords.slice().reverse());
    }
    case "chord/insert": {
      const sectionAt = sectionIndex(draft, op.sectionId);
      if (sectionAt < 0 || !isIndex(op.index, draft.sections[sectionAt].chords.length, true)) return draft;
      const symbol = validSymbol(op.symbol);
      if (!symbol) return draft;
      const used = allSlotIds(draft);
      const id = mintId(op.id, "chord", used, makeId);
      if (!id) return draft;
      const chords = draft.sections[sectionAt].chords.slice();
      chords.splice(op.index, 0, { id, symbol });
      return withChords(draft, sectionAt, chords);
    }
    case "chord/replace": {
      const sectionAt = sectionIndex(draft, op.sectionId);
      if (sectionAt < 0) return draft;
      const chordAt = slotIndex(draft.sections[sectionAt], op.chordId);
      const symbol = validSymbol(op.symbol);
      if (chordAt < 0 || !symbol || symbol === draft.sections[sectionAt].chords[chordAt].symbol) return draft;
      const chords = draft.sections[sectionAt].chords.slice();
      chords[chordAt] = { ...chords[chordAt], symbol };
      return withChords(draft, sectionAt, chords);
    }
    case "chord/duplicate": {
      const sectionAt = sectionIndex(draft, op.sectionId);
      if (sectionAt < 0) return draft;
      const chordAt = slotIndex(draft.sections[sectionAt], op.chordId);
      if (chordAt < 0) return draft;
      const used = allSlotIds(draft);
      const id = mintId(op.id, "chord", used, makeId);
      if (!id) return draft;
      const chords = draft.sections[sectionAt].chords.slice();
      chords.splice(chordAt + 1, 0, { id, symbol: chords[chordAt].symbol });
      return withChords(draft, sectionAt, chords);
    }
    case "chord/delete": {
      const sectionAt = sectionIndex(draft, op.sectionId);
      if (sectionAt < 0) return draft;
      const chordAt = slotIndex(draft.sections[sectionAt], op.chordId);
      if (chordAt < 0) return draft;
      const chords = draft.sections[sectionAt].chords.slice();
      chords.splice(chordAt, 1);
      return withChords(draft, sectionAt, chords);
    }
    case "chord/move": {
      const sectionAt = sectionIndex(draft, op.sectionId);
      if (sectionAt < 0) return draft;
      const chordAt = slotIndex(draft.sections[sectionAt], op.chordId);
      const chords = draft.sections[sectionAt].chords;
      if (chordAt < 0 || !isIndex(op.toIndex, chords.length) || chordAt === op.toIndex) return draft;
      const moved = chords.slice();
      const [slot] = moved.splice(chordAt, 1);
      moved.splice(op.toIndex, 0, slot);
      return withChords(draft, sectionAt, moved);
    }
    case "suggestion/apply": {
      if (![
        "replace", "insertBefore", "insertAfter", "newSection",
      ].includes(op.kind) || !Array.isArray(op.symbols) || !op.symbols.length
        || op.symbols.some((symbol) => !validSymbol(symbol))) return draft;
      const sectionAt = sectionIndex(draft, op.sectionId);
      if (sectionAt < 0) return draft;
      const used = allSlotIds(draft);
      const section = draft.sections[sectionAt];
      if (op.kind === "newSection") {
        const sectionId = mintId(op.id, "section", used, makeId);
        const chords = sectionId && slotsForSymbols(op.symbols, used, makeId);
        if (!sectionId || !chords) return draft;
        return {
          ...draft,
          sections: [...draft.sections, {
            id: sectionId,
            name: cleanName(op.sectionName, "Contrast"),
            chords,
          }],
        };
      }
      if (op.gapIndex !== undefined && op.gapIndex !== null) {
        if (!isIndex(op.gapIndex, section.chords.length, true)) return draft;
        const slots = slotsForSymbols(op.symbols, used, makeId);
        if (!slots) return draft;
        const chords = section.chords.slice();
        chords.splice(op.gapIndex, 0, ...slots);
        return withChords(draft, sectionAt, chords);
      }
      const chordAt = slotIndex(section, op.targetId);
      if (chordAt < 0) return draft;
      if (op.kind === "replace") {
        const slots = slotsForSymbols(op.symbols, used, makeId, section.chords[chordAt].id);
        if (!slots) return draft;
        const chords = section.chords.slice();
        chords.splice(chordAt, 1, ...slots);
        return withChords(draft, sectionAt, chords);
      }
      if (op.kind === "insertBefore" || op.kind === "insertAfter") {
        const slots = slotsForSymbols(op.symbols, used, makeId);
        if (!slots) return draft;
        const chords = section.chords.slice();
        chords.splice(chordAt + (op.kind === "insertAfter" ? 1 : 0), 0, ...slots);
        return withChords(draft, sectionAt, chords);
      }
      return draft;
    }
    default:
      return draft;
  }
}

function storedSuggestionSymbol(value, transpose) {
  const parsed = typeof value === "string"
    ? parseChord(value)
    : value && parseChord(chordSymbol(value));
  if (!parsed) return null;
  return validSymbol(chordSymbol(transposeChord(parsed, -transpose)));
}

export function suggestionToCompositionOp({ suggestion, sectionId, targetSlotId, gapIndex, transpose } = {}) {
  if (!suggestion || !cleanId(sectionId)
    || !["replace", "insertBefore", "insertAfter", "newSection"].includes(suggestion.kind)) return null;
  const values = Array.isArray(suggestion.chords) ? suggestion.chords : suggestion.symbols;
  if (!Array.isArray(values) || !values.length) return null;
  const displayTranspose = Number.isInteger(Number(transpose)) ? Number(transpose) : 0;
  const symbols = values.map((value) => storedSuggestionSymbol(value, displayTranspose));
  if (symbols.some((symbol) => !symbol)) return null;
  const op = {
    type: "suggestion/apply",
    sectionId,
    kind: suggestion.kind,
    symbols,
  };
  if (suggestion.kind === "newSection") {
    if (suggestion.sectionName) op.sectionName = suggestion.sectionName;
    return op;
  }
  if (gapIndex !== undefined && gapIndex !== null) {
    op.gapIndex = gapIndex;
    return op;
  }
  if (!cleanId(targetSlotId)) return null;
  op.targetId = targetSlotId;
  return op;
}

export function deriveActiveDocument({ writeDraft, baseSheet, labProg, baseProg } = {}) {
  if (writeDraft) {
    const { progression } = deriveProgression(writeDraft);
    return { source: "write", sheet: serializeDraft(writeDraft), progression };
  }
  return {
    source: labProg ? "lab" : "base",
    sheet: baseSheet || "",
    progression: labProg || baseProg || [],
  };
}

function initialSelection(draft) {
  for (const section of draft.sections) {
    if (section.chords.length) return { sectionId: section.id, chordId: section.chords[0].id };
  }
  return { sectionId: draft.sections[0].id, chordId: null };
}

export function replaceDraftInSession(session, draft, { historyMode = "push" } = {}) {
  if (!session || typeof session !== "object" || Array.isArray(session) || !validateDraft(draft).ok) return session;
  if (historyMode !== "push" && historyMode !== "reset") return session;
  const history = historyMode === "reset"
    ? []
    : [...(Array.isArray(session.history) ? session.history : []), session.draft];
  const revision = Number.isInteger(session.revision) && session.revision >= 0 ? session.revision + 1 : 1;
  return { ...session, draft, selection: initialSelection(draft), history, revision };
}
