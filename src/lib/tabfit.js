// tabfit.js — where does this transcription actually SIT? CapoAdvisor
// answers that for chord SHAPES; this is the tab analog, judged on the real
// notes: re-fret the whole transcription into each candidate setup with
// retab's beam search and score the result like a hand would feel it —
// drops are near-disqualifying, octave rescues cost, low positions and open
// strings win. Pure (no React/audio/DOM/network).
import { assignColumns } from "./retab.js";
import { getTuning } from "./tuning.js";

/** The setups a guitarist actually reaches for. Unique (tuning, capo). */
export const HOME_CANDIDATES = [
  { tuning: "standard", capo: 0 },
  { tuning: "standard", capo: 2 },
  { tuning: "ebStandard", capo: 0 },
  { tuning: "dStandard", capo: 0 },
  { tuning: "dropD", capo: 0 },
  { tuning: "dropD", capo: 2 },
  { tuning: "dropC", capo: 0 },
  { tuning: "DADGAD", capo: 0 },
  { tuning: "openG", capo: 0 },
  { tuning: "openD", capo: 0 },
];

const WEIGHTS = { drop: 40, shift: 6, pos: 1.6, span: 1.2, open: -8 };

function verdictFor(h) {
  const bits = [];
  if (h.dropped > 0) bits.push(`you'd lose ${h.dropped} note${h.dropped === 1 ? "" : "s"}`);
  else if (h.shifted > 0) bits.push(`everything survives (${h.shifted} octave-moved)`);
  else bits.push("every note survives as written");
  if (h.openRatio >= 0.35) bits.push(`${Math.round(h.openRatio * 100)}% falls on open strings`);
  if (h.avgPos > 0) bits.push(`hand lives around fret ${Math.round(h.avgPos)}`);
  return bits.join(" · ");
}

/**
 * Rank candidate setups for a parsed tab (parseTab(...).blocks).
 * Returns [{ tuning, capo, score, dropped, shifted, avgPos, openRatio,
 * verdict }] ascending by score (best first). `blocksJudged` says how much
 * of the song the ranking saw (long tabs are sampled, never silently).
 */
export function tabHomes(blocks, { candidates = HOME_CANDIDATES, maxResults = 5, maxBlocks = 8, maxEvents = 128, sourceCapo = 0 } = {}) {
  const playable = (blocks || []).filter((b) => b.events?.length);
  if (!playable.length) return [];
  // Budget whole time columns: simultaneous notes must never be split.
  const eventsTotal = playable.reduce((n, b) => n + b.events.length, 0);
  let remaining = Math.max(1, Math.min(128, Math.floor(maxEvents) || 128));
  const judged = [];
  for (const b of playable.slice(0, maxBlocks)) {
    if (!remaining) break;
    const events = b.events.slice(0, remaining);
    judged.push({ ...b, events });
    remaining -= events.length;
  }
  const eventsJudged = judged.reduce((n, b) => n + b.events.length, 0);

  const homes = [];
  for (const cand of candidates) {
    const tuning = getTuning(cand.tuning);
    let dropped = 0, shifted = 0, posSum = 0, fretted = 0, opens = 0, spanSum = 0, cols = 0;
    for (const b of judged) {
      const a = assignColumns(b.events, { tuningId: cand.tuning, capo: cand.capo });
      dropped += a.summary.dropped;
      shifted += a.summary.shifted;
      for (const c of a.columns) {
        if (!c.notes.length) continue;
        cols++;
        const frets = c.notes.map((n) => n.fret);
        const nz = frets.filter((f) => f > 0);
        opens += frets.length - nz.length;
        fretted += nz.length;
        posSum += nz.reduce((s, f) => s + f, 0);
        if (nz.length > 1) spanSum += Math.max(...nz) - Math.min(...nz);
      }
    }
    const notes = fretted + opens;
    const avgPos = fretted ? posSum / fretted : 0;
    const openRatio = notes ? opens / notes : 0;
    const score =
      dropped * WEIGHTS.drop +
      shifted * WEIGHTS.shift +
      avgPos * WEIGHTS.pos +
      (cols ? spanSum / cols : 0) * WEIGHTS.span +
      openRatio * WEIGHTS.open;
    const h = { tuning, capo: cand.capo, score, dropped, shifted, avgPos, openRatio };
    h.verdict = (eventsJudged < eventsTotal ? "In the sample: " : "") + verdictFor(h);
    homes.push(h);
  }
  homes.sort((a, b) => a.score - b.score);
  const out = homes.slice(0, maxResults);
  out.blocksJudged = judged.length;
  out.blocksTotal = playable.length;
  out.eventsJudged = eventsJudged;
  out.eventsTotal = eventsTotal;
  // keep the honesty visible even after the array is spread/copied
  return Object.assign(out, { sourceCapo });
}
