// storage.js — tiny song library backed by localStorage. Kept OUT of lib/ on
// purpose: lib/ is pure, this touches a browser API. A song is { id, name,
// sheet, savedAt }. Inject a backend (Map-like) for tests.

import { createDraft, validateDraft } from "./lib/composition.js";
import {
  addEntry, moveEntry, normalizeBenchState, removeEntry, restoreEntry, updateEntry,
} from "./lib/setlists.js";
import {
  normalizeOneSongState, markDay as onesongMarkDay, finishSong, removeFinished, exerciseDone,
} from "./lib/onesong.js";

const KEY = "keylit.songs.v1";

function unavailableBackend() {
  return {
    getItem: () => "",
    setItem: () => { throw new Error("Persistent storage is unavailable. Keep this window open and download or copy your work before closing."); },
  };
}

function selectBackend(backend, storage) {
  if (backend) return backend;
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
    ? storage
    : unavailableBackend();
}

export function createLibrary(backend) {
  const be = selectBackend(backend);

  const read = () => {
    try {
      const songs = JSON.parse(be.getItem(KEY) || "[]");
      return Array.isArray(songs) ? songs.filter((s) => s && typeof s === "object" && typeof s.id === "string" && typeof s.name === "string" && typeof s.sheet === "string") : [];
    } catch { return []; }
  };
  const write = (songs) => be.setItem(KEY, JSON.stringify(songs));

  return {
    list() { return read().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); },
    get(id) { return read().find((s) => s.id === id) || null; },
    save({ name, sheet, lyrics, savedAt }) {
      const songs = read();
      const id = `${(name || "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${(savedAt || 0).toString(36)}`;
      // a sketch is chords AND words — lyrics ride along when present
      const song = { id, name: name || "Untitled", sheet: sheet || "", ...(lyrics ? { lyrics } : {}), savedAt: savedAt || 0 };
      // replace a same-name entry rather than piling up duplicates
      const next = songs.filter((s) => s.name !== song.name).concat(song);
      write(next);
      return song;
    },
    remove(id) { write(read().filter((s) => s.id !== id)); },
  };
}

// Default app-wide library (localStorage in the browser).
export const library = createLibrary();

const DRAFT_KEY = "keylit.write.drafts.v2";

function isDraftEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes("version") && keys.includes("drafts")
    && value.version === 2 && Array.isArray(value.drafts);
}

export function createDraftBook(backend, storage) {
  const be = selectBackend(backend, storage);
  const observed = new Map();
  let readBase;
  const read = (strict = false) => {
    try {
      const rawText = be.getItem(DRAFT_KEY) || "";
      if (strict) readBase = rawText;
      if (!rawText) return [];
      const raw = JSON.parse(rawText);
      if (!isDraftEnvelope(raw)) throw new Error("Invalid envelope");
      const drafts = raw.drafts.filter((draft) => validateDraft(draft).ok);
      if (drafts.length !== raw.drafts.length || new Set(drafts.map((draft) => draft.id)).size !== drafts.length) {
        if (strict) throw new Error("Invalid drafts");
        if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length) return [];
      }
      return drafts.map((draft) => createDraft(draft));
    } catch {
      if (strict) throw new Error("Stored Write drafts need recovery. Existing data was preserved; copy your current writing before closing.");
      return [];
    }
  };
  const remember = (draft) => {
    if (!observed.has(draft.id)) observed.set(draft.id, JSON.stringify(draft));
    return draft;
  };
  const checkRecord = (id, drafts) => {
    const current = JSON.stringify(drafts.find((draft) => draft.id === id) || null);
    if (observed.has(id) && observed.get(id) !== current) throw new Error("Write drafts changed in another window. Your edits are still here; copy them before reopening the saved draft.");
  };
  const write = (drafts, id) => {
    // Best-effort conflict detection only: localStorage has no atomic CAS.
    if ((be.getItem(DRAFT_KEY) || "") !== readBase) throw new Error("Write drafts changed in another window. Copy your edits before reopening the saved draft.");
    be.setItem(DRAFT_KEY, JSON.stringify({ version: 2, drafts }));
    observed.set(id, JSON.stringify(drafts.find((draft) => draft.id === id) || null));
  };

  return {
    list: () => read().map(remember).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
    get(id) {
      const draft = read().find((item) => item.id === id) || null;
      observed.set(id, JSON.stringify(draft));
      return draft;
    },
    save(draft) {
      if (!validateDraft(draft).ok) throw new Error("Invalid Write draft");
      const drafts = read(true);
      checkRecord(draft.id, drafts);
      const next = drafts.some((item) => item.id === draft.id)
        ? drafts.map((item) => item.id === draft.id ? draft : item)
        : drafts.concat(draft);
      write(next, draft.id);
      return draft;
    },
    remove(id) {
      const drafts = read(true);
      checkRecord(id, drafts);
      write(drafts.filter((draft) => draft.id !== id), id);
    },
    legacy() { return createLibrary(be).list(); },
  };
}

export const draftBook = createDraftBook();

