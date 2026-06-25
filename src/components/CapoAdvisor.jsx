import React, { useMemo } from "react";
import { Guitar, Minus, Plus, Sparkles } from "lucide-react";
import { chordSymbol, shapeForCapo, shapeEase, suggestCapo } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { C, MONO } from "../ui/theme.js";

/**
 * CapoAdvisor — guitarist's bridge. A capo on fret N lets you play the song's
 * (possibly awkward) chords using easier open shapes fingered N frets lower.
 * Shows the shapes for the current capo and recommends the easiest position.
 *
 * Props:
 *  prog     : parsed sounding chords (transposed view) — what the song sounds like
 *  capo     : current capo fret (0-11)
 *  setCapo  : (fret) => void
 */
export default function CapoAdvisor({ prog, capo, setCapo, keyCtx }) {
  const ranked = useMemo(() => (prog.length ? suggestCapo(prog, { maxFret: 7 }) : []), [prog]);
  const best = ranked[0];
  const openHere = ranked.find((r) => r.fret === capo);

  // unique sounding chords → the shapes you finger at the current capo
  const shapes = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const ch of prog) {
      const k = chordSymbol(ch);
      if (seen.has(k)) continue;
      seen.add(k);
      const shape = shapeForCapo(ch, capo);
      out.push({ sounding: ch, shape, easy: shapeEase(shape) <= 1.5 });
    }
    return out;
  }, [prog, capo]);

  if (!prog.length) return null;

  // Only trust a capo recommendation when it MEANINGFULLY simplifies: it must turn
  // a healthy share of the chords into genuine open shapes and beat capo-0 clearly.
  // Songs full of 7ths/extensions (jazz, Bacharach, Pet Sounds) won't qualify — and
  // we say so honestly rather than confidently suggesting a capo that doesn't help.
  const capo0 = ranked.find((r) => r.fret === 0);
  // Scale-relative: the best capo must open up at least half the chords AND be a
  // clear win over no-capo (≥20% easier), so a noise-level margin on a long chart
  // doesn't trumpet a recommendation. (totalEase is frequency-weighted.)
  const meaningful = !!best && best.fret > 0 &&
    best.openCount >= Math.ceil(shapes.length / 2) &&
    (capo0 ? best.totalEase <= capo0.totalEase * 0.8 : true);

  return (
    <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px" }}>
      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        <Guitar size={17} color={C.root} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Capo &amp; Shapes</span>
        <span style={{ fontSize: 12, color: C.faint }}>play this song with easy open chords</span>

        <div className="flex items-center" style={{ gap: 8, marginLeft: "auto", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 8px" }}>
          <span style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.1em" }}>Capo</span>
          <button onClick={() => setCapo(Math.max(0, capo - 1))} style={miniBtn} aria-label="Capo down"><Minus size={14} /></button>
          <span style={{ fontFamily: MONO, fontSize: 14, minWidth: 44, textAlign: "center", color: capo ? C.root : C.muted }}>
            {capo === 0 ? "open" : `fret ${capo}`}
          </span>
          <button onClick={() => setCapo(Math.min(11, capo + 1))} style={miniBtn} aria-label="Capo up"><Plus size={14} /></button>
        </div>
      </div>

      {/* best-capo recommendation — a secondary hint with a one-click apply */}
      {best && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Sparkles size={14} color={C.root} />
          {meaningful ? (
            <>
              <span style={{ fontSize: 12.5, color: C.muted }}>
                Tip: <b style={{ color: C.ink }}>capo {best.fret}</b> gives the easiest open shapes.
              </span>
              {capo !== best.fret && (
                <button onClick={() => setCapo(best.fret)}
                  style={{ fontSize: 12, fontWeight: 600, color: "#1c1305", background: C.root, border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
                  use capo {best.fret}
                </button>
              )}
              {capo !== 0 && (
                <button onClick={() => setCapo(0)}
                  style={{ fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                  no capo
                </button>
              )}
            </>
          ) : best.openCount >= Math.ceil(shapes.length / 2) ? (
            <span style={{ fontSize: 12.5, color: C.muted }}>
              These chords are already guitar-friendly in open position — no capo needed, but try one below to play at the original pitch.
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: C.muted }}>
              These chords (lots of 7ths &amp; extensions) don&rsquo;t reduce to easy open shapes — this one sits better on piano. A capo still lets you play along at the original pitch.
            </span>
          )}
        </div>
      )}

      {/* fingered shapes for the CURRENT capo — always visible, updates as you step */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
          {capo === 0 ? "No capo — play the chords as written" : `Capo ${capo} — finger these shapes`}
        </div>
        <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
          {shapes.map((s, i) => (
            <div key={i} title={capo === 0 ? "" : `sounds like ${spellChord(s.sounding, keyCtx)}`}
              style={{ background: C.panel2, border: `1px solid ${s.easy ? C.tone : C.line}`, borderRadius: 9, padding: "7px 11px", textAlign: "center", minWidth: 52 }}>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: s.easy ? C.tone : C.ink }}>{spellChord(s.shape, keyCtx)}</div>
              {capo > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginTop: 2 }}>sounds {spellChord(s.sounding, keyCtx)}</div>
              )}
            </div>
          ))}
        </div>
        {capo > 0 && (
          <p style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
            Each card is the open shape you finger; below it is the chord it actually sounds. The piano shows the real (sounding) chords.
          </p>
        )}
      </div>
    </div>
  );
}

const miniBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 7, background: "#2a241e",
  color: "#ece6dd", border: "1px solid #3a322a", cursor: "pointer",
};
