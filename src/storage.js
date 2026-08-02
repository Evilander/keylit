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

function memoryBackend() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? "",
    setItem: (key, value) => store.set(key, value),
  };
}

function selectBackend(backend, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (backend) return backend;
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
    ? storage
    : memoryBackend();
}

export function createLibrary(backend) {
  const be = selectBackend(backend);

  const read = () => {
    try { return JSON.parse(be.getItem(KEY) || "[]"); } catch { return []; }
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
  const read = () => {
    try {
      const raw = JSON.parse(be.getItem(DRAFT_KEY) || "{}");
      if (!isDraftEnvelope(raw)) return [];
      const drafts = raw.drafts.filter((draft) => validateDraft(draft).ok);
      // Duplicate draft identities make the persisted collection ambiguous.
      if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length) return [];
      return drafts.map((draft) => createDraft(draft));
    } catch { return []; }
  };
  const write = (drafts) => be.setItem(DRAFT_KEY, JSON.stringify({ version: 2, drafts }));

  return {
    list: () => read().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
    get: (id) => read().find((draft) => draft.id === id) || null,
    save(draft) {
      if (!validateDraft(draft).ok) throw new Error("Invalid Write draft");
      const drafts = read();
      const next = drafts.some((item) => item.id === draft.id)
        ? drafts.map((item) => item.id === draft.id ? draft : item)
        : drafts.concat(draft);
      write(next);
      return draft;
    },
    remove(id) { write(read().filter((draft) => draft.id !== id)); },
    legacy() { return createLibrary(be).list(); },
  };
}

export const draftBook = createDraftBook();

/* ---- the user songbook: full corpus-shaped records for the Library ------ */
const USER_KEY = "keylit.usersongs.v1";

export function createUserSongbook(backend) {
  const be = selectBackend(backend);
  const read = () => {
    try { return JSON.parse(be.getItem(USER_KEY) || "[]"); } catch { return []; }
  };
  const write = (songs) => be.setItem(USER_KEY, JSON.stringify(songs));

  return {
    /** Light manifest rows (no bodies) for the Library listing. */
    rows() { return read().map(({ body, ...row }) => row); },
    get(id) { return read().find((s) => s.id === id) || null; },
    /** Full records, bodies included — what a backup carries. */
    all() { return read(); },
    /** Save { song, row } from buildUserSong — same id replaces (edit). */
    save(song, row) {
      write(read().filter((s) => s.id !== song.id).concat({ ...song, ...row }));
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
