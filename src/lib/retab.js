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
import { canonicalTuning, detectDeclaredTuning, getTuning, tuningSpelling } from "./tuning.js";
import { parseTab, parseTabBlock, findTabBlocks, unwrapTab } from "./tab.js";
import { chordSymbol, detectCapo, resolveCapo, transposeChord } from "./theory.js";
import { chartOutline } from "./chartlines.js";

export function retabForSetup(text, { from = {}, to = {}, transpose = 0 } = {}) {
  const sourceTuning = from.tuning || detectDeclaredTuning(text) || "standard";
  const dst = canonicalTuning(to.tuning || "standard");
  const srcCapo = resolveCapo(text, from.capo);
  const dstCapo = resolveCapo("", to.capo);
  const parsed = parseTab(text, { defaultTuning: sourceTuning, capo: srcCapo });
  const src = parsed.tuning;
  if (!transpose && srcCapo === dstCapo && parsed.blocks.every((block) =>
    block.tuning.notes.length === dst.notes.length && block.tuning.notes.every((note, i) => note === dst.notes[i])
  )) return null;
  const result = swapTabBlocks(text, { from: { tuning: sourceTuning, capo: srcCapo }, to: { tuning: dst.id, capo: dstCapo }, transpose });
  if (!result) return null;
  // Saved chord symbols name pitches before the capo, just like source
  // charts. The UI's familiar-shape lens is applied when the song is opened.
  const chordShift = transpose + srcCapo - dstCapo;
  const exportText = chartOutline(result.text).map((line) => line.kind === "chords"
    ? line.tokens.map((token) => token.parsed ? chordSymbol(transposeChord(token.parsed, chordShift)) : token.text).join("")
    : line.line).join("\n");
  return { ...result, exportText, src, dst, srcCapo, dstCapo, transpose };
}

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

// High positions cost more the higher they go — a flat +0.5 let melody runs
// wander to fret 18–20 when the same pitch sat at 11 on a higher string.
const placeCost = (a) => a.pos * 0.8 + a.span * 2.2 - a.opens * 1.2 +
  a.notes.reduce((n, x) => n + (x.fret > 12 ? 0.5 + (x.fret - 12) * 0.35 : 0), 0);
const moveCost = (prev, a) => {
  if (!prev) return 0;
  let c = Math.abs(a.pos - prev.pos) * 1.4;
  if (a.notes.length === 1 && prev.lastString != null) {
    c += Math.abs(a.notes[0].string - prev.lastString) * 0.6;
  }
  return c;
};

/**
 * The honest fallback when no single-hand shape holds a whole column (a dense
 * cluster whose pitches, moved to the target tuning, would sprawl across the
 * neck). Find the SPAN-fret window (open strings are always free) that seats
 * the MOST of the notes on distinct strings — octave-revoicing a note to make
 * it fit before giving up — and report the rest as dropped. The result is an
 * alternative voicing a hand can actually hold; a chord no one can play is not
 * a transcription, it's noise. Returns { seated, dropped, shifted }.
 */
function playableSubset(notes, opens, capo, maxFret) {
  let best = null;
  for (let base = 1; base + SPAN <= maxFret; base++) {
    const used = new Set();
    const seated = [];
    for (let idx = 0; idx < notes.length; idx++) {
      const n = notes[idx];
      let pick = null;
      // written octave first, then its twins — a fit beats a faithful register
      for (const [midi, sh] of [[n.midi, 0], [n.midi + 12, 1], [n.midi - 12, -1]]) {
        for (const s of spotsFor(midi, opens, capo, maxFret)) {
          if (used.has(s.string)) continue;
          if (s.fret !== 0 && (s.fret < base || s.fret > base + SPAN)) continue;
          if (!pick || (sh === 0 && pick.sh !== 0) || (sh === pick.sh && s.string < pick.string)) {
            pick = { string: s.string, fret: s.fret, midi, sh };
          }
        }
      }
      if (pick) {
        used.add(pick.string);
        seated.push({ idx, sh: pick.sh, note: { ...n, midi: pick.midi, octaveShifted: (pick.sh || n.octaveShifted) || undefined, string: pick.string, fret: pick.fret } });
      }
    }
    const shifted = seated.filter((x) => x.sh).length;
    if (!best || seated.length > best.n || (seated.length === best.n && shifted < best.shifted)) {
      best = { n: seated.length, shifted, keptIdx: new Set(seated.map((x) => x.idx)), seated: seated.map((x) => x.note) };
    }
    if (best.n === notes.length && best.shifted === 0) break; // can't do better
  }
  if (!best) best = { n: 0, shifted: 0, keptIdx: new Set(), seated: [] };
  return { seated: best.seated, shifted: best.shifted, dropped: notes.filter((_, i) => !best.keptIdx.has(i)) };
}

