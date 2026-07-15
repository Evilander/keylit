// PerformChart.jsx — the stage copy of a chart: big mono on a dark slab,
// zero hover machinery, built to be read from across a room. Shares line
// classification with ChartView (lib/chartlines.js) so the two rooms never
// disagree about what a line is. The stage does NOT follow the theme —
// Daylight or After Hours, a music stand under lamplight is dark, and the
// role hues here are the theme-stable dark-register variants.
import { memo } from "react";
import { transposeChord, sameChordSound, harmonicFunction } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { tokenizeTabLine } from "../lib/tab.js";
import { MONO } from "../ui/theme.js";

const STAGE = {
  lyric: "#E9E2D1",
  dim: "#8F8672",
  header: "#F08A5A",
  fn: { T: "#57BEC8", S: "#E0B453", D: "#F08A5A", "?": "#9A917D" },
  onInk: "#0D0C09",
  tab: { label: "#8F8672", fret: "#F0EADB", mute: "#E0B453", tech: "#57BEC8", grid: "#5E574B" },
};

function PerformChartBase({ outline, activeKey, transpose = 0, activeChord, anchor, currentLine = -1, size = 18, registerLine }) {
  const tonic = activeKey?.tonic ?? 0;
  const mode = activeKey?.mode ?? "major";
  return (
    <div style={{ fontFamily: MONO, fontSize: size, lineHeight: 1.75, whiteSpace: "pre", overflowX: "auto", color: STAGE.lyric, position: "relative" }}>
      {outline.map((l, i) => {
        const isCur = i === currentLine;
        // every line carries the same left border + padding so the mono
        // columns stay aligned whether or not the playhead sits on them
        const base = {
          padding: "0 10px",
          borderLeft: `3px solid ${isCur ? "#E4602F" : "transparent"}`,
          background: isCur ? "rgba(255,255,255,0.055)" : "transparent",
          borderRadius: isCur ? 6 : 0,
        };
        const ref = registerLine ? (el) => registerLine(i, el) : undefined;

        if (l.kind === "tab") {
          return (
            <div key={i} ref={ref} style={{ ...base, background: isCur ? "rgba(255,255,255,0.085)" : "rgba(255,255,255,0.04)" }}>
              {l.line
                ? tokenizeTabLine(l.line).map((r, j) => (
                  <span key={j} style={{ color: STAGE.tab[r.kind] || STAGE.tab.grid, fontWeight: r.kind === "fret" ? 700 : 400 }}>{r.text}</span>
                ))
                : " "}
            </div>
          );
        }
        if (l.kind === "header") {
          return (
            <div key={i} ref={ref} style={{ ...base, marginTop: i ? Math.round(size * 1.35) : 0, marginBottom: 4 }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontSize: Math.max(11, Math.round(size * 0.62)), fontWeight: 600, color: STAGE.header }}>
                [ {l.title} ]
              </span>
            </div>
          );
        }
        if (l.kind === "chords") {
          return (
            <div key={i} ref={ref} style={base}>
              {l.tokens.map((t, j) => {
                if (t.gap) return <span key={j}>{t.text}</span>;
                if (t.plain) return <span key={j} style={{ color: STAGE.dim }}>{t.text}</span>;
                const view = transpose ? transposeChord(t.parsed, transpose) : t.parsed;
                const label = spellChord(view, activeKey);
                const fn = harmonicFunction(view, tonic, mode);
                const color = STAGE.fn[fn] || STAGE.lyric;
                // positional when the anchor map lined up with the parser;
                // sound-match fallback lights every same-sounding symbol
                const lit = anchor
                  ? (anchor.line === i && anchor.token === j) || (anchor.echoes || []).some((e) => e.line === i && e.token === j)
                  : activeChord ? sameChordSound(view, activeChord) : false;
                return (
                  <span key={j} style={{
                    fontWeight: 700,
                    borderRadius: 5,
                    color: lit ? STAGE.onInk : color,
                    background: lit ? color : "transparent",
                    boxShadow: lit ? `0 0 0 3px ${color}` : "none",
                    transition: "background 120ms ease, color 120ms ease",
                  }}>{label}</span>
                );
              })}
            </div>
          );
        }
        return <div key={i} ref={ref} style={base}>{l.line || " "}</div>;
      })}
    </div>
  );
}

export default memo(PerformChartBase);
