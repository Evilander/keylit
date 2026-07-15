// TensionStrip.jsx — the song breathing, made visible AND diagnostic. The
// curve is an honest simplification after Lerdahl & Krumhansl (2007); the
// ▲/○ markers carry Huron's point that the pleasure lives where expectation
// bends. Below the picture: per-section levels and plain sentences —
// because a curve you glance at once is furniture, and a sentence that
// names the problem is a tool. Click any dot to land the app there.
import { useMemo } from "react";
import { tensionCurve, sectionTension, tensionDiagnosis } from "../lib/tension.js";
import { chordSymbol } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { C, FUNCTION_COLOR, MONO, DISPLAY } from "../ui/theme.js";

export default function TensionStrip({ prog, activeKey, currentIdx, onSelectIdx }) {
  const { points, markers } = useMemo(() => tensionCurve(prog, activeKey), [prog, activeKey]);
  const secs = useMemo(() => sectionTension(points), [points]);
  const advice = useMemo(() => tensionDiagnosis(prog, activeKey), [prog, activeKey]);

  if (!points.length) {
    return <p style={{ color: C.muted, fontSize: 14, marginTop: 16 }}>Put a song on the stand and its tension curve appears here.</p>;
  }

  const n = points.length;
  const W = Math.max(360, n * 22 + 40);
  const H = 130;
  const x = (i) => 24 + (i / Math.max(1, n - 1)) * (W - 48);
  const y = (t) => 14 + (1 - t) * (H - 40);
  const path = points.map((p, i) => `${i ? "L" : "M"} ${x(p.i)} ${y(p.t)}`).join(" ");
  const markAt = new Map(markers.map((m) => [m.i, m.kind]));

  // section boundaries for the bands beneath the curve
  const bounds = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].section !== points[i - 1].section) bounds.push(i);
  }

  return (
    <div>
      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <span className="kl-eyebrow">The tension curve</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>after Lerdahl &amp; Krumhansl (2007), simplified · ▲ surprise · ○ release · click a dot to land there</span>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel, padding: "8px 4px" }}>
        <svg width={W} height={H + 18} role="img" aria-label="harmonic tension over the song — higher is tenser">
          {/* rest / pull guide rails */}
          <line x1={20} x2={W - 20} y1={y(0.08)} y2={y(0.08)} stroke={C.line} strokeDasharray="2 4" />
          <text x={W - 22} y={y(0.08) - 3} textAnchor="end" fontSize="8.5" fill={C.faint} fontFamily="var(--kl-mono)">HOME</text>
          <line x1={20} x2={W - 20} y1={y(0.78)} y2={y(0.78)} stroke={C.line} strokeDasharray="2 4" />
          <text x={W - 22} y={y(0.78) - 3} textAnchor="end" fontSize="8.5" fill={C.faint} fontFamily="var(--kl-mono)">PULL</text>
          {bounds.map((i) => (
            <line key={i} x1={(x(i - 1) + x(i)) / 2} x2={(x(i - 1) + x(i)) / 2} y1={8} y2={H - 12} stroke={C.line} />
          ))}
          <path d={path} fill="none" stroke={C.lineStrong} strokeWidth={1.6} />
          {points.map((p) => {
            const kind = markAt.get(p.i);
            const color = FUNCTION_COLOR[p.fn] || C.muted;
            const cur = p.i === currentIdx;
            return (
              <g key={p.i} onClick={() => onSelectIdx?.(p.i)} cursor="pointer">
                {kind === "surprise" && <text x={x(p.i)} y={y(p.t) - 10} textAnchor="middle" fontSize="10" fill={C.rootText}>▲</text>}
                {kind === "release" && <circle cx={x(p.i)} cy={y(p.t)} r={8} fill="none" stroke={C.toneUi} strokeWidth={1.4} />}
                <circle cx={x(p.i)} cy={y(p.t)} r={cur ? 5.5 : 4} fill={color} stroke={cur ? C.ink : "transparent"} strokeWidth={1.6}>
                  <title>{`${spellChord(prog[p.i], activeKey) || chordSymbol(prog[p.i])} — ${p.fn === "T" ? "home" : p.fn === "S" ? "away" : p.fn === "D" ? "pull" : "chromatic"}`}</title>
                </circle>
                {p.section && (p.i === 0 || points[p.i - 1].section !== p.section) && (
                  <text x={x(p.i)} y={H + 12} fontSize="8.5" fill={C.muted} fontFamily="var(--kl-mono)" letterSpacing="0.1em">
                    {p.section.toUpperCase().slice(0, 14)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* per-section levels */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
        {secs.map((s) => (
          <div key={s.section} style={{ minWidth: 120 }}>
            <div className="kl-meta" style={{ marginBottom: 4 }}>{s.section}</div>
            <div style={{ height: 6, borderRadius: 3, background: C.panel2, border: `1px solid ${C.line}`, overflow: "hidden" }}>
              <div style={{ width: `${Math.round(s.mean * 100)}%`, height: "100%", background: s.mean > 0.6 ? C.root : s.mean > 0.35 ? C.bass : C.tone, transition: "width 300ms ease" }} />
            </div>
          </div>
        ))}
      </div>

      {/* the sentences */}
      {advice.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {advice.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line}`, alignItems: "baseline" }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 15, color: C.rootText, flex: "0 0 auto" }}>{i + 1}.</span>
              <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
