// ChartView.jsx — renders a chord sheet / tab so it "reads perfectly."
// One monospace column (Berkeley Mono) so columns line up the way songbooks do.
// Lines are classified: section header, ASCII tab block, chord-over-lyric, or
// lyric. Chord tokens are colored by harmonic function (T/S/D) and clickable.
import { useMemo } from "react";
import { parseChord, transposeChord, harmonicFunction, sameChordSound } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { findTabBlocks, unwrapTab, tokenizeTabLine } from "../lib/tab.js";
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

export default function ChartView({ text, activeKey, transpose = 0, onChordClick, activeChord }) {
  // Strip Ultimate-Guitar [ch]/[tab] wrappers so pasted UG charts render clean,
  // and rejoin tab lines the scraper hard-wrapped (same lines the parser sees).
  const clean = useMemo(() => unwrapTab(String(text || "").replace(/\[\/?(ch|tab)\]/g, "")), [text]);
  const lines = useMemo(() => clean.split(/\r?\n/), [clean]);
  // line index → position in its tab block, so the block reads as one shape
  // (rounded top/bottom edge) instead of six unrelated stripes.
  const tabLines = useMemo(() => {
    const map = new Map();
    for (const b of findTabBlocks(clean)) {
      for (let i = 0; i < b.lines.length; i++) {
        map.set(b.startLine + i, { first: i === 0, last: i === b.lines.length - 1 });
      }
    }
    return map;
  }, [clean]);

  const tonic = activeKey?.tonic ?? 0;
  const mode = activeKey?.mode ?? "major";

  // Tab runs: the grid recedes, the notes pop — dashes/bars faint, frets bold
  // ink, X mutes coral (dead string), h/p/b/s marks teal (expressive move).
  // Built per render (not module scope) because C is re-pointed on theme swap.
  const tabRunStyle = {
    label: { color: C.muted, fontWeight: 700 },
    fret: { color: C.ink, fontWeight: 700 },
    mute: { color: C.bassText },
    tech: { color: C.toneText },
    grid: { color: C.faint },
  };

  return (
    <div style={{ fontFamily: MONO, fontSize: 14, lineHeight: 1.6, color: C.ink, whiteSpace: "pre", overflowX: "auto" }}>
      {lines.map((line, i) => {
        const tab = tabLines.get(i);
        if (tab) {
          return (
            <div key={i} style={{
              background: C.panel2, padding: "0 8px",
              borderLeft: `2px solid ${C.lineStrong}`,
              ...(tab.first ? { marginTop: 4, paddingTop: 3, borderTopRightRadius: 6 } : {}),
              ...(tab.last ? { marginBottom: 4, paddingBottom: 3, borderBottomRightRadius: 6 } : {}),
            }}>
              {line
                ? tokenizeTabLine(line).map((r, j) => <span key={j} style={tabRunStyle[r.kind]}>{r.text}</span>)
                : " "}
            </div>
          );
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
                // The chart is a playing surface: always honor its selected
                // chord-name lens, even when the pitches have not moved.
                const label = spellChord(view, activeKey);
                // Sound-based match: survives respelling (A# vs B♭) and transposition.
                const active = activeChord && sameChordSound(view, activeChord);
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
