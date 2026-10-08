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
// Case-insensitive: real tabs mute strings with X as often as x, and write
// H/P/B technique marks uppercase — a lowercase-only class split six-string
// blocks at the first X-muted line.
// Does this run of text read as tab on its own?
function readsAsTab(seg) {
  if ((seg.match(/-/g) || []).length < 3) return false;
  const tabChars = (seg.match(/[-0-9|:hpbsrxt\/\\~^.()* ]/gi) || []).length;
  return tabChars / seg.length >= 0.85;
}

function isTabLine(line) {
  if (!line) return false;
  const dashes = (line.match(/-/g) || []).length;
  if (dashes < 3) return false;
  const body = line.replace(/^\s*[A-Ga-g][#b]?\s*[|:]?\s?/, "").trimStart();
  if (!body) return false;
  // The row must still OPEN like tab — this is what keeps prose out.
  if (!/[-0-9|]/.test(body[0])) return false;
  if (readsAsTab(body)) return true;
  // Transcribers annotate in the margin, past the closing bar:
  //   G|--0----0----0----0----| X any many times needed in the song
  // Judging the whole line on that prose rejected the row and, with it, the
  // entire system. Accept the longest prefix ending at a "|" that reads as
  // tab by itself; the comment beyond it is not the row's business.
  for (let i = body.lastIndexOf("|"); i > 0; i = body.lastIndexOf("|", i - 1)) {
    if (readsAsTab(body.slice(0, i + 1))) return true;
  }
  return false;
}

/**
 * Rejoin tab lines that a scraper hard-wrapped at ~100 columns: a long tab
 * line that doesn't close with "|", followed by a short tail of pure tab
 * characters (no string label), is one line split in two. Idempotent.
 */
export function unwrapTab(text) {
  const lines = String(text || "").split(/\r?\n/);
  const TAIL = /^[-0-9|:hpbrsxt/\\~^.()* ]+$/i;
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

/** Find tab blocks (groups of 4–8 adjacent tab lines) inside any text. */
export function findTabBlocks(text) {
  const lines = unwrapTab(String(text || "")).split(/\r?\n/);
  const blocks = [];
  let run = [];
  let startIdx = 0;
  const flush = () => {
    if (run.length >= 4) {
      // Repeated label sequences identify stacked bass/extended-guitar
      // systems. A fixed six-row chunk merged two bass riffs and discarded
      // strings seven/eight from a single extended-guitar system.
      const labels = extractLabels(run).map((label) => label?.toUpperCase());
      const repeat = labels.every(Boolean) ? [6, 4, 5, 7, 8].find((size) => run.length > size && run.length % size === 0 && labels.every((label, i) => label === labels[i % size])) : null;
      const size = repeat || (run.length <= 8 ? run.length : 6);
      for (let i = 0; i < run.length; i += size) {
        const chunk = run.slice(i, i + size);
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

const TECH_BEFORE = /[hpbrs/\\~^]/i;
const TECH_AFTER = /[hpbrs/\\~^x]/i;
const BASS_SPELLINGS = ["E A D G", "D A D G", "D# G# C# F#", "D G C F", "C G C F", "C# G# C# F#", "B E A D G", "A E A D G", "A D G C F"];

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

// Where the row stops being a row. isTabLine accepts a system whose rows carry
// a prose comment past the closing bar, so the parser has to honour the same
// boundary: a digit in the margin ("| x2", "| play 4 times") is a repeat
// marker, not a fret, and reading it opens a phantom column after the last
// real note. Real tab continuing past a bar is still dash-grid, so the tail
// only has to clear a lower dash bar than a whole row does.
function playableExtent(line) {
  const bar = line.lastIndexOf("|");
  if (bar < 0) return line;
  const tail = line.slice(bar + 1);
  if (!tail.trim()) return line;
  const dashes = (tail.match(/-/g) || []).length;
  const tabChars = (tail.match(/[-0-9|:hpbsrxt/\\~^.()* ]/gi) || []).length;
  if (dashes >= 1 && tabChars / tail.length >= 0.85) return line;
  return line.slice(0, bar + 1);
}

/**
 * Parse one tab block (array of string-lines) into note events.
 * Returns { tuning, orientation, labels, events:[{col,notes:[{string,fret,midi,tech,row}]}], lines }.
 * Tuning precedence: opts.tuning (hard override) > string labels in the tab
 * itself > opts.defaultTuning (song metadata) > standard. opts.capo shifts
 * every sounded note up. Strings are indexed 0 = lowest (low→high order).
 */
export function parseTabBlock(lines, opts = {}) {
  // Strip string-NUMBER prefixes: when EVERY line leads with a digit and the
  // digits run 1..n (either direction), they number the strings — "1e|--3--"
  // plays fret 3, and a Lou-Reed-style tuning legend ("1c# --|-d#-|…") is a
  // diagram, not a one-column chord of frets 1–6. Blank with a space so
  // column positions stay aligned. Block-level sequence check keeps a lone
  // "2b3---" bend safe — its neighbors won't complete the 1..n run.
  const leads = lines.map((l) => /^\s*(\d)/.exec(l)?.[1]);
  if (lines.length >= 4 && leads.every(Boolean)) {
    const seq = leads.join("");
    const fwd = Array.from({ length: lines.length }, (_, i) => i + 1).join("");
    if (seq === fwd || seq === [...fwd].reverse().join("")) {
      lines = lines.map((l) => l.replace(/^(\s*)\d/, "$1 "));
    }
  }
  const n = lines.length;
  const labels = extractLabels(lines);
  let tuning;
  let orientation = "highOnTop"; // bottom line = lowest string (the convention)
  let stringOffset = 0;

  let tuningFromLabels = false;
  if (opts.tuning) {
    tuning = getTuning(opts.tuning);
  } else if (labels.every(Boolean) && n >= 4 && n <= 8) {
    // assignOctaves stacks ANY note sequence into an ascending tuning, so
    // parseTuning can never reject the reversed reading — testing it first
    // made the low-string-on-top branch unreachable and read those systems
    // under a bogus tuning with every octave wrong. Decide by which reading
    // NAMES a tuning we know; when neither does the high-on-top convention
    // wins, because that is what almost every transcriber writes.
    const lowToHigh = [...labels].reverse().join(" ");
    const asWritten = labels.join(" ");
    const named = (spelling) => getTuning(spelling).family !== "custom" || BASS_SPELLINGS.includes(tuningSpelling(parseTuning(spelling)));
    if (!named(lowToHigh) && named(asWritten)) {
      tuning = getTuning(asWritten);
      orientation = "lowOnTop";
      tuningFromLabels = true;
    } else if (parseTuning(lowToHigh)) {
      tuning = getTuning(lowToHigh);
      tuningFromLabels = true;
    }
  }
  if (!tuning) tuning = getTuning(opts.defaultTuning ?? null);
  const fallback = getTuning(opts.tuning ?? opts.defaultTuning);
  // Short guitar riffs usually omit the low strings. Match their labels to
  // the declared instrument before assigning octaves to a new instrument.
  if (n < fallback.notes.length) {
    const upper = fallback.notes.slice(-n);
    const labelSpelling = labels.every(Boolean) ? tuningSpelling(parseTuning([...labels].reverse().join(" "))) : null;
    if (opts.tuning || !labels.some(Boolean) || labelSpelling === tuningSpelling(upper)) {
      tuning = fallback;
      stringOffset = fallback.notes.length - n;
    }
  }
  // These four-string systems describe a bass, including common detunings.
  // A partial guitar system matched above retains the guitar's register.
  if (!opts.tuning && (n === 4 || n === 5) && tuning.notes.length === n &&
      BASS_SPELLINGS.includes(tuningSpelling(tuning.notes))) {
    tuning = { ...tuning, id: "bass", name: "Bass", family: "bass", notes: tuning.notes.map((m) => m - 12) };
  }
  const capo = normCapo(opts.capo);

  const byCol = new Map();
  lines.forEach((line, rowIndex) => {
    const stringLowIndex = stringOffset + (orientation === "highOnTop" ? n - 1 - rowIndex : rowIndex);
    const base = tuning.notes[stringLowIndex];
    if (base == null) return;
    for (const h of parseRowDigits(playableExtent(line))) {
      const note = { string: stringLowIndex, fret: h.fret, midi: base + capo + h.fret, tech: h.tech, row: rowIndex };
      if (!byCol.has(h.col)) byCol.set(h.col, []);
      byCol.get(h.col).push(note);
    }
  });

  const events = [...byCol.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, notes]) => ({ col, notes: notes.sort((x, y) => x.midi - y.midi) }));

  return { tuning, tuningFromLabels, capo, orientation, labels, events, lines };
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

/**
 * Split one tab line into display runs so a renderer can dim the grid and
 * brighten the notes without disturbing column alignment. Kinds:
 *   "label" — the string-name prefix ("E|", "b:")
 *   "fret"  — digits (the notes)
 *   "mute"  — x/X dead strings
 *   "tech"  — h/p/b/r/s/t / \ ~ ^ articulation marks, either case
 *   "grid"  — dashes, bars, spaces, everything else
 * Concatenating run texts always reproduces the input line exactly.
 */
export function tokenizeTabLine(line) {
  const runs = [];
  const push = (kind, text) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += text;
    else runs.push({ kind, text });
  };
  let i = 0;
  const label = /^\s*[A-Ga-g][#b]?\s*[|:]/.exec(line);
  if (label) { push("label", label[0]); i = label[0].length; }
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch >= "0" && ch <= "9") push("fret", ch);
    else if (ch === "x" || ch === "X") push("mute", ch);
    else if (/[hpbrst/\\~^]/i.test(ch)) push("tech", ch);
    else push("grid", ch);
  }
  return runs;
}
