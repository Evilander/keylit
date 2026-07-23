import { useEffect, useMemo, useRef, useState } from "react";
import { keyGeometry } from "./Keyboard.jsx";
import { LOW_MIDI, HIGH_MIDI } from "../lib/voicing.js";
import { C, MONO } from "../ui/theme.js";

// WaterfallLane — visual anticipation for play-through. The NEXT few chords
// fall toward the keys they're about to light, each note-bar x-aligned with
// its real key below (same geometry as Keyboard), so the hand pre-shapes
// before the change lands. Colors keep the deck's grammar: bass gold, root
// tangerine, other tones cyan.
//
// Clock: the lane never schedules audio — it watches currentIdx change and
// anchors performance.now(), then falls at msPerChord. That tracks the plain
// Play-through interval exactly; when something else owns the stage (the
// Arranger's variable-length steps) or the player asked for reduced motion,
// it degrades to a static "on deck" preview of the next chord.
const LOOKAHEAD = 3;

export default function WaterfallLane({ prog, voicings, labels, mode, currentIdx, playing, msPerChord, height = 92 }) {
  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const anchor = useRef(performance.now());
  const [, setTick] = useState(0);

  useEffect(() => { anchor.current = performance.now(); }, [currentIdx, playing]);

  const falling = playing && !reduced;
  useEffect(() => {
    if (!falling) return;
    let raf;
    const loop = () => { setTick((t) => t + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [falling]);

  const upcoming = [];
  for (let k = 1; k <= LOOKAHEAD; k++) {
    const i = currentIdx + k;
    const ch = prog?.[i];
    if (!ch) break;
    let midis;
    if (mode === "shape") {
      // Shape lights every occurrence of each chord tone across the whole deck,
      // not one register — expand to all matching pitch classes so the preview
      // shows what will actually light.
      const pcs = new Set(ch.intervals.map((iv) => (ch.rootSemitone + iv) % 12));
      if (ch.bassSemitone != null) pcs.add(((ch.bassSemitone % 12) + 12) % 12);
      midis = [];
      for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) if (pcs.has(((m % 12) + 12) % 12)) midis.push(m);
    } else {
      midis = voicings?.[i] || [];
    }
    upcoming.push({ i, k, midis, label: labels?.[i] || ch.raw || "" });
  }
  if (!upcoming.length) return null;

  const windowMs = LOOKAHEAD * msPerChord;
  const elapsed = falling ? performance.now() - anchor.current : 0;

  return (
    <div style={{ position: "relative", height, overflow: "hidden", marginBottom: 10,
      borderBottom: `1px solid rgba(251,247,236,.14)` }}>
      <span style={{ position: "absolute", top: 6, left: 2, zIndex: 3, fontFamily: MONO,
        fontSize: 10, letterSpacing: "0.08em", color: "rgba(251,247,236,.5)" }}>
        next · {upcoming[0].label}
      </span>
      {upcoming.map(({ i, k, midis }) => {
        // Color by pitch class exactly as the keyboard will: bass gold only for
        // a real slash bass, root tangerine, everything else cyan (App keyRole).
        const rootPc = prog?.[i]?.rootSemitone;
        const bassPc = prog?.[i]?.bassSemitone;
        const bassCls = bassPc != null ? ((bassPc % 12) + 12) % 12 : null;
        // Distance to arrival decides depth; falling slides it down each frame,
        // static mode parks each chord at its share of the window.
        const toArrival = k * msPerChord - elapsed;
        const y = Math.max(0, Math.min(100, 100 - (toArrival / windowMs) * 100));
        const near = 1 - (k - 1) / LOOKAHEAD;
        return midis.map((m) => {
          const g = keyGeometry(m);
          if (!g) return null;
          const cls = ((m % 12) + 12) % 12;
          const fill = cls === bassCls ? C.bass : (cls === rootPc ? C.root : C.tone);
          return (
            <span key={`${i}-${m}`} aria-hidden="true"
              style={{ position: "absolute", left: `${g.left.toFixed(3)}%`, width: `${g.width.toFixed(3)}%`,
                top: `${y.toFixed(2)}%`, height: 7, borderRadius: 2,
                background: fill, opacity: 0.28 + 0.5 * near,
                boxShadow: near > 0.9 ? `0 0 8px ${fill}` : "none",
                transform: "translateY(-100%)",
                transition: falling ? "none" : "top 300ms ease" }} />
          );
        });
      })}
    </div>
  );
}
