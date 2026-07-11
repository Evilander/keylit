// ChordDiagram.jsx — a classic vertical chord box (nut at top, low E left)
// that speaks Keylit's color language: the root dot glows amber, chord tones
// teal, a slash bass coral — the same roles the piano keys light. Pure
// presentational; geometry only, no state.
import { C, MONO } from "../ui/theme.js";

const pcOf = (m) => ((m % 12) + 12) % 12;

export default function ChordDiagram({
  shape,                 // { frets, fingers, barre, baseFret } from chordShapes
  tuning,                // MIDI per string (for coloring dots by role)
  rootPc,                // pitch class of the chord root
  bassPc = null,         // pitch class of a slash bass, if any
  noteLabels = null,     // optional per-string labels under the box
  width = 132,
}) {
  if (!shape) return null;
  const { frets, fingers, barre, baseFret } = shape;
  const n = frets.length;

  const maxRow = Math.max(
    4,
    ...frets.filter((f) => f != null && f > 0).map((f) => f - baseFret + 1)
  );
  const sw = 18, fh = 22;                    // string gap, fret gap
  const padX = 13, padTop = 30, padBot = noteLabels ? 18 : 8;
  const W = padX * 2 + (n - 1) * sw + (baseFret > 1 ? 22 : 0);
  const H = padTop + maxRow * fh + padBot;
  const sx = (s) => padX + s * sw;
  const rowY = (r) => padTop + (r - 0.5) * fh; // dot center inside fret r

  const roleColor = (midi) => {
    const p = pcOf(midi);
    if (bassPc != null && p === pcOf(bassPc) && p !== pcOf(rootPc)) return C.bass;
    if (p === pcOf(rootPc)) return C.root;
    return C.tone;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={(width * H) / W}
      role="img" aria-label="guitar chord diagram" style={{ display: "block" }}>
      {/* nut or base-fret label */}
      {baseFret === 1 ? (
        <rect x={sx(0) - 1.5} y={padTop - 4} width={(n - 1) * sw + 3} height={4.5} rx={2} fill={C.ink} />
      ) : (
        <text x={sx(n - 1) + 8} y={rowY(1) + 4} fontSize="11" fill={C.muted} style={{ fontFamily: MONO }}>
          {baseFret}fr
        </text>
      )}
      {/* frets */}
      {Array.from({ length: maxRow + 1 }, (_, r) => (
        <line key={r} x1={sx(0)} y1={padTop + r * fh} x2={sx(n - 1)} y2={padTop + r * fh}
          stroke={C.lineStrong} strokeWidth={1} />
      ))}
      {/* strings */}
      {Array.from({ length: n }, (_, s) => (
        <line key={s} x1={sx(s)} y1={padTop} x2={sx(s)} y2={padTop + maxRow * fh}
          stroke={C.faint} strokeWidth={1.5 - s * 0.12} />
      ))}
      {/* barre */}
      {barre && (
        <rect x={sx(barre.from) - 6.5} y={rowY(barre.fret - baseFret + 1) - 6.5}
          width={(barre.to - barre.from) * sw + 13} height={13} rx={6.5}
          fill={roleColor(tuning ? tuning[barre.from] + barre.fret : 0)} opacity={0.92} />
      )}
      {/* open / mute markers + dots */}
      {frets.map((f, s) => {
        if (f == null) {
          return (
            <g key={s} stroke={C.faint} strokeWidth={1.6} strokeLinecap="round">
              <line x1={sx(s) - 3.6} y1={padTop - 16} x2={sx(s) + 3.6} y2={padTop - 8.8} />
              <line x1={sx(s) + 3.6} y1={padTop - 16} x2={sx(s) - 3.6} y2={padTop - 8.8} />
            </g>
          );
        }
        const color = roleColor(tuning ? tuning[s] + f : 0);
        if (f === 0) {
          return <circle key={s} cx={sx(s)} cy={padTop - 12.4} r={4.2}
            fill="none" stroke={color} strokeWidth={1.8} />;
        }
        const r = f - baseFret + 1;
        const onBarre = barre && f === barre.fret && s >= barre.from && s <= barre.to;
        return (
          <g key={s}>
            <circle cx={sx(s)} cy={rowY(r)} r={7} fill={color}
              stroke={onBarre ? "none" : C.deckEdge} strokeWidth={onBarre ? 0 : 0.6} opacity={onBarre ? 0 : 1} />
            {!onBarre && fingers?.[s] ? (
              <text x={sx(s)} y={rowY(r) + 3.4} textAnchor="middle" fontSize="9.5" fontWeight="700"
                fill={C.deck} style={{ fontFamily: MONO }}>{fingers[s]}</text>
            ) : null}
          </g>
        );
      })}
      {/* barre finger number, once, at its first string */}
      {barre && (
        <text x={sx(barre.from)} y={rowY(barre.fret - baseFret + 1) + 3.4} textAnchor="middle"
          fontSize="9.5" fontWeight="700" fill={C.deck} style={{ fontFamily: MONO }}>1</text>
      )}
      {/* sounding note names under the box */}
      {noteLabels && frets.map((f, s) => (
        f == null ? null : (
          <text key={s} x={sx(s)} y={H - 5} textAnchor="middle" fontSize="8.5"
            fill={pcOf((tuning?.[s] ?? 0) + f) === pcOf(rootPc) ? C.rootText : C.muted}
            style={{ fontFamily: MONO }}>
            {noteLabels[s]}
          </text>
        )
      ))}
    </svg>
  );
}