/* ---- the user songbook: full corpus-shaped records for the Library ------ */
const USER_KEY = "keylit.usersongs.v1";

export function createUserSongbook(backend) {
  const be = selectBackend(backend);
  const read = () => {
    try {
      const songs = JSON.parse(be.getItem(USER_KEY) || "[]");
      if (!Array.isArray(songs)) return [];
      return songs.filter((s) => s && typeof s === "object" && typeof s.id === "string" && typeof s.body === "string").map((s) => ({
        ...s, title: typeof s.title === "string" ? s.title : "Untitled",
        artist: typeof s.artist === "string" ? s.artist : "Unknown",
        tuning: typeof s.tuning === "string" ? s.tuning : "standard",
        key: typeof s.key === "string" ? s.key : null,
      }));
    } catch { return []; }
  };
  const write = (songs) => be.setItem(USER_KEY, JSON.stringify(songs));

  return {
    /** Light manifest rows (no bodies) for the Library listing. */
    rows() { return read().map(({ body, ...row }) => row); },
    get(id) { return read().find((s) => s.id === id) || null; },
    /** Full records, bodies included — what a backup carries. */
    all() { return read(); },
    /** Exact artist/title edits retain legacy IDs (including setlist links).
     * Returns the stored record; callers must use its ID, not the built ID. */
    save(song, row) {
      const songs = read();
      const record = { ...song, ...row };
      const sameName = (item) => item.artist === record.artist && item.title === record.title;
      const existing = songs.find((item) => item.id === record.id && sameName(item))
        || songs.find(sameName);
      const id = existing?.id || record.id;
      if (songs.some((item) => item.id === id && !sameName(item))) {
        throw new Error("A different song already uses this ID. Nothing was overwritten. Copy your chart and add it again to create a fresh identity.");
      }
      const saved = { ...record, id };
      write(songs.filter((item) => item.id !== id).concat(saved));
      return saved;
    },
    /** Replace the whole book (import path — caller merged already). */
    replaceAll(songs) { write(Array.isArray(songs) ? songs : []); },
    remove(id) { write(read().filter((s) => s.id !== id)); },
  };
}

export const userSongbook = createUserSongbook();

/* ---- the Bench Book: setlists + practice log ---------------------------- */
// Musician-shaped memory: what's on tonight's bench, and what actually got
// practiced (play-along scores land here). One key, one JSON blob, capped.
const BENCH_KEY = "keylit.bench.v2";
const LEGACY_BENCH_KEY = "keylit.bench.v1";
const LOG_CAP = 500;

function defaultId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parseJson(be, key) {
  try {
    const raw = be.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isV2BenchEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 3 || !keys.includes("version") || !keys.includes("setlists") || !keys.includes("log")) return false;
  if (value.version !== 2 || !Array.isArray(value.setlists) || !Array.isArray(value.log)) return false;
  return value.setlists.every((setlist) => setlist && typeof setlist === "object"
    && !Array.isArray(setlist) && typeof setlist.id === "string" && setlist.id.trim()
    && Array.isArray(setlist.entries));
}

