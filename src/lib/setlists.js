// Setlist rows are occurrences, not song identities: the same chart can play
// twice in a night with different notes, keys, or placement in the set.

const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const stringOrNull = (value) => nonEmptyString(value) ? value : null;
const numberOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

function slugSongKey(row) {
  const value = typeof row?.songKey === "string" ? row.songKey : `${row?.artist || ""} ${row?.title || ""}`;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

function legacyEntryId(setlistId, index, row) {
  return `legacy-${setlistId}-${index}-${slugSongKey(row)}`;
}

function uniqueEntryId(entry, setlistId, index, row, used) {
  if (!used.has(entry.entryId)) return entry.entryId;
  const base = legacyEntryId(setlistId, index, row);
  let occurrence = 2;
  let candidate = base;
  while (used.has(candidate)) candidate = `${base}-${occurrence++}`;
  return candidate;
}

/** Normalize one setlist occurrence to the storage-safe row shape. */
export function normalizeSetlistEntry(value, { setlistId = "setlist", index = 0 } = {}) {
  if (!isRecord(value) || !nonEmptyString(value.songKey)) return null;

  const source = stringOrNull(value.source);
  const id = stringOrNull(value.id);
  return {
    entryId: nonEmptyString(value.entryId) ? value.entryId : legacyEntryId(setlistId, index, value),
    songKey: value.songKey,
    source: source && id ? source : null,
    id: source && id ? id : null,
    title: stringOrNull(value.title) || "Untitled",
    artist: stringOrNull(value.artist),
    key: stringOrNull(value.key),
    note: typeof value.note === "string" ? value.note : "",
    tuning: stringOrNull(value.tuning),
    capo: numberOrNull(value.capo ?? null),
  };
}

/** Normalize either a v2 setlist or its legacy `songs` predecessor. */
export function normalizeSetlist(value, { makeId } = {}) {
  if (!isRecord(value) || !nonEmptyString(value.id)) return null;
  const rows = Array.isArray(value.entries) ? value.entries : Array.isArray(value.songs) ? value.songs : [];
  const used = new Set();
  const entries = [];

  rows.forEach((row, index) => {
    const entry = normalizeSetlistEntry(row, { setlistId: value.id, index, makeId });
    if (!entry) return;
    const entryId = uniqueEntryId(entry, value.id, index, row, used);
    used.add(entryId);
    entries.push({ ...entry, entryId });
  });

  return {
    id: value.id,
    name: stringOrNull(value.name) || "Setlist",
    notes: typeof value.notes === "string" ? value.notes : "",
    createdAt: numberOrNull(value.createdAt) ?? 0,
    entries,
  };
}

/** Normalize persisted v1/v2 bench data to the sole v2 in-memory shape. */
export function normalizeBenchState(value, { makeId } = {}) {
  const records = isRecord(value) && Array.isArray(value.setlists) ? value.setlists : [];
  const usedSetlistIds = new Set();
  const setlists = [];
  for (const record of records) {
    const setlist = normalizeSetlist(record, { makeId });
    if (!setlist || usedSetlistIds.has(setlist.id)) continue;
    usedSetlistIds.add(setlist.id);
    setlists.push(setlist);
  }
  return {
    version: 2,
    setlists,
    log: isRecord(value) && Array.isArray(value.log) ? value.log : [],
  };
}

function replaceSetlist(state, setlist) {
  return { ...state, setlists: state.setlists.map((item) => item.id === setlist.id ? setlist : item) };
}

function findSetlist(state, setlistId) {
  return Array.isArray(state?.setlists) ? state.setlists.find((setlist) => setlist.id === setlistId) : null;
}

export function addEntry(state, setlistId, song, { makeId } = {}) {
  const setlist = findSetlist(state, setlistId);
  if (!setlist || typeof makeId !== "function") return state;
  const entryId = makeId("entry");
  if (!nonEmptyString(entryId) || setlist.entries.some((entry) => entry.entryId === entryId)) return state;
  const entry = normalizeSetlistEntry({ ...song, entryId }, { setlistId, index: setlist.entries.length, makeId });
  if (!entry) return state;
  return replaceSetlist(state, { ...setlist, entries: setlist.entries.concat(entry) });
}

export function updateEntry(state, setlistId, entryId, patch) {
  const setlist = findSetlist(state, setlistId);
  if (!setlist || !isRecord(patch)) return state;
  const keys = Object.keys(patch);
  const allowed = new Set(["note", "key", "tuning", "capo"]);
  if (!keys.length || keys.some((key) => !allowed.has(key))) return state;
  if (("note" in patch && typeof patch.note !== "string")
    || ("key" in patch && patch.key !== null && !nonEmptyString(patch.key))
    || ("tuning" in patch && patch.tuning !== null && !nonEmptyString(patch.tuning))
    || ("capo" in patch && patch.capo !== null && numberOrNull(patch.capo) === null)) return state;

  const index = setlist.entries.findIndex((entry) => entry.entryId === entryId);
  if (index < 0) return state;
  const current = setlist.entries[index];
  if (keys.every((key) => current[key] === patch[key])) return state;
  const entries = setlist.entries.slice();
  entries[index] = { ...current, ...patch };
  return replaceSetlist(state, { ...setlist, entries });
}

export function moveEntry(state, setlistId, entryId, toIndex) {
  const setlist = findSetlist(state, setlistId);
  if (!setlist || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= setlist.entries.length) return state;
  const index = setlist.entries.findIndex((entry) => entry.entryId === entryId);
  if (index < 0 || index === toIndex) return state;
  const entries = setlist.entries.slice();
  const [entry] = entries.splice(index, 1);
  entries.splice(toIndex, 0, entry);
  return replaceSetlist(state, { ...setlist, entries });
}

export function removeEntry(state, setlistId, entryId) {
  const setlist = findSetlist(state, setlistId);
  if (!setlist) return { state, removed: null };
  const index = setlist.entries.findIndex((entry) => entry.entryId === entryId);
  if (index < 0) return { state, removed: null };
  const entry = setlist.entries[index];
  const entries = setlist.entries.slice();
  entries.splice(index, 1);
  return { state: replaceSetlist(state, { ...setlist, entries }), removed: { entry, index } };
}

export function restoreEntry(state, setlistId, entry, index) {
  const setlist = findSetlist(state, setlistId);
  if (!setlist || !Number.isInteger(index) || index < 0 || index > setlist.entries.length || !nonEmptyString(entry?.entryId)) return state;
  const restored = normalizeSetlistEntry(entry, { setlistId, index });
  if (!restored || setlist.entries.some((item) => item.entryId === restored.entryId)) return state;
  const entries = setlist.entries.slice();
  entries.splice(index, 0, restored);
  return replaceSetlist(state, { ...setlist, entries });
}
