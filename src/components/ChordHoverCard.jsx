// ChordHoverCard.jsx — hover a chord in the chart, get the guitar grip.
// A floating card: the chord box (dots in Keylit's role colors), the shapes
// paged best-first, the fret string guitarists trade, and two ways to hear
// it — the piano voicing, or the actual guitar voicing rolled string by
// string at concert pitch. Presentational: ChartView decides when it lives.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Guitar, Piano } from "lucide-react";
import { chordShapes, shapeFingerString, shapeMidi } from "../lib/chordShapes.js";
import { STANDARD_TUNING } from "../lib/tuning.js";
import { spellChord, spellDegreePc } from "../lib/spelling.js";
import { nashville, harmonicFunction } from "../lib/theory.js";
import { C, MONO, FUNCTION_COLOR, FUNCTION_LABEL } from "../ui/theme.js";
import ChordDiagram from "./ChordDiagram.jsx";

const pcOf = (m) => ((m % 12) + 12) % 12;
const CARD_W = 216;

export default function ChordHoverCard({
  chord, anchor, activeKey,
  // Patterns are searched in shapeTuning; the strum sounds through
  // strumTuning + capo. For a uniformly detuned guitar those differ on
  // purpose — the reading chord already carries the shift, so the player
  // fingers familiar STANDARD shapes. A non-uniform (drop/open) tuning
  // must search its own fretboard or the frets would lie.
  shapeTuning = STANDARD_TUNING,
  strumTuning = STANDARD_TUNING, strumCapo = 0,
  onPlayPiano, onStrum,
  onPointerEnter, onPointerLeave,
  focusOnOpen = false,
}) {
  const [variant, setVariant] = useState(0);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const label = spellChord(chord, activeKey);
  const shapes = useMemo(() => chordShapes(chord, { tuning: shapeTuning, limit: 5 }), [chord, shapeTuning]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setVariant(0), [label]);
  const shape = shapes[Math.min(variant, shapes.length - 1)] || null;

  const fn = harmonicFunction(chord, activeKey?.tonic ?? 0, activeKey?.mode ?? "major");
  const degree = nashville(chord, activeKey?.tonic ?? 0);

  const noteLabels = useMemo(() => {
    if (!shape) return null;
    return shape.frets.map((f, s) =>
      f == null ? null : spellDegreePc(pcOf(shapeTuning[s] + f), activeKey)
    );
  }, [shape, shapeTuning, activeKey]);

  // Keyboard path: ArrowDown on a chord token lands focus on the first
  // button in here; focus anywhere inside keeps the card alive.
  useEffect(() => {
    if (focusOnOpen) ref.current?.querySelector("button")?.focus();
  }, [focusOnOpen]);

  // Place beside the token: below by default, above when the bottom is tight.
  useLayoutEffect(() => {
    if (!ref.current || !anchor) return;
    const h = ref.current.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - CARD_W / 2, vw - CARD_W - 8));
    let top = anchor.bottom + 10;
    if (top + h > vh - 8) top = anchor.top - h - 10;
    setPos({ left, top: Math.max(8, Math.min(top, vh - h - 8)) });
  }, [anchor, shape]);

  if (!chord || !anchor) return null;

  // Portaled to <body>: the app shell animates transforms (kl-rise), and a
  // transformed ancestor hijacks position:fixed — the card must live outside.
  const btn = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px",
    borderRadius: 8, background: C.panel2, color: C.ink, border: `1px solid ${C.line}`,
    cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "var(--kl-sans)",
  };
  const pagerBtn = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 20, height: 20, borderRadius: 6, background: "transparent",
    color: C.muted, border: `1px solid ${C.line}`, cursor: "pointer", padding: 0,
  };

  return createPortal(
    <div ref={ref} role="dialog" aria-label={`${label} on guitar`} className="kl-pop"
      onMouseEnter={onPointerEnter} onMouseLeave={onPointerLeave}
      onFocus={onPointerEnter}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onPointerLeave?.(); }}
      style={{
        position: "fixed", zIndex: 1000, width: CARD_W,
        left: pos ? pos.left : -9999, top: pos ? pos.top : -9999,
        background: C.panel, border: `1px solid ${C.lineStrong}`, borderRadius: 13,
        boxShadow: "0 14px 34px rgba(20,14,8,0.22), 0 3px 9px rgba(20,14,8,0.14)",
        padding: "11px 13px 12px",
      }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, color: C.ink }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: FUNCTION_COLOR[fn] }}>
          {degree} · {FUNCTION_LABEL[fn]}
        </span>
      </div>

      {shape ? (
        <>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <ChordDiagram shape={shape} tuning={shapeTuning}
              rootPc={pcOf(chord.rootSemitone)} bassPc={chord.bassSemitone}
              noteLabels={noteLabels} width={128} />
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, letterSpacing: "0.06em" }}>
              {shapeFingerString(shape)}
            </span>
            {shapes.length > 1 && (
              <span className="flex items-center" style={{ gap: 5 }}>
                <button style={pagerBtn} aria-label="previous shape"
                  onClick={(e) => { e.stopPropagation(); setVariant((v) => (v - 1 + shapes.length) % shapes.length); }}>
                  <ChevronLeft size={12} />
                </button>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>
                  {Math.min(variant, shapes.length - 1) + 1}/{shapes.length}
                </span>
                <button style={pagerBtn} aria-label="next shape"
                  onClick={(e) => { e.stopPropagation(); setVariant((v) => (v + 1) % shapes.length); }}>
                  <ChevronRight size={12} />
                </button>
              </span>
            )}
          </div>
        </>
      ) : (
        <div style={{ color: C.muted, fontSize: 12.5, margin: "10px 0" }}>
          No comfortable grip found for this one — good excuse to play it on the keys.
        </div>
      )}

      <div className="flex items-center" style={{ gap: 7, marginTop: 9 }}>
        <button style={btn} onClick={(e) => { e.stopPropagation(); onPlayPiano?.(chord); }}
          title="hear the piano voicing">
          <Piano size={13} color={C.toneUi} /> piano
        </button>
        {shape && (
          <button style={btn} title="roll the guitar voicing, low string to high"
            onClick={(e) => { e.stopPropagation(); onStrum?.(shapeMidi(shape, strumTuning, strumCapo)); }}>
            <Guitar size={13} color={C.rootUi} /> strum
          </button>
        )}
        {strumCapo > 0 && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.muted }}>
            capo {strumCapo}
          </span>
        )}
      </div>
    </div>,
    document.body
  );
}
