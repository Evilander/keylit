// retab.js — re-fret a transcription for a DIFFERENT tuning and capo. The
// missing half of the tuning feature: chord sheets always retuned freely,
// but a tab's fret numbers were welded to the tuning they were written in.
// lib/tab.js already turns any tab into absolute pitches; this file searches
// the TARGET fretboard for playable positions to put them back down.
//
// Beam search over columns. Hand realities are the cost model: low positions
// beat high ones, open strings are free, the fretting hand spans four frets,
// and it hates leaping. Honesty is structural: a pitch that can't exist in
// the target tuning gets octave-rescued and FLAGGED, or dropped and FLAGGED
// — never silently wrong (a wrong note is worse than a missing feature).
import { getTuning, tuningSpelling } from "./tuning.js";
import { parseTab } from "./tab.js";

const SPAN = 4;      // frets a normal hand covers (excluding opens)
const BEAM = 8;

/** All playable (string, fret) spots for a pitch in a tuning+capo. */
function spotsFor(midi, opens, capo, maxFret) {
  const out = [];
  for (let s = 0; s < opens.length; s++) {
    const fret = midi - (opens[s] + capo);
    if (fret >= 0 && fret <= maxFret) out.push({ string: s, fret });
  }
  return out;
}

/** Enumerate chord assignments: pitches (sorted low→high) onto strictly
 * ascending strings, span-limited. Returns [{ notes, span, pos, opens }]. */
function assignmentsFor(notes, opens, capo, maxFret) {
  const out = [];
  const rec = (i, minString, acc) => {
    if (out.length > 64) return; // plenty — the cost sort picks from these
    if (i === notes.length) {
      const fretted = acc.filter((a) => a.fret > 0).map((a) => a.fret);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > SPAN) return;
      const pos = fretted.length ? fretted.reduce((x, y) => x + y, 0) / fretted.length : 0;
      out.push({ notes: acc.slice(), span, pos, opens: acc.length - fretted.length });
      return;
    }
    for (const spot of spotsFor(notes[i].midi, opens, capo, maxFret)) {
      if (spot.string < minString) continue;
      acc.push({ ...notes[i], string: spot.string, fret: spot.fret });
      rec(i + 1, spot.string + 1, acc);
      acc.pop();
    }
  };
  rec(0, 0, []);
  return out;
}

const placeCost = (a) => a.pos * 0.8 + a.span * 2.2 - a.opens * 1.2 +
  a.notes.reduce((n, x) => n + (x.fret > 12 ? 0.5 : 0), 0);
const moveCost = (prev, a) => {
  if (!prev) return 0;
  let c = Math.abs(a.pos - prev.pos) * 1.4;
  if (a.notes.length === 1 && prev.lastString != null) {
    c += Math.abs(a.notes[0].string - prev.lastString) * 0.6;
  }
  return c;
};

/**
 * Assign a stream of columns [{ col, notes: [{ midi, tech? }] }] to a target
 * fretboard. Returns { columns, summary } where each column carries assigned
 * notes { midi, string, fret, tech, octaveShifted? } plus dropped[] pitches,
 * and summary counts every compromise out loud.
 */
