// bench.js — the Bench Book's honest math. No SRS cosplay: a song is "cold"
// in proportion to how long it's sat AND how rough it was last time. Pure;
// the localStorage side lives in storage.js (createBenchBook).

const DAY = 24 * 60 * 60 * 1000;

// One identity for a song everywhere (play-along logs, setlists, manifests).
export function slugSongKey(artist, title) {
  const raw = `${artist || ""} ${title || ""}`;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-chart";
}

export function practiceStats(log) {
  const stats = new Map();
  for (const e of log || []) {
    let s = stats.get(e.songKey);
    if (!s) { s = { songKey: e.songKey, title: e.title, artist: e.artist || null, count: 0, lastAt: 0, lastAccuracy: null, bestAccuracy: null }; stats.set(e.songKey, s); }
    s.count += 1;
    if ((e.at || 0) >= s.lastAt) {
      s.lastAt = e.at || 0;
      s.lastAccuracy = typeof e.accuracy === "number" ? e.accuracy : null;
      s.title = e.title || s.title;
      s.artist = e.artist || s.artist;
    }
    if (typeof e.accuracy === "number" && (s.bestAccuracy === null || e.accuracy > s.bestAccuracy)) s.bestAccuracy = e.accuracy;
  }
  return stats;
}

// score = days-since × (1.25 − last accuracy). A perfect pass still cools at
// 0.25×days; an accuracy-less "ran it" counts as a middling 0.6.
export function coldSongs(log, now, { limit = 8 } = {}) {
  const out = [];
  for (const s of practiceStats(log).values()) {
    const daysSince = Math.max(0, (now - s.lastAt) / DAY);
    const acc = s.lastAccuracy === null ? 0.6 : s.lastAccuracy;
    out.push({
      songKey: s.songKey, title: s.title, artist: s.artist,
      daysSince: Math.round(daysSince), lastAccuracy: s.lastAccuracy,
      count: s.count, score: daysSince * (1.25 - acc),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
