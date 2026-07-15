// click.js — the metronome's pure brain: meters, subdivisions, tap tempo,
// tempo names. No audio, no DOM (prime directive 2); src/audio/metronome.js
// turns these patterns into sound.
//
// Model: a bar is a row of PULSES (the finest grid the meter needs). Each
// pulse is an accent (bar start / group start), a beat, or a sub. bpm always
// names the felt BEAT — quarters in x/4, the dotted quarter in 6/8 — so
// pulsesPerBeat tells the scheduler how to slice a beat into pulses.

/** The meters a working musician actually reaches for. Grouped meters carry
 * their default feel in the label; the grouping is the accent map. */
export const METERS = [
  { id: "4/4", label: "4/4", pulsesPerBar: 4, pulsesPerBeat: 1, groups: [4], simple: true },
  { id: "3/4", label: "3/4", pulsesPerBar: 3, pulsesPerBeat: 1, groups: [3], simple: true },
  { id: "2/4", label: "2/4", pulsesPerBar: 2, pulsesPerBeat: 1, groups: [2], simple: true },
  // 6/8: two dotted-quarter beats, each three 8th pulses. bpm = the TWO.
  { id: "6/8", label: "6/8", pulsesPerBar: 6, pulsesPerBeat: 3, groups: [3, 3], simple: false },
  { id: "5/4", label: "5/4 (3+2)", pulsesPerBar: 5, pulsesPerBeat: 1, groups: [3, 2], simple: true },
  { id: "7/8", label: "7/8 (2+2+3)", pulsesPerBar: 7, pulsesPerBeat: 2, groups: [2, 2, 3], simple: false },
];

export const meterById = (id) => METERS.find((m) => m.id === id) || METERS[0];

/**
 * Build one bar of click steps for a meter.
 * subdivision (1|2|3|4) only applies to simple meters — grouped/compound
 * meters already tick their own inner pulses.
 *
 * Returns { steps: [{ t, kind }], totalPulses, pulsesPerBeat } where t is in
 * PULSE units from the bar start and kind ∈ "accent" | "beat" | "sub".
 */
export function clickPattern(meterId, subdivision = 1) {
  const m = meterById(meterId);
  const groupStarts = new Set();
  let at = 0;
  for (const g of m.groups) { groupStarts.add(at); at += g; }

  const steps = [];
  if (m.simple && subdivision > 1) {
    // pulses are beats; slice each into `subdivision` even ticks
    for (let p = 0; p < m.pulsesPerBar; p++) {
      for (let s = 0; s < subdivision; s++) {
        const t = p + s / subdivision;
        const kind = s !== 0 ? "sub" : p === 0 ? "accent" : groupStarts.has(p) ? "accent" : "beat";
        steps.push({ t, kind });
      }
    }
    return { steps, totalPulses: m.pulsesPerBar, pulsesPerBeat: 1, subdivision };
  }

  for (let p = 0; p < m.pulsesPerBar; p++) {
    const kind = p === 0 ? "accent"
      : groupStarts.has(p) ? (m.simple ? "accent" : "beat")
      : m.simple ? "beat" : "sub";
    steps.push({ t: p, kind });
  }
  // In grouped simple meters (5/4), group starts accent and the rest are
  // beats. In compound meters (6/8, 7/8), group starts are the felt beats
  // and inner pulses are subs — the bar start alone carries the accent.
  if (!m.simple) {
    for (const s of steps) {
      if (s.t !== 0 && groupStarts.has(s.t)) s.kind = "beat";
    }
  }
  return { steps, totalPulses: m.pulsesPerBar, pulsesPerBeat: m.pulsesPerBeat, subdivision: 1 };
}

/** Seconds per PULSE for a meter at a given felt-beat bpm. */
export function secondsPerPulse(meterId, bpm) {
  const m = meterById(meterId);
  return 60 / Math.max(1, bpm) / m.pulsesPerBeat;
}

/**
 * Tap tempo: feed the raw tap timestamps (ms), get a bpm or null.
 * Only the taps after the last long silence (>2s) count; the median interval
 * wins so one nervous tap can't drag the tempo.
 */
export function tapTempo(times, { minBpm = 30, maxBpm = 260 } = {}) {
  if (!times || times.length < 2) return null;
  const recent = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 2000 || dt <= 0) recent.length = 0; // silence resets the count
    else recent.push(dt);
  }
  if (!recent.length) return null;
  const last = recent.slice(-6).sort((a, b) => a - b);
  const median = last.length % 2
    ? last[(last.length - 1) / 2]
    : (last[last.length / 2 - 1] + last[last.length / 2]) / 2;
  const bpm = Math.round(60000 / median);
  return Math.max(minBpm, Math.min(maxBpm, bpm));
}

/** The Italian on the dial — because a metronome without Andante is a timer. */
export function tempoName(bpm) {
  if (bpm <= 45) return "Grave";
  if (bpm <= 60) return "Largo";
  if (bpm <= 76) return "Adagio";
  if (bpm <= 108) return "Andante";
  if (bpm <= 120) return "Moderato";
  if (bpm <= 156) return "Allegro";
  if (bpm <= 176) return "Vivace";
  if (bpm <= 200) return "Presto";
  return "Prestissimo";
}
