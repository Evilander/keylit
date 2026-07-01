// Fretboard.jsx — a simple, readable guitar neck for the Practice drills.
// Draws 6 strings (low E at bottom) × N frets with position dots, and lights a
// single (string, fret) target. Pure presentational.
import { STANDARD_TUNING, pcOfString } from "../lib/tuning.js";
import { SHARP_NAMES } from "../lib/theory.js";
import { C, MONO } from "../ui/theme.js";

const DOTS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1, 17: 1 };

export default function Fretboard({ tuning = STANDARD_TUNING, highlight, frets = 12, onPick }) {
  const W = 580, H = 156, padL = 30, padR = 14, padT = 14, padB = 18;
  const bw = W - padL - padR, bh = H - padT - padB;
  const sGap = bh / 5, fGap = bw / frets;
  const stringY = (idx) => padT + (5 - idx) * sGap;   // idx 0 = low E at bottom
  const fretX = (f) => padL + f * fGap;               // f 0 = nut
  const dotX = (f) => (f === 0 ? padL - 12 : fretX(f) - fGap / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img" aria-label="guitar fretboard">
      {/* nut */}
      <rect x={padL - 3} y={padT - 2} width={4} height={bh + 4} rx={1} fill={C.ink} />
      {/* frets */}
      {Array.from({ length: frets }, (_, i) => i + 1).map((f) => (
        <line key={f} x1={fretX(f)} y1={padT} x2={fretX(f)} y2={padT + bh} stroke={C.line} strokeWidth={1} />
      ))}
      {/* position markers */}
      {Object.entries(DOTS).filter(([f]) => f <= frets).map(([f, n]) => {
        const x = fretX(Number(f)) - fGap / 2;
        const ys = n === 2 ? [padT + bh * 0.28, padT + bh * 0.72] : [padT + bh / 2];
        return ys.map((y, k) => <circle key={f + "-" + k} cx={x} cy={y} r={3} fill={C.lineStrong} />);
      })}
      {/* strings + open-note labels */}
      {Array.from({ length: 6 }, (_, idx) => (
        <g key={idx}>
          <line x1={padL} y1={stringY(idx)} x2={padL + bw} y2={stringY(idx)} stroke={C.faint} strokeWidth={0.6 + idx * 0.18} />
          <text x={12} y={stringY(idx) + 3.5} textAnchor="middle" fontSize="9.5" fill={C.faint} style={{ fontFamily: MONO }}>
            {SHARP_NAMES[pcOfString(tuning, idx)]}
          </text>
        </g>
      ))}
      {/* clickable fret cells (optional) */}
      {onPick && Array.from({ length: 6 }, (_, s) => Array.from({ length: frets + 1 }, (_, f) => (
        <rect key={s + ":" + f} x={f === 0 ? padL - 22 : fretX(f) - fGap} y={stringY(s) - sGap / 2}
          width={f === 0 ? 22 : fGap} height={sGap} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onPick(s, f)} />
      )))}
      {/* lit target */}
      {highlight && (
        <circle cx={dotX(highlight.fret)} cy={stringY(highlight.string)} r={9}
          fill={C.tone} stroke={C.toneUi} strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 5px ${C.tone})` }} />
      )}
    </svg>
  );
}
