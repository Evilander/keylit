// chartlines.js — pure chart-line classification, shared by every surface
// that renders a chord sheet (ChartView's interactive page, Perform's stage).
// One classifier so a line can never be a lyric in one room and a chord line
// in another. No React, no DOM (prime directive 2).
import { parseChord, isSectionLine } from "./theory.js";
import { findTabBlocks, unwrapTab } from "./tab.js";

/** [Verse 1] · Chorus: · [Bridge] — the shapes section names arrive in.
 * Delegates to theory's isSectionLine: the anchor walk mirrors parseSheet's
 * repeat-collapse, and two different header rules made the two counters
 * drift on colon-headed charts (Walk mode then fell back to sound-matching). */
export function isSectionHeader(line) {
  return isSectionLine(line);
}

/** A line is a chord line if at least half its tokens parse as chords (≥1).
 * Returns { tokens } (split with whitespace preserved) or null. */
export function chordLineInfo(line) {
  const tokens = line.split(/(\s+)/);
  const words = tokens.filter((t) => t.trim());
  if (!words.length) return null;
  let hits = 0;
  for (const w of words) if (parseChord(w)) hits++;
  return hits >= 1 && hits / words.length >= 0.5 ? { tokens } : null;
}

/**
 * Classify a whole chart into render-ready lines:
 *   { kind: "header"|"tab"|"chords"|"lyric", line, ... }
 * - header: { title } (brackets/colon stripped)
 * - tab:    { pos: { first, last } } within its block
 * - chords: { tokens: [{ text, gap?, plain?, parsed? }] }
 * UG [ch]/[tab] wrappers are stripped and hard-wrapped tab lines rejoined,
 * exactly as ChartView renders and lib/tab.js parses.
 */
export function chartOutline(text) {
  const clean = unwrapTab(String(text || "").replace(/\[\/?(ch|tab)\]/g, ""));
  const lines = clean.split(/\r?\n/);
  const tabMap = new Map();
  for (const b of findTabBlocks(clean)) {
    for (let i = 0; i < b.lines.length; i++) {
      tabMap.set(b.startLine + i, { first: i === 0, last: i === b.lines.length - 1 });
    }
  }
  return lines.map((line, i) => {
    const pos = tabMap.get(i);
    if (pos) return { kind: "tab", line, pos };
    if (isSectionHeader(line)) {
      return { kind: "header", line, title: line.trim().replace(/^\[|\]$/g, "").replace(/:$/, "") };
    }
    const info = chordLineInfo(line);
    if (!info) return { kind: "lyric", line };
    return {
      kind: "chords",
      line,
      tokens: info.tokens.map((tok) => {
        if (!tok.trim()) return { text: tok, gap: true };
        const parsed = parseChord(tok);
        return parsed ? { text: tok, parsed } : { text: tok, plain: true };
      }),
    };
  });
}

/** The chart's table of contents: [{ title, lineIdx }] for section jumping. */
export function sectionIndex(outline) {
  const out = [];
  outline.forEach((l, i) => { if (l.kind === "header") out.push({ title: l.title, lineIdx: i }); });
  return out;
}

/**
 * Anchor each progression step to its position in the RENDERED chart.
 * parseSheet collapses consecutive same-raw chords within a section; this
 * mirrors that walk over the outline, so anchors[i] locates progression[i]
 * — with the collapsed repeats carried as `echoes` (same step, later ink).
 *
 * The parse path can legitimately diverge from the rendered text (ChordPro
 * chord extraction, dropped metadata lines), so callers MUST check
 * `anchors.length === progression.length` before trusting positions and
 * fall back to sound-matching when they disagree.
 */
export function progressionAnchors(outline) {
  const anchors = [];
  let section = "";
  let prevRaw = null;
  let prevSection = null;
  for (let li = 0; li < outline.length; li++) {
    const l = outline[li];
    if (l.kind === "header") { section = l.title; continue; }
    if (l.kind !== "chords") continue;
    for (let ti = 0; ti < l.tokens.length; ti++) {
      const t = l.tokens[ti];
      if (!t.parsed) continue;
      if (t.parsed.raw === prevRaw && section === prevSection && anchors.length) {
        anchors[anchors.length - 1].echoes.push({ line: li, token: ti });
        continue;
      }
      anchors.push({ line: li, token: ti, echoes: [] });
      prevRaw = t.parsed.raw;
      prevSection = section;
    }
  }
  return anchors;
}
