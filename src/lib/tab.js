// tab.js — parse ASCII guitar tablature into structured, tuning-aware note
// events. Pure (no React/audio/DOM/network). Built on tuning.js.
//
// The app had ZERO tab support before this — only chord-name sheets. This turns
// the 6-line ASCII tab that real songbooks/fan-sites use into exact MIDI notes,
// so the same fretted note can light the correct piano key.
//
// Tabs are monospaced, so a fret's COLUMN is its time position and columns line
// up across the six string-lines. We scan the original line text directly —
// labels (letters) and bar lines (|) carry no digits, so digit columns align.

import { getTuning, parseTuning } from "./tuning.js";

// A line "reads as tab" if it's dash-heavy and, after an optional string label,
// is almost entirely tab characters starting with a dash / digit / bar.
function isTabLine(line) {
  if (!line) return false;
  const dashes = (line.match(/-/g) || []).length;
  if (dashes < 3) return false;
  const body = line.replace(/^\s*[A-Ga-g][#b]?\s*[|:]?\s?/, "");
  if (!body) return false;
  const tabChars = (body.match(/[-0-9|:hpbsrxt\/\\~^.()* ]/g) || []).length;
  const frac = tabChars / body.length;
  return frac >= 0.85 && /[-0-9|]/.test(body[0]);
}

/** Find tab blocks (groups of 4–6 adjacent tab lines) inside any text. */
export function findTabBlocks(text) {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let run = [];
  let startIdx = 0;
  const flush = () => {
    if (run.length >= 4) {
      // Adjacent stacked systems (no blank gap) get chunked into 6-line groups.
      for (let i = 0; i < run.length; i += 6) {
        const chunk = run.slice(i, i + 6);
        if (chunk.length >= 4) blocks.push({ startLine: startIdx + i, lines: chunk });
      }
    }
    run = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (isTabLine(lines[i])) {
      if (run.length === 0) startIdx = i;
      run.push(lines[i]);
    } else {
      flush();
    }
  }
  flush();
  return blocks;
}

/** True if the text contains at least one tab block. */
export function hasTab(text) {
  return findTabBlocks(text).length > 0;
}

function extractLabels(lines) {
  return lines.map((line) => {
    const m = /^\s*([A-Ga-g][#b]?)\s*[|:]/.exec(line);
    return m ? m[1] : null;
  });
}

const TECH_BEFORE = /[hpbrs/\\~^]/;
const TECH_AFTER = /[hpbrs/\\~^x]/;

// Pull fret numbers (with their column + adjacent technique marks) from one row.
function parseRowDigits(line) {
  const hits = [];
  const re = /\d{1,2}/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const col = m.index;
    const before = line[col - 1];
    const after = line[col + m[0].length];
    let tech = "";
    if (before && TECH_BEFORE.test(before)) tech += before;
    if (after && TECH_AFTER.test(after)) tech += after;
    hits.push({ col, fret: parseInt(m[0], 10), tech });
  }
  return hits;
}

/**
 * Parse one tab block (array of string-lines) into note events.
 * Returns { tuning, orientation, labels, events:[{col,notes:[{string,fret,midi,tech,row}]}], lines }.
 * The tuning is taken from opts.tuning, else inferred from the string labels,
 * else standard. Strings are indexed 0 = lowest (the engine's low→high order).
 */
export function parseTabBlock(lines, opts = {}) {
  const n = lines.length;
  const labels = extractLabels(lines);
  let tuning;
  let orientation = "highOnTop"; // bottom line = lowest string (the convention)

  if (opts.tuning) {
    tuning = getTuning(opts.tuning);
  } else if (labels.every(Boolean) && (n === 6 || n === 4)) {
    const lowToHigh = [...labels].reverse().join(" ");
    if (parseTuning(lowToHigh)) {
      tuning = getTuning(lowToHigh);
    } else if (parseTuning(labels.join(" "))) {
      tuning = getTuning(labels.join(" "));
      orientation = "lowOnTop";
    }
  }
  if (!tuning) tuning = getTuning(null);

  const byCol = new Map();
  lines.forEach((line, rowIndex) => {
    const stringLowIndex = orientation === "highOnTop" ? n - 1 - rowIndex : rowIndex;
    const base = tuning.notes[stringLowIndex];
    if (base == null) return;
    for (const h of parseRowDigits(line)) {
      const note = { string: stringLowIndex, fret: h.fret, midi: base + h.fret, tech: h.tech, row: rowIndex };
      if (!byCol.has(h.col)) byCol.set(h.col, []);
      byCol.get(h.col).push(note);
    }
  });

  const events = [...byCol.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, notes]) => ({ col, notes: notes.sort((x, y) => x.midi - y.midi) }));

  return { tuning, orientation, labels, events, lines };
}

/** Parse a whole document: all blocks + a flat, ordered event stream. */
export function parseTab(text, opts = {}) {
  const blocks = findTabBlocks(text).map((b) => parseTabBlock(b.lines, opts));
  const tuning = blocks[0] ? blocks[0].tuning : getTuning(opts.tuning);
  const events = [];
  blocks.forEach((b, bi) => b.events.forEach((e) => events.push({ ...e, block: bi })));
  return { blocks, tuning, events };
}

/** Flatten parsed events to arrays of MIDI notes (for piano lighting/playback). */
export function tabEventsToMidi(parsed) {
  return parsed.events.map((e) => e.notes.map((n) => n.midi));
}
