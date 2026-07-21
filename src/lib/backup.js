// backup.js — your songbook as one file you can carry: songs, setlists,
// practice log, and the handful of preferences that make a fresh machine
// feel like yours. Pure (prime directive 2): building, parsing, and merging
// happen here; reading/writing localStorage stays in the components.
//
// v1 (2026-07): { keylit: 1, songs, setlists }            — export-only era
// v2 (2026-07-15): { keylit: 2, songs, setlists, log, prefs, exportedAt }

import { normalizeSetlist } from "./setlists.js";

/** The only preference keys a backup may carry — nothing else crosses machines. */
export const PREF_KEYS = [
  "keylit.theme.v1",
  "keylit.guitar-tuning.v1",
  "keylit.chart-spelling.v2",
  "keylit.perform.v1",
];

export function buildBackup({ songs = [], setlists = [], log = [], prefs = {}, exportedAt }) {
  const keep = {};
  for (const k of PREF_KEYS) if (prefs[k] != null) keep[k] = prefs[k];
  return { keylit: 2, exportedAt: exportedAt || null, songs, setlists, log, prefs: keep };
}

// Field-level sanitizers: a backup is a FILE — corrupted or crafted, its
// contents go straight into localStorage and every room then trusts them.
// Rebuild each record as a fresh, whitelisted object (also sheds any
// __proto__-shaped keys) instead of trusting the file's shapes.
const str = (v) => (typeof v === "string" ? v : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const boundedStr = (v, limit = 160) => typeof v === "string" && v.length > 0 && v.length <= limit ? v : null;

// Sanity caps: a crafted "backup" shouldn't be able to balloon memory.
const MAX_SONGS = 5000, MAX_SETLISTS = 500, MAX_LOG = 10000, MAX_ENTRIES_PER_SETLIST = 5000;

function cleanSong(s) {
  if (!s || typeof s !== "object") return null;
  const id = str(s.id), body = str(s.body);
  if (!id || !body) return null;
  return {
    id,
    artist: str(s.artist) || "Unknown",
    title: str(s.title) || "Untitled",
    album: str(s.album),
    albumOrder: num(s.albumOrder) ?? 9999,
    source: str(s.source) || "user",
    sourceUrl: str(s.sourceUrl),
    tuning: str(s.tuning) || "standard",
    tuningRaw: str(s.tuningRaw),
    tuningSource: str(s.tuningSource) || "meta",
    capo: num(s.capo),
    key: str(s.key),
    format: s.format === "tab" ? "tab" : "chords",
    transcriber: str(s.transcriber),
    fetchedAt: str(s.fetchedAt),
    body,
  };
}

function cleanSetlist(sl) {
  if (!sl || typeof sl !== "object" || Array.isArray(sl) || !boundedStr(sl.id)) return null;
  const source = Array.isArray(sl.entries) ? sl.entries : Array.isArray(sl.songs) ? sl.songs : null;
  if (!source) return null;
  const entries = source.slice(0, MAX_ENTRIES_PER_SETLIST)
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && str(entry.songKey))
    .map((entry) => ({
      ...(boundedStr(entry.entryId) ? { entryId: entry.entryId } : {}),
      songKey: entry.songKey,
      source: str(entry.source),
      id: str(entry.id),
      title: str(entry.title),
      artist: str(entry.artist),
      key: str(entry.key),
      note: str(entry.note),
      tuning: str(entry.tuning),
      capo: num(entry.capo),
    }));
  const makeId = (prefix = "entry") => `backup-${prefix}-${sl.id}`;
  return normalizeSetlist({
    id: sl.id,
    name: str(sl.name),
    notes: str(sl.notes),
    createdAt: num(sl.createdAt),
    entries,
  }, { makeId });
}

function cleanLogEntry(e) {
  if (!e || typeof e !== "object" || !str(e.songKey)) return null;
  const at = num(e.at);
  if (at == null) return null;
  return { ...e, songKey: e.songKey, at, title: str(e.title) || "Untitled" };
}

/** Parse + validate a backup file's JSON text (or object). Accepts v1 and v2.
 * Returns { ok: true, data } (data normalized to v2 shape) or { ok: false, error }. */
