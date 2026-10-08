// corpus.js — loads the song library: the personal /public/corpus (local
// machines only; never shipped) plus the public-domain /public/songbook
// (ships everywhere). Manifests are small indexes (no bodies); each song is
// fetched lazily on open. Kept OUT of lib/ (touches fetch). Degrades to an
// empty library when neither source is present.

// Base-aware so the embed at /keylit/ resolves its own files, not the site root.
const BASE = import.meta.env?.BASE_URL || "/";

import { userSongbook } from "./storage.js";
import { canonicalTuning } from "./lib/tuning.js";

let manifestPromise = null;
const songCache = new Map();

function normalizeManifestRows(rows) {
  return rows.map((row) => {
    const declared = row.tuningId || row.tuning || row.tuningRaw || "standard";
    const tuning = canonicalTuning(declared);
    return {
      ...row,
      tuning: row.tuning || tuning.id,
      tuningRaw: row.tuningRaw || tuning.spelling,
      tuningId: tuning.id,
      tuningName: row.tuningName || tuning.name,
    };
  });
}

export function loadManifest() {
  if (!manifestPromise) {
    const grab = (url) => fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch(() => []);
    // The personal corpus IS the library when it exists; the public-domain
    // songbook only stands in on copies without one (e.g. the public site).
    manifestPromise = Promise.all([
      grab(`${BASE}songbook/manifest.json`),
      grab(`${BASE}corpus/manifest.json`),
    ]).then(([songbook, corpus]) => normalizeManifestRows(corpus.length ? corpus : songbook));
  }
  return manifestPromise;
}

// The Tab Hunt (dev-only) rebuilds the on-disk index mid-session; dropping the
// memo lets the Library pull the fresh shelf without a page reload.
export function invalidateManifest() {
  manifestPromise = null;
  songCache.clear();
}

export function loadSong(entry, { signal, cache = true } = {}) {
  if (!entry || signal?.aborted) return Promise.resolve(null);
  // The user's own songs live in localStorage, not on disk.
  if (entry.source === "user") return Promise.resolve(userSongbook.get(entry.id));
  const key = `${entry.source}/${entry.id}`;
  if (cache && songCache.has(key)) return Promise.resolve(songCache.get(key));
  const dir = entry.source === "songbook" ? "songbook" : `corpus/${encodeURIComponent(entry.source)}`;
  return fetch(`${BASE}${dir}/${encodeURIComponent(entry.id)}.json`, signal ? { signal } : undefined)
    .then((r) => (r.ok ? r.json() : null))
    .then((song) => { if (signal?.aborted) return null; if (song && cache) { songCache.set(key, song); if (songCache.size > 100) songCache.delete(songCache.keys().next().value); } return song; })
    .catch(() => null);
}

// Collections: one shelf entry that folds a FAMILY of artists, rendered with
// the member bands as its section headers (the album-grouping UI, reused).
// Owner ask 2026-07-15: "a tab that just says Kinsella bands", each song
// referencing its band underneath.
export const COLLECTIONS = {
  "Kinsella Bands": [
    "Cap'n Jazz", "Joan of Arc", "Owls", "Owen", "American Football",
    "Ghosts and Vodka", "Make Believe", "Friend/Enemy", "The Love of Everything",
  ],
};

// Group manifest rows by artist (alphabetical), and within each artist by album
// (chronological via albumOrder). Songs with no album collect into a trailing
// "Other" group so nothing is lost. Collection members then fold into their
// family shelf, with the BAND standing where the album header would.
export function groupByArtist(rows) {
  const byArtist = new Map();
  for (const r of rows) {
    const artist = r.artist || "Various";
    if (!byArtist.has(artist)) byArtist.set(artist, []);
    byArtist.get(artist).push(r);
  }
  const out = [...byArtist.entries()].map(([artist, songs]) => {
    const byAlbum = new Map();
    for (const s of songs) {
      const key = s.album || "\0other";
      if (!byAlbum.has(key)) byAlbum.set(key, { album: s.album || null, order: s.albumOrder ?? 9999, songs: [] });
      const g = byAlbum.get(key);
      g.songs.push(s);
      if ((s.albumOrder ?? 9999) < g.order) g.order = s.albumOrder ?? 9999;
    }
    const albums = [...byAlbum.values()]
      .map((g) => ({ ...g, songs: g.songs.slice().sort((a, b) =>
        (a.trackNumber ?? Infinity) - (b.trackNumber ?? Infinity) || a.title.localeCompare(b.title)) }))
      .sort((a, b) => (a.order - b.order) || (a.album || "~").localeCompare(b.album || "~"));
    return { artist, count: songs.length, albums, multiAlbum: albums.filter((a) => a.album).length > 0 };
  });
  // fold collection members into their family shelf
  for (const [family, members] of Object.entries(COLLECTIONS)) {
    const order = new Map(members.map((m, i) => [m, i]));
    const taken = out.filter((g) => order.has(g.artist));
    if (!taken.length) continue;
    const rest = out.filter((g) => !order.has(g.artist));
    const bands = taken
      .slice()
      .sort((a, b) => order.get(a.artist) - order.get(b.artist))
      .map((g, i) => ({
        album: g.artist, // the band stands where the album header would
        order: i,
        songs: g.albums.flatMap((al) => al.songs).sort((a, b) => a.title.localeCompare(b.title)),
      }));
    rest.push({
      artist: family,
      count: taken.reduce((n, g) => n + g.count, 0),
      albums: bands,
      multiAlbum: true,
    });
    out.length = 0;
    out.push(...rest);
  }
  out.sort((a, b) => a.artist.localeCompare(b.artist));
  return out;
}

