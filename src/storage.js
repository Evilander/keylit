// storage.js — tiny song library backed by localStorage. Kept OUT of lib/ on
// purpose: lib/ is pure, this touches a browser API. A song is { id, name,
// sheet, savedAt }. Inject a backend (Map-like) for tests.

const KEY = "keylit.songs.v1";

function memoryBackend() {
  let store = "";
  return { getItem: () => store, setItem: (_k, v) => { store = v; } };
}

export function createLibrary(backend) {
  const be = backend || (typeof localStorage !== "undefined" ? localStorage : memoryBackend());

  const read = () => {
    try { return JSON.parse(be.getItem(KEY) || "[]"); } catch { return []; }
  };
  const write = (songs) => be.setItem(KEY, JSON.stringify(songs));

  return {
    list() { return read().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); },
    get(id) { return read().find((s) => s.id === id) || null; },
    save({ name, sheet, savedAt }) {
      const songs = read();
      const id = `${(name || "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${(savedAt || 0).toString(36)}`;
      const song = { id, name: name || "Untitled", sheet: sheet || "", savedAt: savedAt || 0 };
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