export function createBenchBook(backend, { makeId = defaultId, now = Date.now } = {}) {
  const be = selectBackend(backend);
  const read = () => {
    const v2 = parseJson(be, BENCH_KEY);
    if (isV2BenchEnvelope(v2)) return normalizeBenchState(v2, { makeId });
    return normalizeBenchState(parseJson(be, LEGACY_BENCH_KEY), { makeId });
  };
  const write = (state) => {
    const normalized = normalizeBenchState(state, { makeId });
    be.setItem(BENCH_KEY, JSON.stringify({ version: 2, setlists: normalized.setlists, log: normalized.log }));
  };
  const update = (transform) => {
    const st = read();
    const next = transform(st);
    if (next !== st) write(next);
    return next;
  };

  return {
    /** The whole book at once — what a backup carries. */
    raw() { return read(); },
    /** Replace wholesale (import path — caller merged already). */
    replace(state) {
      write(state);
    },
    /** Alias for import callers; both paths normalize before the v2 write. */
    restore(state) {
      write(state);
    },
    setlists() { return read().setlists; },
    /** Save the whole selection in one write; failure leaves the book untouched. */
    saveSetlistSongs({ id = null, name, songs }) {
      if (!Array.isArray(songs) || !songs.length) throw new Error("Choose at least one song.");
      const st = read();
      let next = st;
      let targetId = id;
      if (id) {
        if (!st.setlists.some((setlist) => setlist.id === id)) throw new Error("That setlist no longer exists.");
      } else {
        targetId = makeId("setlist");
        if (typeof targetId !== "string" || !targetId.trim() || st.setlists.some((setlist) => setlist.id === targetId)) {
          throw new Error("Could not create a unique setlist.");
        }
        next = { ...st, setlists: st.setlists.concat({ id: targetId, name: name?.trim() || "Setlist", entries: [], notes: "", createdAt: now() }) };
      }
      for (const song of songs) {
        const added = addEntry(next, targetId, song, { makeId });
        if (added === next) throw new Error("Could not add every chosen song.");
        next = added;
      }
      write(next);
      return next.setlists.find((setlist) => setlist.id === targetId);
    },
    createSetlist(name) {
      const st = read();
      const id = makeId("setlist");
      if (typeof id !== "string" || !id.trim() || st.setlists.some((setlist) => setlist.id === id)) return null;
      const sl = { id, name: typeof name === "string" && name ? name : "Setlist", entries: [], notes: "", createdAt: now() };
      st.setlists.push(sl);
      write(st);
      return sl;
    },
    renameSetlist(id, name) {
      update((st) => {
        const sl = st.setlists.find((item) => item.id === id);
        if (!sl || typeof name !== "string" || !name || sl.name === name) return st;
        return { ...st, setlists: st.setlists.map((item) => item.id === id ? { ...item, name } : item) };
      });
    },
    removeSetlist(id) {
      update((st) => {
        const setlists = st.setlists.filter((setlist) => setlist.id !== id);
        return setlists.length === st.setlists.length ? st : { ...st, setlists };
      });
    },
    setSetlistNotes(id, notes) {
      update((st) => {
        const sl = st.setlists.find((item) => item.id === id);
        const value = typeof notes === "string" ? notes : "";
        if (!sl || sl.notes === value) return st;
        return { ...st, setlists: st.setlists.map((item) => item.id === id ? { ...item, notes: value } : item) };
      });
    },
    /** Add an occurrence; repeats are intentional and receive unique entry IDs. */
    addToSetlist(id, song) {
      const st = read();
      const next = addEntry(st, id, song, { makeId });
      if (next === st) return null;
      write(next);
      return next.setlists.find((setlist) => setlist.id === id)?.entries.at(-1) || null;
    },
    setEntryNote(id, entryId, note) {
      const st = read();
      const next = updateEntry(st, id, entryId, { note });
      if (next === st) return null;
      write(next);
      return next.setlists.find((setlist) => setlist.id === id)?.entries.find((entry) => entry.entryId === entryId) || null;
    },
    /** Persist an occurrence's playing setup ({ tuning?, capo? }) — e.g. a
     *  mid-set adjustment on the perform stage, remembered for next time. */
    setEntrySetup(id, entryId, patch) {
      const st = read();
      const clean = {};
      if (patch && "tuning" in patch) clean.tuning = patch.tuning;
      if (patch && "capo" in patch) clean.capo = patch.capo;
      if (!Object.keys(clean).length) return null;
      const next = updateEntry(st, id, entryId, clean);
      if (next === st) return null;
      write(next);
      return next.setlists.find((setlist) => setlist.id === id)?.entries.find((entry) => entry.entryId === entryId) || null;
    },
    moveInSetlist(id, entryId, toIndex) {
      update((st) => moveEntry(st, id, entryId, toIndex));
    },
    removeFromSetlist(id, entryId) {
      const out = removeEntry(read(), id, entryId);
      if (out.removed) write(out.state);
      return out.removed;
    },
    restoreToSetlist(id, entry, index) {
      const st = read();
      const next = restoreEntry(st, id, entry, index);
      if (next === st) return null;
      write(next);
      return next.setlists.find((setlist) => setlist.id === id)?.entries.find((item) => item.entryId === entry.entryId) || null;
    },
    /** entry: { songKey, title, artist?, at, kind: "playalong"|"ran-it", accuracy?, total?, clean? } */
    logPractice(entry) {
      update((st) => {
        const log = st.log.concat(entry);
        return { ...st, log: log.length > LOG_CAP ? log.slice(log.length - LOG_CAP) : log };
      });
    },
    log(songKey) {
      const all = read().log.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
      return songKey ? all.filter((e) => e.songKey === songKey) : all;
    },
  };
}

export const benchBook = createBenchBook();

/* ---- the One Song book: bench days, the streak, the finished shelf ------ */
// Tweedy's assignment as memory: which days you showed up, which doors you
// worked, what you finished. The pure brains live in lib/onesong.js.
const ONESONG_KEY = "keylit.onesong.v1";

export function createOneSongBook(backend) {
  const be = selectBackend(backend);
  const read = () => normalizeOneSongState(parseJson(be, ONESONG_KEY));
  const write = (state) => be.setItem(ONESONG_KEY, JSON.stringify(state));
  const apply = (transform) => {
    const st = read();
    const next = transform(st);
    if (next !== st) write(next);
    return next;
  };

  return {
    state: read,
    /** what: "timer" | "kept" | "door" | "finished" — the day lights either way. */
    markDay(what, at = Date.now()) { return apply((st) => onesongMarkDay(st, { at, what })); },
    finish({ title, draftId, at = Date.now() }) { return apply((st) => finishSong(st, { title, at, draftId })); },
    removeFinished(index) { return apply((st) => removeFinished(st, index)); },
    doorDone(name, at = Date.now()) { return apply((st) => exerciseDone(st, name, at)); },
  };
}

export const onesongBook = createOneSongBook();
