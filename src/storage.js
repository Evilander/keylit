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

/* ---- the user songbook: full corpus-shaped records for the Library ------ */
const USER_KEY = "keylit.usersongs.v1";

export function createUserSongbook(backend) {
  const be = backend || (typeof localStorage !== "undefined" ? localStorage : memoryBackend());
  const read = () => {
    try { return JSON.parse(be.getItem(USER_KEY) || "[]"); } catch { return []; }
  };
  const write = (songs) => be.setItem(USER_KEY, JSON.stringify(songs));

  return {
    /** Light manifest rows (no bodies) for the Library listing. */
    rows() { return read().map(({ body, ...row }) => row); },
    get(id) { return read().find((s) => s.id === id) || null; },
    /** Save { song, row } from buildUserSong — same id replaces (edit). */
    save(song, row) {
      write(read().filter((s) => s.id !== song.id).concat({ ...song, ...row }));
    },
    remove(id) { write(read().filter((s) => s.id !== id)); },
  };
}

export const userSongbook = createUserSongbook();

/* ---- the Bench Book: setlists + practice log ---------------------------- */
// Musician-shaped memory: what's on tonight's bench, and what actually got
// practiced (play-along scores land here). One key, one JSON blob, capped.
const BENCH_KEY = "keylit.bench.v1";
const LOG_CAP = 500;

export function createBenchBook(backend) {
  const be = backend || (typeof localStorage !== "undefined" ? localStorage : memoryBackend());
  const read = () => {
    try {
      const v = JSON.parse(be.getItem(BENCH_KEY) || "{}");
      return { setlists: Array.isArray(v.setlists) ? v.setlists : [], log: Array.isArray(v.log) ? v.log : [] };
    } catch { return { setlists: [], log: [] }; }
  };
  const write = (state) => be.setItem(BENCH_KEY, JSON.stringify(state));
  const withSetlist = (id, fn) => {
    const st = read();
    const sl = st.setlists.find((s) => s.id === id);
    if (sl) { fn(sl); write(st); }
  };

  return {
    setlists() { return read().setlists; },
    createSetlist(name, now) {
      const st = read();
      const sl = { id: `sl-${(now || 0).toString(36)}-${st.setlists.length}`, name: name || "Setlist", songs: [], notes: "", createdAt: now || 0 };
      st.setlists.push(sl);
      write(st);
      return sl;
    },
    renameSetlist(id, name) { withSetlist(id, (sl) => { sl.name = name || sl.name; }); },
    removeSetlist(id) { const st = read(); st.setlists = st.setlists.filter((s) => s.id !== id); write(st); },
    setSetlistNotes(id, notes) { withSetlist(id, (sl) => { sl.notes = notes || ""; }); },
    /** song: { songKey, title, artist, ...display extras } — songKey dedupes. */
    addToSetlist(id, song) {
      withSetlist(id, (sl) => {
        if (!sl.songs.some((s) => s.songKey === song.songKey)) sl.songs.push(song);
      });
    },
    removeFromSetlist(id, songKey) { withSetlist(id, (sl) => { sl.songs = sl.songs.filter((s) => s.songKey !== songKey); }); },
    /** dir: -1 moves the song at idx up, +1 down. */
    moveInSetlist(id, idx, dir) {
      withSetlist(id, (sl) => {
        const j = idx + dir;
        if (idx < 0 || idx >= sl.songs.length || j < 0 || j >= sl.songs.length) return;
        const [s] = sl.songs.splice(idx, 1);
        sl.songs.splice(j, 0, s);
      });
    },
    /** entry: { songKey, title, artist?, at, kind: "playalong"|"ran-it", accuracy?, total?, clean? } */
    logPractice(entry) {
      const st = read();
      st.log.push(entry);
      if (st.log.length > LOG_CAP) st.log = st.log.slice(st.log.length - LOG_CAP);
      write(st);
    },
    log(songKey) {
      const all = read().log.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
      return songKey ? all.filter((e) => e.songKey === songKey) : all;
    },
  };
}

export const benchBook = createBenchBook();
