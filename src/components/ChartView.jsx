// ChartView.jsx — renders a chord sheet / tab so it "reads perfectly."
// One monospace column (Berkeley Mono) so columns line up the way songbooks do.
// Lines are classified: section header, ASCII tab block, chord-over-lyric, or
// lyric. Chord tokens are colored by harmonic function (T/S/D) and clickable.
// Hovering (or focusing) a chord raises the guitar-grip card: diagram,
// variants, and piano/strum playback — pass `guitar` to enable it.
import { useEffect, useMemo, useRef, useState } from "react";
import { parseChord, transposeChord, harmonicFunction, sameChordSound } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { findTabBlocks, unwrapTab, tokenizeTabLine } from "../lib/tab.js";
import { C, FUNCTION_COLOR, MONO } from "../ui/theme.js";
import ChordHoverCard from "./ChordHoverCard.jsx";

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

export default function ChartView({ text, activeKey, transpose = 0, onChordClick, activeChord, guitar }) {
  // The grip card. One card serves every token: enter arms it after a beat,
  // leave gives a grace period so the pointer can travel into the card.
  const [hover, setHover] = useState(null); // { chord, rect, key }
  const openT = useRef(null), closeT = useRef(null);
  const cancelTimers = () => { clearTimeout(openT.current); clearTimeout(closeT.current); };
  // Measure at OPEN time, not enter time — the page can scroll during the
  // delay (keyboard nav, programmatic scrolls) and a stale rect floats the
  // card into nowhere.
  const armCard = (el, chord, key, delay, focus = false) => {
    if (!guitar) return;
    cancelTimers();
    openT.current = setTimeout(() => {
      if (!el.isConnected) return;
      setHover({ chord, rect: el.getBoundingClientRect(), key, el, focus });
    }, delay);
  };
  const disarmCard = () => {
    if (!guitar) return;
    cancelTimers();
    closeT.current = setTimeout(() => setHover(null), 240);
  };
  const holdCard = () => cancelTimers();
  useEffect(() => cancelTimers, []);
  useEffect(() => { setHover(null); }, [text, transpose]);
  useEffect(() => {
    if (!hover) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      hover.el?.focus?.(); // hand focus back to the token that opened it
      setHover(null);
    };
    const onScroll = () => setHover(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [hover]);
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

  // Parse once per text/lens change, not per hover: hovering (and playback
  // stepping) restyles tokens but never re-parses the chart.
  const plan = useMemo(() => lines.map((line, i) => {
    const pos = tabLines.get(i);
    if (pos) return { kind: "tab", pos, line };
    if (isSectionHeader(line)) return { kind: "header", line };
    const info = chordLineInfo(line);
    if (!info) return { kind: "lyric", line };
    return {
      kind: "chords",
      line,
      tokens: info.tokens.map((tok) => {
        if (!tok.trim()) return { text: tok, gap: true };
        const parsed = parseChord(tok);
        if (!parsed) return { text: tok, plain: true };
        const view = transpose ? transposeChord(parsed, transpose) : parsed;
        const label = spellChord(view, activeKey);
        // Key-signature spelling for the tooltip — the piano lettering behind
        // a sharps-dialect label (hover G#, learn it's A♭ on paper).
        const piano = spellChord(view, activeKey ? { tonic, mode } : null);
        return { text: tok, view, fn: harmonicFunction(view, tonic, mode), label, piano: piano !== label ? piano : null };
      }),
    };
  }), [lines, tabLines, transpose, tonic, mode, activeKey]);

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
      {plan.map((entry, i) => {
        const line = entry.line;
        const tab = entry.kind === "tab" ? entry.pos : null;
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
        if (entry.kind === "header") {
          return (
            <div key={i} style={{ marginTop: 22, marginBottom: 4 }}>
              <span style={{ fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.2em", fontSize: 10, fontWeight: 500, color: C.rootText }}>
                [ {line.trim().replace(/^\[|\]$/g, "").replace(/:$/, "")} ]
              </span>
            </div>
          );
        }
        if (entry.kind === "chords") {
          return (
            <div key={i}>
              {entry.tokens.map((t, j) => {
                if (t.gap) return <span key={j}>{t.text}</span>;
                if (t.plain) return <span key={j} style={{ color: C.muted }}>{t.text}</span>;
                // Colors resolve at render (theme swap re-points the live C).
                const color = FUNCTION_COLOR[t.fn] || C.ink;
                const fnName = t.fn === "?" ? "chromatic" : t.fn;
                // Sound-based match: survives respelling (A# vs B♭) and transposition.
                const active = activeChord && sameChordSound(t.view, activeChord);
                const tokenKey = `${i}:${j}`;
                const lit = active || hover?.key === tokenKey;
                return (
                  <span key={j} role="button" tabIndex={0}
                    aria-label={guitar
                      ? `${t.label}${t.piano ? ` (piano: ${t.piano})` : ""} — ${fnName} function. Enter hears it; ArrowDown opens the guitar grip.`
                      : undefined}
                    onClick={() => onChordClick?.(t.view)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChordClick?.(t.view); }
                      else if (e.key === "ArrowDown" && guitar) { e.preventDefault(); armCard(e.currentTarget, t.view, tokenKey, 0, true); }
                    }}
                    onMouseEnter={(e) => armCard(e.currentTarget, t.view, tokenKey, 160)}
                    onMouseLeave={disarmCard}
                    onFocus={(e) => armCard(e.currentTarget, t.view, tokenKey, 0)}
                    onBlur={disarmCard}
                    title={guitar ? undefined : `${t.label}${t.piano ? ` (piano: ${t.piano})` : ""} — ${fnName} function · click to hear`}
                    style={{
                      fontWeight: 600, cursor: "pointer", borderRadius: 4,
                      color: lit ? "var(--kl-on-ink)" : color,
                      background: lit ? color : "transparent",
                      borderBottom: lit ? "2px solid transparent" : `2px solid ${color}`,
                      transition: "background 150ms ease, color 150ms ease",
                    }}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          );
        }
        return <div key={i} style={{ color: C.ink }}>{line || " "}</div>;
      })}
      {guitar && hover && (
        <ChordHoverCard chord={hover.chord} anchor={hover.rect} activeKey={activeKey}
          shapeTuning={guitar.shapeTuning} strumTuning={guitar.strumTuning} strumCapo={guitar.strumCapo}
          onPlayPiano={onChordClick} onStrum={guitar.onStrum}
          onPointerEnter={holdCard} onPointerLeave={disarmCard}
          focusOnOpen={hover.focus} />
      )}
    </div>
  );
}
