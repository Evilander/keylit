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

import { getTuning, parseTuning, tuningSpelling } from "./tuning.js";

// Normalize a capo value: integers 1–11 shift pitch; anything else is 0.
function normCapo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(11, Math.round(n)) : 0;
}

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

/**
 * Rejoin tab lines that a scraper hard-wrapped at ~100 columns: a long tab
 * line that doesn't close with "|", followed by a short tail of pure tab
 * characters (no string label), is one line split in two. Idempotent.
 */
export function unwrapTab(text) {
  const lines = String(text || "").split(/\r?\n/);
  const TAIL = /^[-0-9|:hpbrsxt/\\~^.()* ]+$/;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (
      i + 1 < lines.length &&
      isTabLine(line) && line.length >= 80 && !line.trimEnd().endsWith("|") &&
      lines[i + 1] && lines[i + 1].trim() && lines[i + 1].length < line.length &&
      TAIL.test(lines[i + 1]) && !/^\s*[A-Ga-g][#b]?\s*[|:]/.test(lines[i + 1])
    ) {
      line += lines[i + 1];
      i++;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Find tab blocks (groups of 4–6 adjacent tab lines) inside any text. */
export function findTabBlocks(text) {
  const lines = unwrapTab(String(text || "")).split(/\r?\n/);
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
    const fret = parseInt(m[0], 10);
    if (fret > 24 && m[0].length === 2) {
      // No guitar has fret 75 — read it as two adjacent single-digit notes.
      hits.push({ col, fret: +m[0][0], tech: before && TECH_BEFORE.test(before) ? before : "" });
      hits.push({ col: col + 1, fret: +m[0][1], tech: after && TECH_AFTER.test(after) ? after : "" });
    } else {
      hits.push({ col, fret, tech });
    }
  }
  return hits;
}

/**
 * Parse one tab block (array of string-lines) into note events.
 * Returns { tuning, orientation, labels, events:[{col,notes:[{string,fret,midi,tech,row}]}], lines }.
 * Tuning precedence: opts.tuning (hard override) > string labels in the tab
 * itself > opts.defaultTuning (song metadata) > standard. opts.capo shifts
 * every sounded note up. Strings are indexed 0 = lowest (low→high order).
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
  if (!tuning) tuning = getTuning(opts.defaultTuning ?? null);
  // A labeled 4-string E-A-D-G is a bass — guitar octaves would be one too high.
  if (!opts.tuning && n === 4 && tuning.notes.length === 4 &&
      tuning.notes[0] === 40 && tuningSpelling(tuning.notes) === "E A D G") {
    tuning = { id: "bass", name: "Bass", family: "bass", spelling: "E A D G", notes: tuning.notes.map((m) => m - 12) };
  }
  const capo = normCapo(opts.capo);

  const byCol = new Map();
  lines.forEach((line, rowIndex) => {
    const stringLowIndex = orientation === "highOnTop" ? n - 1 - rowIndex : rowIndex;
    const base = tuning.notes[stringLowIndex];
    if (base == null) return;
    for (const h of parseRowDigits(line)) {
      const note = { string: stringLowIndex, fret: h.fret, midi: base + capo + h.fret, tech: h.tech, row: rowIndex };
      if (!byCol.has(h.col)) byCol.set(h.col, []);
      byCol.get(h.col).push(note);
    }
  });

  const events = [...byCol.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, notes]) => ({ col, notes: notes.sort((x, y) => x.midi - y.midi) }));

  return { tuning, capo, orientation, labels, events, lines };
}

/** Parse a whole document: all blocks + a flat, ordered event stream. */
export function parseTab(text, opts = {}) {
  const blocks = findTabBlocks(text).map((b) => parseTabBlock(b.lines, opts));
  const tuning = blocks[0] ? blocks[0].tuning : getTuning(opts.tuning ?? opts.defaultTuning);
  const events = [];
  blocks.forEach((b, bi) => b.events.forEach((e) => events.push({ ...e, block: bi })));
  return { blocks, tuning, capo: normCapo(opts.capo), events };
}

/** Flatten parsed events to arrays of MIDI notes (for piano lighting/playback). */
export function tabEventsToMidi(parsed) {
  return parsed.events.map((e) => e.notes.map((n) => n.midi));
}