export function assignColumns(columns, { tuningId, capo = 0, maxFret = 22 } = {}) {
  const tuning = getTuning(tuningId);
  const opens = tuning.notes;
  const summary = { shifted: 0, dropped: 0, columns: columns.length };

  // per-column: rescue unplayable pitches by octave, or drop them — flagged
  const prepared = columns.map((c) => {
    const ok = [];
    const dropped = [];
    for (const n of [...c.notes].sort((a, b) => a.midi - b.midi)) {
      if (spotsFor(n.midi, opens, capo, maxFret).length) { ok.push({ ...n }); continue; }
      const up = n.midi + 12, down = n.midi - 12;
      if (n.midi < opens[0] + capo && spotsFor(up, opens, capo, maxFret).length) {
        ok.push({ ...n, midi: up, octaveShifted: 1 });
        summary.shifted++;
      } else if (spotsFor(down, opens, capo, maxFret).length) {
        ok.push({ ...n, midi: down, octaveShifted: -1 });
        summary.shifted++;
      } else {
        dropped.push(n.midi);
        summary.dropped++;
      }
    }
    // same pitch rescued onto an existing pitch → collapse duplicates
    const seen = new Set();
    return { col: c.col, notes: ok.filter((n) => (seen.has(n.midi) ? false : seen.add(n.midi))), dropped };
  });

  // beam search
  let states = [{ cost: 0, prev: null, placed: null, pos: 0, lastString: null }];
  const history = [];
  for (const col of prepared) {
    if (!col.notes.length) { history.push(null); continue; }
    const options = assignmentsFor(col.notes, opens, capo, maxFret);
    if (!options.length) {
      // a chord whose members are individually playable but not TOGETHER —
      // keep the most notes we can (greedy from the bass), flag the rest
      const kept = [];
      let minString = 0;
      for (const n of col.notes) {
        const spot = spotsFor(n.midi, opens, capo, maxFret).find((s) => s.string >= minString);
        if (spot) { kept.push({ ...n, ...spot }); minString = spot.string + 1; }
        else { col.dropped.push(n.midi); summary.dropped++; }
      }
      col.notes = kept;
      history.push([{ notes: kept, pos: 0, span: 0, opens: 0 }]);
      // add a real chain link so the backtracker consumes exactly one step here
      states = states.map((st) => ({ cost: st.cost, prev: st, placed: 0, pos: st.pos, lastString: st.lastString }));
      continue;
    }
    const next = [];
    for (const st of states) {
      for (let oi = 0; oi < options.length; oi++) {
        const a = options[oi];
        next.push({
          cost: st.cost + placeCost(a) + moveCost(st, a),
          prev: st,
          placed: oi,
          pos: a.pos || st.pos,
          lastString: a.notes.length === 1 ? a.notes[0].string : st.lastString,
        });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    states = next.slice(0, BEAM);
    history.push(options);
  }

  // backtrack the winner
  const picks = [];
  let cur = states[0];
  for (let i = prepared.length - 1; i >= 0; i--) {
    if (history[i] === null) { picks[i] = null; continue; }
    picks[i] = history[i][cur.placed]?.notes ?? [];
    cur = cur.prev || cur;
  }

  const outCols = prepared.map((c, i) => ({
    col: c.col,
    notes: picks[i] ? picks[i].map((n) => ({ midi: n.midi, string: n.string, fret: n.fret, tech: n.tech, octaveShifted: n.octaveShifted })) : [],
    dropped: c.dropped,
  }));
  return { columns: outCols, tuning, capo, summary };
}

/**
 * Render assigned columns back to ASCII, string labels included, high string
 * on top (the convention). Chunks into systems. The output re-parses through
 * parseTabBlock to the same pitches — test-enforced.
 */
export function renderAscii({ columns, tuning, capo }, { perSystem = 20 } = {}) {
  const nStrings = tuning.notes.length;
  const labels = tuningSpelling(tuning.notes).split(" "); // low → high
  const width = Math.max(...labels.map((l) => l.length));
  const systems = [];
  for (let start = 0; start < columns.length; start += perSystem) {
    const chunk = columns.slice(start, start + perSystem);
    const rows = [];
    for (let row = 0; row < nStrings; row++) {
      const stringLowIdx = nStrings - 1 - row; // top row = highest string
      let line = `${labels[stringLowIdx].padEnd(width)}|`;
      for (const c of chunk) {
        const hit = c.notes.find((n) => n.string === stringLowIdx);
        const cellW = Math.max(...chunk.map((cc) => cc.notes.reduce((w, n) => Math.max(w, String(n.fret).length + (n.tech ? 1 : 0)), 1)), 1);
        const cell = hit ? `${hit.fret}${hit.tech || ""}` : "";
        line += `-${cell.padEnd(cellW, "-")}-`;
      }
      rows.push(`${line}|`);
    }
    systems.push(rows.join("\n"));
  }
  const head = capo ? `Capo ${capo}\n` : "";
  return `${head}${systems.join("\n\n")}\n`;
}

/**
 * The whole move: tab text in its source tuning/capo → new text in the
 * target. Returns { text, summary } or null when the input has no tab.
 */
export function retabText(text, { from = {}, to } = {}) {
  const parsed = parseTab(text, { tuning: from.tuning, capo: from.capo });
  if (!parsed.blocks.length) return null;
  const pieces = [];
  const summary = { shifted: 0, dropped: 0, blocks: parsed.blocks.length };
  for (const block of parsed.blocks) {
    const assigned = assignColumns(block.events, { tuningId: to.tuning, capo: to.capo || 0 });
    summary.shifted += assigned.summary.shifted;
    summary.dropped += assigned.summary.dropped;
    pieces.push(renderAscii(assigned));
  }
  return { text: pieces.join("\n"), summary };
}

/**
 * Re-fret a whole DOCUMENT in place: every tab block is replaced with its
 * target-tuning rendering while lyrics, chords, and section headers around
 * them stay exactly where they were. Returns { text, summary } or null.
 * The result is written FOR the target tuning — a copy saved from it must
 * declare that tuning or every player downstream will misread the frets.
 */
export function swapTabBlocks(text, { from = {}, to } = {}) {
  const src = String(text || "");
  const blocks = (() => {
    // findTabBlocks works on the UNWRAPPED text; to splice safely we need
    // ranges in the ORIGINAL line array, so re-locate each block there.
    const parsed = parseTab(src, { tuning: from.tuning, capo: from.capo });
    return parsed.blocks;
  })();
  if (!blocks.length) return null;

  const lines = src.split(/\r?\n/);
  const summary = { shifted: 0, dropped: 0, blocks: blocks.length };
  // replace each block's exact source lines (block.lines) with the rendering
  let out = lines.slice();
  for (const block of blocks) {
    const assigned = assignColumns(block.events, { tuningId: to.tuning, capo: to.capo || 0 });
    summary.shifted += assigned.summary.shifted;
    summary.dropped += assigned.summary.dropped;
    const rendered = renderAscii(assigned, { perSystem: Math.max(8, block.events.length) }).trimEnd().split("\n");
    // find this block's lines in the current output by exact match run
    const first = out.findIndex((l, i) => block.lines.every((bl, j) => out[i + j] === bl));
    if (first >= 0) out = [...out.slice(0, first), ...rendered, ...out.slice(first + block.lines.length)];
  }
  return { text: out.join("\n"), summary };
}
