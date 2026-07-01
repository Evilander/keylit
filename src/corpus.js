// corpus.js — loads the bundled tab/chord library from /public/corpus.
// The manifest is a small index (no song bodies) for fast browsing; each song's
// body is fetched lazily on open. Kept OUT of lib/ (touches fetch). Degrades to
// an empty library if the corpus isn't present.

let manifestPromise = null;
const songCache = new Map();

export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/corpus/manifest.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch(() => []);
  }
  return manifestPromise;
}

export function loadSong(entry) {
  if (!entry) return Promise.resolve(null);
  const key = `${entry.source}/${entry.id}`;
  if (songCache.has(key)) return Promise.resolve(songCache.get(key));
  return fetch(`/corpus/${entry.source}/${entry.id}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((song) => { if (song) songCache.set(key, song); return song; })
    .catch(() => null);
}

// Group manifest rows by artist, alphabetised, each artist's songs title-sorted.
export function groupByArtist(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.artist)) by.set(r.artist, []);
    by.get(r.artist).push(r);
  }
  const out = [...by.entries()].map(([artist, songs]) => ({
    artist,
    songs: songs.slice().sort((a, b) => a.title.localeCompare(b.title)),
  }));
  out.sort((a, b) => a.artist.localeCompare(b.artist));
  return out;
}

// Short source labels for provenance display.
export const SOURCE_LABEL = {
  dylanchords: "dylanchords.com",
  sweetadeline: "sweetadeline.net",
  lennonchords: "oestrem.com",
  hyperrust: "hyperrust.org",
  gumbo: "gumbopages.com",
  ultimateguitar: "ultimate-guitar.com",
  bluebook: "Blue Guitar",
  local: "local",
};
