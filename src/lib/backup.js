// backup.js — your songbook as one file you can carry: songs, setlists,
// practice log, and the handful of preferences that make a fresh machine
// feel like yours. Pure (prime directive 2): building, parsing, and merging
// happen here; reading/writing localStorage stays in the components.
//
// v1 (2026-07): { keylit: 1, songs, setlists }            — export-only era
// v2 (2026-07-15): { keylit: 2, songs, setlists, log, prefs, exportedAt }

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

/** Parse + validate a backup file's JSON text (or object). Accepts v1 and v2.
 * Returns { ok: true, data } (data normalized to v2 shape) or { ok: false, error }. */
export function parseBackup(input) {
  let raw = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { return { ok: false, error: "That file isn't JSON." }; }
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "That file isn't a Keylit backup." };
  if (raw.keylit !== 1 && raw.keylit !== 2) return { ok: false, error: "That file isn't a Keylit backup (no version mark)." };

  const songs = Array.isArray(raw.songs) ? raw.songs.filter((s) => s && typeof s === "object" && s.id && typeof s.body === "string") : [];
  const setlists = Array.isArray(raw.setlists)
    ? raw.setlists.filter((sl) => sl && typeof sl === "object" && sl.id && Array.isArray(sl.songs))
    : [];
  const log = Array.isArray(raw.log) ? raw.log.filter((e) => e && typeof e === "object" && e.songKey && e.at) : [];
  const prefs = {};
  if (raw.prefs && typeof raw.prefs === "object") {
    for (const k of PREF_KEYS) if (typeof raw.prefs[k] === "string") prefs[k] = raw.prefs[k];
  }
  return { ok: true, data: { keylit: 2, exportedAt: raw.exportedAt || null, songs, setlists, log, prefs } };
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
  const report = { songsAdded: 0, songsSkipped: 0, setlistsAdded: 0, setlistsSkipped: 0, logAdded: 0 };

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
  const haveSl = new Set(setlists.map((sl) => sl.id));
  for (const sl of incoming.setlists) {
    if (haveSl.has(sl.id)) { report.setlistsSkipped++; continue; }
    setlists.push(sl);
    haveSl.add(sl.id);
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
    bits.push(`${report.setlistsAdded} setlist${report.setlistsAdded === 1 ? "" : "s"}${report.setlistsSkipped ? ` (${report.setlistsSkipped} already here)` : ""}`);
  }
  if (report.logAdded) bits.push(`${report.logAdded} practice entries`);
  if (prefsApplied) bits.push("settings restored");
  return bits.join(" · ");
}
