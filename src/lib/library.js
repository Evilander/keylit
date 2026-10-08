import { parseSheet, resolveCapo } from "./theory.js";
import { parseTab } from "./tab.js";
import { canonicalTuning, detectDeclaredTuning } from "./tuning.js";
import { slugSongKey } from "./bench.js";

export function chartExportText(song, row = song) {
  const tuning = canonicalTuning(row.tuningId || row.tuningRaw || row.tuning || song.tuningRaw || song.tuning || detectDeclaredTuning(song.body) || "standard");
  const capo = resolveCapo(song.body, row.capo ?? song.capo);
  return [
    `${row.title || song.title || "Untitled"} — ${row.artist || song.artist || "Various"}`,
    `Tuning: ${tuning.spelling}`,
    capo ? `Capo: ${capo}` : "Capo: No capo",
    (row.key || song.key) && `Key: ${row.key || song.key}`,
    song.sourceUrl,
    "",
    song.body,
  ].filter((line) => line != null && line !== false).join("\n");
}

const identity = (text) => String(text || "").normalize("NFKC").toLocaleLowerCase()
  .replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function groupSongArrangements(rows) {
  const songs = new Map();
  for (const row of rows) {
    const key = JSON.stringify([identity(row.artist), identity(row.title)]);
    if (!songs.has(key)) songs.set(key, { key, title: row.title, rows: [] });
    songs.get(key).rows.push(row);
  }
  return [...songs.values()];
}

export function libraryStats(rows) {
  return {
    songs: groupSongArrangements(rows).length,
    charts: rows.length,
    artists: new Set(rows.map((row) => row.artist || "Various")).size,
    albums: groupLibraryAlbums(rows).length,
  };
}

export function groupLibraryAlbums(rows) {
  const albums = new Map();
  for (const row of rows) {
    if (!row.album) continue;
    const key = JSON.stringify([identity(row.artist), identity(row.album)]);
    if (!albums.has(key)) albums.set(key, {
      key, artist: row.artist || "Various", album: row.album,
      order: row.albumOrder ?? 9999, songs: [],
      year: row.albumYear || (row.albumOrder >= 1900 && row.albumOrder <= 2100 ? row.albumOrder : null),
    });
    const album = albums.get(key);
    album.songs.push(row);
    album.order = Math.min(album.order, row.albumOrder ?? 9999);
  }
  return [...albums.values()].map((album) => ({
    ...album,
    songs: album.songs.slice().sort((a, b) =>
      (a.trackNumber ?? Infinity) - (b.trackNumber ?? Infinity) || a.title.localeCompare(b.title)),
  })).sort((a, b) => a.artist.localeCompare(b.artist) || a.order - b.order || a.album.localeCompare(b.album));
}

export function matchesChartFormat(row, format) {
  if (format === "tabs") return row.format === "tab" || row.format === "mixed";
  if (format === "chords") return row.format !== "tab";
  return true;
}

export const chartIdentity = (row) => `${row.source}/${row.id}`;

export function albumTracks(album) {
  const kindOrder = { main: 0, hidden: 1, bonus: 2 };
  return groupSongArrangements(album.songs).map((track) => ({
    ...track,
    trackNumber: Math.min(...track.rows.map((row) => row.trackNumber > 0 ? row.trackNumber : Infinity)),
    kind: track.rows.some((row) => row.albumTrackKind === "main") ? "main"
      : track.rows.some((row) => row.albumTrackKind === "hidden") ? "hidden"
      : track.rows.some((row) => row.albumTrackKind === "bonus") ? "bonus" : "main",
  })).sort((a, b) => a.trackNumber - b.trackNumber || kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title));
}

export function chooseAlbumChart(track, { preference = "tabs", choice } = {}) {
  const picked = track.rows.find((row) => chartIdentity(row) === choice);
  if (picked) return picked;
  const formats = preference === "chords" ? ["chords", "mixed", "tab"] : ["tab", "mixed", "chords"];
  return formats.map((format) => track.rows.find((row) => row.format === format)).find(Boolean) || track.rows[0];
}

/** Resolve each occurrence from its chosen chart, never from the last song's setup. */
export function chartSetlistSong(row, song = row) {
  const tuning = canonicalTuning(row.tuningId || row.tuningRaw || row.tuning
    || song.tuningRaw || song.tuning || detectDeclaredTuning(song.body) || "standard");
  return {
    songKey: row.songKey || slugSongKey(row.artist, row.title),
    title: row.title, artist: row.artist, source: row.source, id: row.id,
    tuning: tuning.id, capo: resolveCapo(song.body || "", row.capo ?? song.capo), key: row.key || song.key || null,
  };
}

export function detectChartFormat(body, fallback = "chords") {
  const hasChords = parseSheet(body || "").progression.length > 0;
  const hasTab = parseTab(body || "").events.length > 0;
  if (hasTab) return hasChords ? "mixed" : "tab";
  return hasChords ? "chords" : fallback;
}