// The owner's shelf — the artists he actually covers and plays. Everything
// else in the 7k-song corpus is anthology fill (fake books, Reader's Digest,
// standards composers) and collapses into one "Miscellaneous" group so the
// browse index stays his. Names must match the manifest's normalized artists.
// A future deliberate harvest also earns a shelf spot by sheer size (>= 45
// songs — above the biggest anthology composer, Hammerstein at 40).
const CORE_ARTISTS = new Set([
  "The Beatles", "John Lennon", "Paul McCartney", "George Harrison",
  "Neil Young", "Bob Dylan", "Alex G", "Elliott Smith",
  "Sun Kil Moon", "Red House Painters", "Mark Kozelek",
  "Bonnie Prince Billy", "Palace Music", "Palace Brothers",
  "Grateful Dead", "Pavement", "Wilco", "Uncle Tupelo", "Son Volt",
  "Father John Misty", "Fleetwood Mac", "Big Thief", "Adrianne Lenker", "Buck Meek",
  "Kurt Vile", "Hank Williams", "Waxahatchee", "Plains",
  "Bill Callahan", "Smog", "Grizzly Bear", "Cass McCombs", "Nick Drake",
  "Steely Dan", "MJ Lenderman", "Wednesday", "Iron & Wine",
  "Silver Jews", "Purple Mountains", "Sparklehorse", "Vashti Bunyan",
  "Radiohead", "Magnolia Electric Co.", "Songs: Ohia", "Jason Molina",
  "Jason Isbell", "Jessica Pratt", "Karen Dalton",
  "Chris Cohen", "Deerhoof", "Bon Iver",
  "Taylor Swift", "Tom Petty", "Elton John", "R.E.M.", "Red Hot Chili Peppers",
  "The Cars", "Big Star", "Alex Chilton", "Chet Atkins", "Mastodon",
  "The Beach Boys", "Vince Guaraldi", "Yes", "The Smiths",
  "Crosby, Stills, Nash & Young", "Crosby, Stills & Nash", "Pink Floyd",
  "The Rolling Stones", "Koji Kondo",
  "Will Oldham", "The Velvet Underground", "Lou Reed", "Sonic Youth",
  "Animal Collective", "Panda Bear",
  "The Junior Varsity", "Nirvana", "Ryan Adams", "Whiskeytown", "Jeff Buckley",
  "Kinsella Bands", // the collection shelf (corpus source: kinsella)
  "Coldplay", "Kings of Leon",
]);

export const isCoreArtist = (artist, count = 0) =>
  artist !== "Various" && (CORE_ARTISTS.has(artist) || count >= 45);

// Short source labels for provenance display.
export const SOURCE_LABEL = {
  dylanchords: "dylanchords.com",
  sweetadeline: "sweetadeline.net",
  lennonchords: "oestrem.com",
  hyperrust: "hyperrust.org",
  gumbo: "gumbopages.com",
  ultimateguitar: "ultimate-guitar.com",
  gotabs: "GoTabs",
  guitartabscc: "GuitarTabs.cc",
  coldplaying: "Coldplaying forum",
  guitartabsexplorer: "GuitarTabsExplorer",
  songsterr: "songsterr.com",
  beatlescomplete: "The Beatles Complete",
  bluebook: "Blue Guitar",
  palacefree: "palace.free.fr",
  nickdrake: "nickdraketabs.com",
  sonicyouth: "sonicyouth.com",
  loureed: "loureed.it",
  actabs: "actabs wiki",
  kinsella: "the Kinsella stash",
  local: "local",
  songbook: "public domain",
  user: "your songbook",
  shared: "handed to you",
  ear: "heard from audio",
};
