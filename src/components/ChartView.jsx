// ChartView.jsx — renders a chord sheet / tab so it "reads perfectly."
// One monospace column (Berkeley Mono) so columns line up the way songbooks do.
// Lines are classified: section header, ASCII tab block, chord-over-lyric, or
// lyric. Chord tokens are colored by harmonic function (T/S/D) and clickable.
import { useMemo } from "react";
import { parseChord, transposeChord, displaySymbol, harmonicFunction } from "../lib/theory.js";
import { findTabBlocks } from "../lib/tab.js";
import { C, FUNCTION_COLOR, MONO } from "../ui/theme.js";

const isSectionHeader = (line) => {
  const t = line.trim();
  if (/^\[.+\]$/.test(t)) return true;                          // [Verse 1]
  if (/^[A-Z][A-Za-z0-9 ()'/&-]{0,28}:$/.test(t)) return true;  // Chorus:
  return false;
};

// A line is a chord line if at least half its tokens parse as chords (≥1).
function chordLineInfo(line) {
  const tokens = line.split(/(\s+)/);
  const words = tokens.filter((t) => t.trim());
  if (!words.length) return null;
  let hits = 0;
  for (const w of words) if (parseChord(w)) hits++;
  return hits >= 1 && hits / words.length >= 0.5 ? { tokens } : null;
}

export default function ChartView({ text, activeKey, transpose = 0, onChordClick, activeSymbol }) {
  // Strip Ultimate-Guitar [ch]/[tab] wrappers so pasted UG charts render clean.
  const clean = useMemo(() => String(text || "").replace(/\[\/?(ch|tab)\]/g, ""), [text]);
  const lines = useMemo(() => clean.split(/\r?\n/), [clean]);
  const tabRanges = useMemo(() => {
    const set = new Set();
    for (const b of findTabBlocks(clean)) {
      for (let i = 0; i < b.lines.length; i++) set.add(b.startLine + i);
    }
    return set;
  }, [clean]);

  const tonic = activeKey?.tonic ?? 0;
  const mode = activeKey?.mode ?? "major";

  return (
    <div style={{ fontFamily: MONO, fontSize: 14, lineHeight: 1.6, color: C.ink, whiteSpace: "pre", overflowX: "auto" }}>
      {lines.map((line, i) => {
        if (tabRanges.has(i)) {
          return <div key={i} style={{ color: C.ink, background: C.panel2, padding: "0 8px", borderLeft: `2px solid ${C.lineStrong}` }}>{line || " "}</div>;
        }
        if (isSectionHeader(line)) {
          return (
            <div key={i} style={{ marginTop: 14, marginBottom: 2 }}>
              <span style={{ fontFamily: "var(--kl-sans)", textTransform: "uppercase", letterSpacing: "0.09em", fontSize: 11.5, fontWeight: 700, color: C.muted }}>
                {line.trim().replace(/^\[|\]$/g, "").replace(/:$/, "")}
              </span>
            </div>
          );
        }
        const info = chordLineInfo(line);
        if (info) {
          return (
            <div key={i}>
              {info.tokens.map((tok, j) => {
                if (!tok.trim()) return <span key={j}>{tok}</span>;
                const parsed = parseChord(tok);
                if (!parsed) return <span key={j} style={{ color: C.muted }}>{tok}</span>;
                const view = transpose ? transposeChord(parsed, transpose) : parsed;
                const fn = harmonicFunction(view, tonic, mode);
                const color = FUNCTION_COLOR[fn] || C.ink;
                const label = transpose ? displaySymbol(parsed, transpose) : tok;
                const active = activeSymbol && displaySymbol(view, 0) === activeSymbol;
                return (
                  <span key={j} role="button" tabIndex={0}
                    onClick={() => onChordClick?.(view)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChordClick?.(view); } }}
                    title={`${label} — ${fn === "?" ? "chromatic" : fn} function · click to hear`}
                    style={{ color, fontWeight: 700, cursor: "pointer", borderBottom: `2px solid ${color}`, background: active ? `${color}1f` : "transparent" }}>
                    {label}
                  </span>
                );
              })}
            </div>
          );
        }
        return <div key={i} style={{ color: C.ink }}>{line || " "}</div>;
      })}
    </div>
  );
}
