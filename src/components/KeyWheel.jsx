import React, { useMemo } from "react";
import { CIRCLE_OF_FIFTHS, harmonicFunction, qualClass, buildChord } from "../lib/theory.js";
import { C, FUNCTION_FILL, MONO } from "../ui/theme.js";

/**
 * KeyWheel — the circle of fifths as an INSTRUMENT, not a diagram.
 *
 * The active key always sits at 12 o'clock: change key and the whole wheel
 * rotates under a fixed "home" wedge that covers the key, its two neighbors,
 * and their relative minors — the six chords (plus vii°) that always fit.
 * Clicking any node AUDITIONS that chord and recenters home onto it, so the
 * wheel is played, not read. Song chords glow by harmonic function.
 */
const MAJ = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];
const MIN = ["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm"];

export default function KeyWheel({ prog, activeKey, currentIdx, onPickTonic, onAudition }) {
  const size = 252, cx = size / 2, cy = size / 2, rMaj = 88, rMin = 57, nMaj = 17, nMin = 13;

  const { presentMaj, presentMin } = useMemo(() => {
    const maj = new Map(), min = new Map();
    (prog || []).forEach((ch) => {
      const pc = ch.rootSemitone;
      const target = qualClass(ch.quality) === "min" ? min : maj;
      if (!target.has(pc)) target.set(pc, { func: harmonicFunction(ch, activeKey.tonic, activeKey.mode) });
    });
    return { presentMaj: maj, presentMin: min };
  }, [prog, activeKey.tonic, activeKey.mode]);
  const currentPc = prog?.[currentIdx]?.rootSemitone;
  const currentIsMinor = prog?.[currentIdx] ? qualClass(prog[currentIdx].quality) === "min" : false;

  // Rotate so the active key's slot is on top (minor keys pivot via relative major).
  const homeMajPc = activeKey.mode === "minor" ? (activeKey.tonic + 3) % 12 : activeKey.tonic;
  const homeIdx = Math.max(0, CIRCLE_OF_FIFTHS.indexOf(homeMajPc));

  // Fixed home wedge: an annulus sector over the top three slots.
  const wedge = useMemo(() => {
    const a0 = -Math.PI / 2 - Math.PI / 4, a1 = -Math.PI / 2 + Math.PI / 4;
    const rO = rMaj + nMaj + 5, rI = rMin - nMin - 5;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return `M ${p(rO, a0)} A ${rO} ${rO} 0 0 1 ${p(rO, a1)} L ${p(rI, a1)} A ${rI} ${rI} 0 0 0 ${p(rI, a0)} Z`;
  }, []);

  const click = (pc, mode) => {
    onAudition?.(buildChord(pc, mode === "minor" ? "m" : "maj"));
    onPickTonic?.(pc, mode);
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img"
      aria-label="circle of fifths — your key sits at the top; click any key to hear it and make it home"
      style={{ display: "block", maxWidth: 440, margin: "0 auto" }}>
      <path d={wedge} fill={`${C.tone}14`} stroke={`${C.toneUi}55`} strokeWidth={1} strokeDasharray="3 3" />
      <text x={cx} y={cy - rMaj - nMaj - 10} textAnchor="middle" fontSize="8.5" fontWeight="700"
        fill={C.toneText} style={{ fontFamily: "var(--kl-sans)", letterSpacing: "0.09em" }}>HOME</text>
      <circle cx={cx} cy={cy} r={rMaj} fill="none" stroke={C.line} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rMin} fill="none" stroke={C.line} strokeWidth={1} strokeDasharray="2 3" />

      {CIRCLE_OF_FIFTHS.map((pc, i) => {
        // Slot relative to home — home lands on top, everything else follows.
        const slot = ((i - homeIdx) % 12 + 12) % 12;
        const angle = (slot / 12) * 2 * Math.PI - Math.PI / 2;
        const majPc = pc, minPc = (pc + 9) % 12;
        const [mx, my] = [cx + rMaj * Math.cos(angle), cy + rMaj * Math.sin(angle)];
        const [ix, iy] = [cx + rMin * Math.cos(angle), cy + rMin * Math.sin(angle)];

        const majTonic = activeKey.mode === "major" && majPc === activeKey.tonic;
        const minTonic = activeKey.mode === "minor" && minPc === activeKey.tonic;
        const majInfo = presentMaj.get(majPc);
        const minInfo = presentMin.get(minPc);
        const majFill = majTonic ? C.tone : majInfo ? FUNCTION_FILL[majInfo.func] : C.panel;
        const minFill = minTonic ? C.tone : minInfo ? FUNCTION_FILL[minInfo.func] : C.panel2;
        // Nodes animate to their new slot when the key changes (reduced-motion
        // kills transitions globally, so the wheel just snaps there).
        const move = { transition: "transform 560ms cubic-bezier(.22,1,.36,1)" };

        return (
          <g key={i}>
            <g style={{ ...move, transform: `translate(${mx}px, ${my}px)` }}
              onClick={() => click(majPc, "major")} cursor="pointer"
              role="button" aria-label={`hear ${MAJ[i]} major and make it home`}>
              {majPc === currentPc && !currentIsMinor && <circle r={nMaj + 4} fill="none" stroke={C.toneUi} strokeWidth={2} />}
              <circle r={nMaj} fill={majFill}
                stroke={majTonic ? C.toneUi : majInfo ? "transparent" : C.line} strokeWidth={majTonic ? 2 : 1} />
              <text y={4} textAnchor="middle" fontSize="12" fontWeight={majTonic ? 800 : 600}
                fill={majTonic || majInfo ? "#1c1305" : C.ink} style={{ fontFamily: MONO, pointerEvents: "none" }}>{MAJ[i]}</text>
            </g>
            <g style={{ ...move, transform: `translate(${ix}px, ${iy}px)` }}
              onClick={() => click(minPc, "minor")} cursor="pointer"
              role="button" aria-label={`hear ${MIN[i]} and make it home`}>
              {minPc === currentPc && currentIsMinor && <circle r={nMin + 3.5} fill="none" stroke={C.toneUi} strokeWidth={2} />}
              <circle r={nMin} fill={minFill}
                stroke={minTonic ? C.toneUi : minInfo ? "transparent" : C.line} strokeWidth={minTonic ? 2 : 1} />
              <text y={3.5} textAnchor="middle" fontSize="9.5" fontWeight={minTonic || minInfo ? 700 : 500}
                fill={minTonic || minInfo ? "#1c1305" : C.muted} style={{ fontFamily: MONO, pointerEvents: "none" }}>{MIN[i]}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
