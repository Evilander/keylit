import React, { useMemo } from "react";
import { CIRCLE_OF_FIFTHS, SHARP_NAMES, harmonicFunction } from "../lib/theory.js";
import { spellPc } from "../lib/spelling.js";
import { C, FUNCTION_COLOR, MONO } from "../ui/theme.js";

/**
 * KeyWheel — a circle of fifths that lights up the chords actually used in the
 * song, colored by their harmonic function relative to the active key. Click a
 * node to re-center the key. This is the "map" of where the song lives.
 *
 * Props:
 *  prog        : parsed chords (transposed view)
 *  activeKey   : { tonic, mode }
 *  currentIdx  : index of the playing/selected chord (gets a ring)
 *  onPickTonic : (semitone) => void
 */
export default function KeyWheel({ prog, activeKey, currentIdx, onPickTonic }) {
  const size = 188, cx = size / 2, cy = size / 2, r = 74, node = 16;

  // pitch classes present in the progression, and which one is "current"
  const present = useMemo(() => {
    const m = new Map();
    prog.forEach((ch, i) => {
      const pc = ch.rootSemitone;
      if (!m.has(pc)) m.set(pc, { func: harmonicFunction(ch, activeKey.tonic, activeKey.mode), count: 0 });
      m.get(pc).count++;
    });
    return m;
  }, [prog, activeKey.tonic, activeKey.mode]);

  const currentPc = prog[currentIdx]?.rootSemitone;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
      aria-label="circle of fifths showing the song's chords relative to the key"
      style={{ display: "block" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth={1} />
      {CIRCLE_OF_FIFTHS.map((pc, i) => {
        const angle = (i / 12) * 2 * Math.PI - Math.PI / 2; // start at top
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const info = present.get(pc);
        const isTonic = pc === activeKey.tonic;
        const isCurrent = pc === currentPc;
        const lit = !!info;
        const fill = isTonic ? C.root : lit ? FUNCTION_COLOR[info.func] : C.panel2;
        const textColor = (isTonic || lit) ? "#1c1305" : C.faint;
        return (
          <g key={pc} onClick={() => onPickTonic(pc)} style={{ cursor: "pointer" }}>
            {isCurrent && <circle cx={x} cy={y} r={node + 4} fill="none" stroke={C.toneGlow} strokeWidth={2} />}
            <circle cx={x} cy={y} r={node} fill={fill}
              stroke={lit || isTonic ? "#0008" : C.line} strokeWidth={1}
              style={{ filter: lit || isTonic ? `drop-shadow(0 0 6px ${fill}aa)` : "none", transition: "fill 200ms ease" }} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight={isTonic ? 800 : 600}
              fill={textColor} style={{ fontFamily: MONO, pointerEvents: "none" }}>
              {spellPc(pc, activeKey)}
            </text>
          </g>
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="10" fill={C.faint}
        style={{ fontFamily: MONO }}>circle of</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize="10" fill={C.faint}
        style={{ fontFamily: MONO }}>fifths</text>
    </svg>
  );
}
