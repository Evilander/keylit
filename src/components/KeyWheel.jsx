import React, { useMemo } from "react";
import { CIRCLE_OF_FIFTHS, harmonicFunction, qualClass } from "../lib/theory.js";
import { C, FUNCTION_FILL, MONO } from "../ui/theme.js";

/**
 * KeyWheel — a proper circle of fifths. Outer ring = the 12 major keys in
 * canonical order (C G D A E B F♯ D♭ A♭ E♭ B♭ F) with FIXED conventional
 * spellings (sharps on the sharp side, flats on the flat side — never a global
 * flip). Inner ring = each key's relative minor. Nodes light up for the chords
 * the song actually uses, colored by harmonic function. Click to re-center.
 */
// index in CIRCLE_OF_FIFTHS -> canonical label
const MAJ = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];
const MIN = ["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm"];

export default function KeyWheel({ prog, activeKey, currentIdx, onPickTonic }) {
  const size = 232, cx = size / 2, cy = size / 2, rMaj = 84, rMin = 55, nMaj = 17, nMin = 13;

  // Minor-quality chords light their node on the INNER (minor) ring; everything
  // else lights the outer major ring. Both colored by harmonic function.
  const { presentMaj, presentMin } = useMemo(() => {
    const maj = new Map(), min = new Map();
    prog.forEach((ch) => {
      const pc = ch.rootSemitone;
      const target = qualClass(ch.quality) === "min" ? min : maj;
      if (!target.has(pc)) target.set(pc, { func: harmonicFunction(ch, activeKey.tonic, activeKey.mode) });
    });
    return { presentMaj: maj, presentMin: min };
  }, [prog, activeKey.tonic, activeKey.mode]);
  const currentPc = prog[currentIdx]?.rootSemitone;
  const currentIsMinor = prog[currentIdx] ? qualClass(prog[currentIdx].quality) === "min" : false;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img"
      aria-label="circle of fifths: major keys outside, relative minors inside"
      style={{ display: "block", maxWidth: 430, margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={rMaj} fill="none" stroke={C.line} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rMin} fill="none" stroke={C.line} strokeWidth={1} strokeDasharray="2 3" />

      {CIRCLE_OF_FIFTHS.map((pc, i) => {
        const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
        const majPc = pc, minPc = (pc + 9) % 12;
        const [mx, my] = [cx + rMaj * Math.cos(angle), cy + rMaj * Math.sin(angle)];
        const [ix, iy] = [cx + rMin * Math.cos(angle), cy + rMin * Math.sin(angle)];

        const majTonic = activeKey.mode === "major" && majPc === activeKey.tonic;
        const minTonic = activeKey.mode === "minor" && minPc === activeKey.tonic;
        const majInfo = presentMaj.get(majPc);
        const minInfo = presentMin.get(minPc);
        const majFill = majTonic ? C.tone : majInfo ? FUNCTION_FILL[majInfo.func] : C.panel;
        const minFill = minTonic ? C.tone : minInfo ? FUNCTION_FILL[minInfo.func] : C.panel2;

        return (
          <g key={i}>
            {/* outer: major key */}
            <g onClick={() => onPickTonic(majPc, "major")} style={{ cursor: "pointer" }}>
              {majPc === currentPc && !currentIsMinor && <circle cx={mx} cy={my} r={nMaj + 4} fill="none" stroke={C.toneUi} strokeWidth={2} />}
              <circle cx={mx} cy={my} r={nMaj} fill={majFill}
                stroke={majTonic ? C.toneUi : majInfo ? "transparent" : C.line} strokeWidth={majTonic ? 2 : 1} />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize="12" fontWeight={majTonic ? 800 : 600}
                fill={majTonic || majInfo ? "#1c1305" : C.ink} style={{ fontFamily: MONO, pointerEvents: "none" }}>{MAJ[i]}</text>
            </g>
            {/* inner: relative minor */}
            <g onClick={() => onPickTonic(minPc, "minor")} style={{ cursor: "pointer" }}>
              {minPc === currentPc && currentIsMinor && <circle cx={ix} cy={iy} r={nMin + 3.5} fill="none" stroke={C.toneUi} strokeWidth={2} />}
              <circle cx={ix} cy={iy} r={nMin} fill={minFill}
                stroke={minTonic ? C.toneUi : minInfo ? "transparent" : C.line} strokeWidth={minTonic ? 2 : 1} />
              <text x={ix} y={iy + 3.5} textAnchor="middle" fontSize="9.5" fontWeight={minTonic || minInfo ? 700 : 500}
                fill={minTonic || minInfo ? "#1c1305" : C.muted} style={{ fontFamily: MONO, pointerEvents: "none" }}>{MIN[i]}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
