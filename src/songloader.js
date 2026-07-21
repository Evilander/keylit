// Song loading has state only so normal Song navigation can reject a late
// promise. The resolver remains stateless and preserves the source/id address.

const UNADDRESSABLE_SOURCES = new Set(["shared", "ear"]);

export async function resolveSongData(entry, { loadSong }) {
  if (!entry || typeof entry.source !== "string" || !entry.source || entry.id == null || entry.id === "" || UNADDRESSABLE_SOURCES.has(entry.source)) return null;
  const song = await loadSong(entry);
  return song ? { ...song, id: song.id ?? entry.id, source: song.source ?? entry.source } : null;
}

export function createLatestSongLoader({ resolveSong, onAccept, onMissing }) {
  let generation = 0;
  return {
    async open(entry, context = null) {
      const request = ++generation;
      let song = null;
      try { song = await resolveSong(entry); } catch { song = null; }
      if (request !== generation) return null;
      if (song) onAccept?.(song, entry, context);
      else onMissing?.(entry, context);
      return song;
    },
    invalidate() { generation += 1; },
  };
}
