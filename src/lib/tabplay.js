// tabplay.js — the rhythm an ASCII tab actually carries: COLUMN SPACING.
// A transcriber spaces wider for longer holds — it's the only timing the
// format has, so we play it as what it honestly is: a spacing-derived
// approximation, not a score. TabKeys' even-interval walk treats every
// column alike; this module turns the columns into engine.playEvents
// schedules ({ t, dur, midis } in BEATS) that keep the transcriber's holds.
// Pure (no React/audio/DOM/network).

/**
 * The tab's own pulse: the most common (mode) gap between event columns.
 * Ties break toward the SMALLEST gap — a run of tight pairs defines the
 * unit even when long holds outnumber them at some other width.
 */
export function stepUnit(events) {
  const gaps = new Map();
  for (let i = 1; i < events.length; i++) {
    const g = events[i].col - events[i - 1].col;
    if (g > 0) gaps.set(g, (gaps.get(g) || 0) + 1);
  }
  let unit = 1, best = 0;
  for (const [g, n] of [...gaps.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > best) { best = n; unit = g; }
  }
  return unit;
}

/**
 * Column-spaced events → a playable schedule in BEATS.
 * blockEvents: [{ col, notes: [{ midi }] }] from parseTabBlock.
 * Returns { events: [{ t, dur, midis, i }], totalBeats } — `i` is the
 * source column index so a UI can light the matching position while it plays.
 *
 * stepsPerBeat: spacing units per beat (2 → each unit reads as an eighth).
 * maxHold: cap (in beats) so a formatting hole can't freeze the playback.
 * shift: semitone transpose (the app's transpose follows the tab here).
 */
export function tabEvents(blockEvents, { stepsPerBeat = 2, shift = 0, maxHold = 4 } = {}) {
  const evs = (blockEvents || []).filter((e) => e.notes?.length);
  if (!evs.length) return { events: [], totalBeats: 0 };
  const unit = stepUnit(evs);
  const maxSteps = Math.max(1, Math.round(maxHold * stepsPerBeat));

  // steps between consecutive events; the last note gets one unit to ring
  const steps = [];
  for (let i = 1; i < evs.length; i++) {
    const g = evs[i].col - evs[i - 1].col;
    steps.push(Math.max(1, Math.min(maxSteps, Math.round(g / unit))));
  }
  steps.push(1);

  const events = [];
  let t = 0;
  for (let i = 0; i < evs.length; i++) {
    const dur = steps[i] / stepsPerBeat; // legato: hold until the next attack
    events.push({ t, dur, midis: evs[i].notes.map((n) => n.midi + shift), i });
    t += dur;
  }
  return { events, totalBeats: t };
}

/**
 * A whole parsed document (parseTab result) as playable blocks:
 * [{ index, events, totalBeats, count }] — event-less blocks (legends,
 * pure-dash diagrams) are skipped, and `index` keeps the original block
 * number so a UI can name them "riff 1 / riff 2 / …" faithfully.
 */
export function tabBlocks(parsed, opts = {}) {
  const out = [];
  (parsed?.blocks || []).forEach((b, index) => {
    if (!b.events?.length) return;
    const { events, totalBeats } = tabEvents(b.events, opts);
    if (!events.length) return;
    out.push({ index, events, totalBeats, count: events.length });
  });
  return out;
}
