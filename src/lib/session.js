// session.js — the pure brain of The Session: a band that HEARS you and
// carries you. The lineage is the Irish session and the old-time circle —
// the tune goes around whether you keep up or not; nobody stops; nobody
// grades. Software's music-learning tools all chose the other lineage (the
// conservatory exam: stop, score, judge). This is the unfound middle, built
// on the entrainment evidence that synchronizing with other players is its
// own reward.
//
// Two pure pieces: the LOCK METER (are your notes landing in the chord and
// on the grid?) and the DENSITY LADDER (the arrangement thins to a heartbeat
// when you drift, fills as you lock — with hysteresis so it breathes rather
// than flaps). No audio here (prime directive 2).

const pcsOf = (ch) => {
  const set = new Set(ch.intervals.map((i) => (ch.rootSemitone + i) % 12));
  if (ch.bassSemitone !== null) set.add(ch.bassSemitone);
  return set;
};

/** Score one played note against the chord under it and the beat grid.
 * Chord-tone × on-grid = 1.0; wrong pitch or loose time cost, never zero —
 * a session forgives. */
export function noteScore(midi, tBeat, chord, { grid = 0.5 } = {}) {
  const pitch = chord && pcsOf(chord).has(((midi % 12) + 12) % 12) ? 1 : 0.25;
  const off = Math.abs(tBeat / grid - Math.round(tBeat / grid)) * grid;
  const time = off <= 0.12 ? 1 : off <= 0.22 ? 0.6 : 0.3;
  return pitch * time;
}

/**
 * The lock meter: exponential average of note scores, decaying in silence.
 * feed(score) on every played note; tick(beatsElapsedSinceLastTick) as time
 * passes. lock() ∈ [0,1].
 */
export function createLockMeter({ alpha = 0.25, silentDecayPerBeat = 0.94 } = {}) {
  let lock = 0;
  let notes = 0;
  return {
    feed(score) {
      notes++;
      lock = lock + alpha * (score - lock);
    },
    tick(beats) {
      if (beats > 0) lock *= Math.pow(silentDecayPerBeat, beats);
    },
    lock: () => Math.max(0, Math.min(1, lock)),
    notes: () => notes,
  };
}

/** The ladder: 0 heartbeat · 1 shells · 2 groove · 3 full band. */
export const TIERS = [
  { id: 0, name: "heartbeat", line: "just the floor — find your feet" },
  { id: 1, name: "shells", line: "the piano sketches the changes with you" },
  { id: 2, name: "groove", line: "the kit's in — it heard you lock" },
  { id: 3, name: "full band", line: "everybody's playing. this is the circle" },
];

/** Tier from lock with hysteresis: climbing needs +margin over the line,
 * falling needs −margin under it — the band breathes, it doesn't flap. */
export function tierFor(lock, prevTier = 0, { margin = 0.06 } = {}) {
  const lines = [0.25, 0.5, 0.75]; // boundaries between tiers
  let target = 0;
  for (const l of lines) if (lock >= l) target++;
  if (target > prevTier) {
    // must clear the boundary by the margin to climb
    return lock >= lines[prevTier] + margin ? prevTier + 1 : prevTier;
  }
  if (target < prevTier) {
    return lock <= lines[prevTier - 1] - margin ? prevTier - 1 : prevTier;
  }
  return prevTier;
}

/**
 * Filter one window of arrangeBand events down to a tier. Tiers strictly
 * nest: heartbeat ⊂ shells ⊂ groove ⊂ full. Heartbeat = bass on the ONE
 * (plus the kick that carries it); shells add downbeat piano; groove adds
 * the whole kit; full is the arrangement untouched.
 */
export function eventsForTier(events, tier, beatsPerBar = 4) {
  return (events || []).filter((e) => {
    const inBar = ((e.t % beatsPerBar) + beatsPerBar) % beatsPerBar;
    if (tier >= 3) return true;
    if (e.ch === "bass") {
      if (tier >= 1) return true;
      return inBar < 0.01; // heartbeat: the ONE only
    }
    if (e.ch === "drums") {
      if (tier >= 2) return true;
      return inBar < 0.01 && e.midis?.includes(36); // the kick under the ONE
    }
    // piano
    if (tier <= 0) return false;
    if (tier === 1) return Number.isInteger(e.t) && inBar % 2 === 0; // downbeat shells
    return true;
  });
}