/**
 * Assign a stream of columns [{ col, notes: [{ midi, tech? }] }] to a target
 * fretboard. Returns { columns, summary } where each column carries assigned
 * notes { midi, string, fret, tech, octaveShifted? } plus dropped[] pitches,
 * and summary counts every compromise out loud.
 */
export function assignColumns(columns, { tuningId, capo = 0, maxFret = 22, transpose = 0 } = {}) {
  const tuning = getTuning(tuningId);
  const opens = tuning.notes;
  const summary = { shifted: 0, dropped: 0, columns: columns.length };

  // per-column: rescue unplayable pitches by octave, or drop them — flagged
  const prepared = columns.map((c) => {
    const ok = [];
    const dropped = [];
    for (const n of c.notes.map((note) => ({ ...note, midi: note.midi + transpose })).sort((a, b) => a.midi - b.midi)) {
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
    // Octave rescue MUTATED midis (D2→D3), so `ok` is no longer pitch-sorted.
    // assignmentsFor places notes onto strictly ascending strings in list
    // order — feed it out of order and a rescued note keeps its old low slot
    // and gets stranded up the neck. Re-sort by the NEW pitch first, then
    // collapse a rescue that landed on an existing pitch.
    const seen = new Set();
    const notes = ok
      .sort((a, b) => a.midi - b.midi)
      .filter((n) => (seen.has(n.midi) ? false : seen.add(n.midi)));
    return { col: c.col, notes, dropped };
  });

  // beam search
  let states = [{ cost: 0, prev: null, placed: null, pos: 0, lastString: null }];
  const history = [];
  for (const col of prepared) {
    if (!col.notes.length) { history.push(null); continue; }
    const options = assignmentsFor(col.notes, opens, capo, maxFret);
    if (!options.length) {
      // A chord whose members are individually playable but not TOGETHER within
      // a hand span. Keep the most that fit one shape (octave-revoiced where it
      // helps), drop-and-flag the rest — an alternative voicing you can hold,
      // never a shape that spans half the neck.
      const best = playableSubset(col.notes, opens, capo, maxFret);
      summary.shifted += best.shifted;
      for (const n of best.dropped) { col.dropped.push(n.midi); summary.dropped++; }
      col.notes = best.seated;
      history.push([{ notes: best.seated, pos: 0, span: 0, opens: 0 }]);
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
    // Technique marks can occupy more than one character; leave enough
    // room for the whole cell and at least three grid dashes on every row.
    const maxCell = Math.max(1, ...chunk.map((cc) => cc.notes.reduce((w, n) => Math.max(w, String(n.fret).length + (n.tech || "").length), 1)));
    // Scale the original column gaps uniformly so wider fret numbers fit
    // without turning long holds into eighth notes when the tab is replayed.
    const gaps = chunk.slice(1).map((c, i) => c.col - chunk[i].col).filter((gap) => gap > 0);
    const scale = Math.ceil((maxCell + 3) / (gaps.length ? Math.min(...gaps) : 1));
    const positions = chunk.map((c) => 1 + (c.col - chunk[0].col) * scale);
    const bodyWidth = positions[positions.length - 1] + maxCell + 3;
    const rows = [];
    for (let row = 0; row < nStrings; row++) {
      const stringLowIdx = nStrings - 1 - row; // top row = highest string
      const body = Array(bodyWidth).fill("-");
      for (const [i, c] of chunk.entries()) {
        const hit = c.notes.find((n) => n.string === stringLowIdx);
        const cell = hit ? `${hit.fret}${hit.tech || ""}` : "";
        for (let j = 0; j < cell.length; j++) body[positions[i] + j] = cell[j];
      }
      rows.push(`${labels[stringLowIdx].padEnd(width)}|${body.join("")}|`);
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
export function retabText(text, { from = {}, to, transpose = 0 } = {}) {
  // from.tuning is the SONG's declared tuning — a default, not an override:
  // the tuning-resolution law says in-block string labels beat declared meta.
  const parsed = parseTab(text, { defaultTuning: from.tuning, capo: from.capo });
  if (!parsed.blocks.length) return null;
  const pieces = [];
  const summary = { shifted: 0, dropped: 0, blocks: 0 };
  for (const block of parsed.blocks) {
    if (!block.events.length) continue; // pure-dash block: no pitches to move
    const assigned = assignColumns(block.events, { tuningId: to.tuning, capo: to.capo || 0, transpose });
    summary.blocks++;
    summary.shifted += assigned.summary.shifted;
    summary.dropped += assigned.summary.dropped;
    pieces.push(renderAscii(assigned));
  }
  if (!summary.blocks) return null;
  return { text: pieces.join("\n"), summary };
}

/**
 * Rewrite prose capo declarations to tell the truth about the TARGET capo.
 * Re-fretted frets are written FOR the new capo; a stale "Capo 2" header is
 * a lie the whole app then believes (detectCapo reads it back on save and
 * reload). Mirrors detectCapo's window (first 40 lines) and patterns, so a
 * lyric mentioning a capo deeper in the song is never touched.
 */
export function restampCapo(text, capo) {
  const lines = String(text || "").split("\n");
  const n = Math.min(lines.length, 40);
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    if (!/\bcapo\b/i.test(line)) continue;
    if (/\bno\s+capo\b/i.test(line)) {
      if (capo > 0) lines[i] = line.replace(/\bno\s+capo\b/i, `Capo ${capo}`);
      continue;
    }
    const decl = /(\bcapo\b[^0-9\n]{0,12})\d{1,2}(?:st|nd|rd|th)?/i;
    if (!decl.test(line)) continue;
    lines[i] = capo > 0
      ? line.replace(decl, (_, pre) => `${pre}${capo}`)
      : line.replace(decl, "No capo");
  }
  return lines.join("\n");
}

/**
 * Re-fret a whole DOCUMENT in place: every tab block is replaced with its
 * target-tuning rendering while lyrics, chords, and section headers around
 * them stay exactly where they were. Returns { text, summary } or null.
 * The result is written FOR the target tuning — a copy saved from it must
 * declare that tuning or every player downstream will misread the frets.
 */
export function swapTabBlocks(text, { from = {}, to, transpose = 0 } = {}) {
  // Work in UNWRAPPED space throughout. findTabBlocks/parseTab already unwrap
  // scraper-hard-wrapped lines, so their block lines never matched the RAW
  // text's lines — the old exact-match splice silently no-opped on wrapped
  // tabs while the summary claimed the swap happened. unwrapTab is idempotent
  // and it's what ChartView renders anyway; splicing by findTabBlocks'
  // startLine in that same space cannot miss.
  const src = unwrapTab(String(text || ""));
  const found = findTabBlocks(src);
  if (!found.length) return null;

  const lines = src.split(/\r?\n/);
  const summary = { shifted: 0, dropped: 0, blocks: 0 };
  const out = lines.slice();
  // splice bottom-up so earlier startLines stay valid as lengths change
  for (const b of [...found].reverse()) {
    // from.tuning is the song's DECLARED tuning — in-block labels beat it
    // (the tuning-resolution law), so pass it as the default, not a lock.
    const block = parseTabBlock(b.lines, { defaultTuning: from.tuning, capo: from.capo });
    if (!block.events.length) continue; // pure-dash block: nothing to move, leave it
    const assigned = assignColumns(block.events, { tuningId: to.tuning, capo: to.capo || 0, transpose });
    summary.blocks++;
    summary.shifted += assigned.summary.shifted;
    summary.dropped += assigned.summary.dropped;
    const rendered = renderAscii(assigned, { perSystem: Math.max(8, block.events.length) }).trimEnd().split("\n");
    out.splice(b.startLine, b.lines.length, ...rendered);
  }
  if (!summary.blocks) return null; // only pitch-less blocks: an honest "nothing to re-fret"
  const target = getTuning(to.tuning);
  const stamped = restampCapo(out.join("\n"), to.capo || 0).split("\n");
  const header = stamped.findIndex((line, i) => i < 40 && /^\s*tuning\s*[:=]/i.test(line));
  if (header >= 0) stamped[header] = `Tuning: ${target.spelling}`;
  else stamped.unshift(`Tuning: ${target.spelling}`);
  return { text: stamped.join("\n"), summary };
}
