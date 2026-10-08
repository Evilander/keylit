// Bounded chart loading for an album session. All charts must resolve before saving.
export async function loadAlbumCharts(rows, { loadSong, signal, timeoutMs = 15000 }) {
  const controller = new AbortController();
  let rejectStop;
  const stopped = new Promise((_, reject) => { rejectStop = reject; });
  const cancel = () => {
    controller.abort();
    rejectStop(new Error("Chart loading was cancelled."));
  };
  const timeout = setTimeout(() => {
    controller.abort();
    rejectStop(new Error("Charts took too long to load. Check the connection and try again."));
  }, timeoutMs);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const songs = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length && !controller.signal.aborted) {
      const index = next++;
      const row = rows[index];
      const song = await loadSong(row, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!song || typeof song.body !== "string" || !song.body.trim()) throw new Error(`Could not load ${row.title}. Choose another chart or try again.`);
      songs[index] = song;
    }
  };
  try {
    return await Promise.race([
      Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker)).then(() => songs),
      stopped,
    ]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