export function parseBackup(input) {
  let raw = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { return { ok: false, error: "That file isn't JSON." }; }
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "That file isn't a Keylit backup." };
  if (raw.keylit !== 1 && raw.keylit !== 2) return { ok: false, error: "That file isn't a Keylit backup (no version mark)." };

  const songs = (Array.isArray(raw.songs) ? raw.songs : []).slice(0, MAX_SONGS).map(cleanSong).filter(Boolean);
  const setlists = (Array.isArray(raw.setlists) ? raw.setlists : []).slice(0, MAX_SETLISTS).map(cleanSetlist).filter(Boolean);
  const log = (Array.isArray(raw.log) ? raw.log : []).slice(0, MAX_LOG).map(cleanLogEntry).filter(Boolean);
  const prefs = {};
  if (raw.prefs && typeof raw.prefs === "object") {
    for (const k of PREF_KEYS) if (typeof raw.prefs[k] === "string") prefs[k] = raw.prefs[k];
  }
  return { ok: true, data: { keylit: 2, exportedAt: str(raw.exportedAt), songs, setlists, log, prefs } };
}

const slug = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const songSlug = (s) => `${slug(s.artist)}--${slug(s.title)}`;

/**
 * Merge an incoming backup into the current library. Never destroys:
 * - songs dedupe by id, then by (artist, title) slug — the same song added
 *   on two machines gets two ids but stays one song
 * - setlists dedupe by id (an identical export re-imported is a no-op)
 * - practice log unions on (songKey, at), newest kept, capped
 * Returns { songs, setlists, log, report }.
 */
export function mergeBackup(current, incoming, { logCap = 500 } = {}) {
  const report = { songsAdded: 0, songsSkipped: 0, setlistsAdded: 0, setlistsSkipped: 0, setlistNamesSkipped: [], logAdded: 0 };

  const songs = current.songs.slice();
  const haveIds = new Set(songs.map((s) => s.id));
  const haveSlugs = new Set(songs.map(songSlug));
  for (const s of incoming.songs) {
    if (haveIds.has(s.id) || haveSlugs.has(songSlug(s))) { report.songsSkipped++; continue; }
    songs.push(s);
    haveIds.add(s.id);
    haveSlugs.add(songSlug(s));
    report.songsAdded++;
  }

  const setlists = current.setlists.slice();
  const haveSl = new Map(setlists.map((sl) => [sl.id, sl]));
  for (const sl of incoming.setlists) {
    if (haveSl.has(sl.id)) {
      report.setlistsSkipped++;
      const local = haveSl.get(sl.id);
      report.setlistNamesSkipped.push((typeof local.name === "string" && local.name ? local.name : "Setlist").slice(0, 80));
      continue;
    }
    setlists.push(sl);
    haveSl.set(sl.id, sl);
    report.setlistsAdded++;
  }

  const seen = new Set(current.log.map((e) => `${e.songKey}@${e.at}`));
  const log = current.log.slice();
  for (const e of incoming.log) {
    const k = `${e.songKey}@${e.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    log.push(e);
    report.logAdded++;
  }
  log.sort((a, b) => (a.at || 0) - (b.at || 0));
  const capped = log.length > logCap ? log.slice(log.length - logCap) : log;

  return { songs, setlists, log: capped, report };
}

/** One human sentence for the import toast. */
export function reportLine(report, prefsApplied = 0) {
  const bits = [];
  bits.push(`${report.songsAdded} song${report.songsAdded === 1 ? "" : "s"} in${report.songsSkipped ? ` (${report.songsSkipped} you already had)` : ""}`);
  if (report.setlistsAdded || report.setlistsSkipped) {
    const names = Array.isArray(report.setlistNamesSkipped) ? report.setlistNamesSkipped.slice(0, 3) : [];
    const skipped = report.setlistsSkipped
      ? ` (${report.setlistsSkipped} already here${names.length ? `: ${names.join(", ")}${report.setlistsSkipped > names.length ? ", …" : ""}` : ""})`
      : "";
    bits.push(`${report.setlistsAdded} setlist${report.setlistsAdded === 1 ? "" : "s"}${skipped}`);
  }
  if (report.logAdded) bits.push(`${report.logAdded} practice entries`);
  if (prefsApplied) bits.push("settings restored");
  return bits.join(" · ");
}
