import { memo, useMemo, useRef } from "react";
import { CIRCLE_OF_FIFTHS, harmonicFunction, qualClass, buildChord, wheelTrail } from "../lib/theory.js";
import { C, FUNCTION_FILL, MONO } from "../ui/theme.js";

/**
 * KeyWheel — the circle of fifths as an INSTRUMENT, not a diagram.
 *
 * The dial is the printed chart: C at noon, sharps clockwise, flats counter —
 * the letters never move. What moves is HOME: a dotted wedge that travels to
 * the active key, so changing key visibly swings the wedge (and your song's
 * lit chords) around the dial. Clicking any node AUDITIONS that chord and
 * hands it the wedge. Song chords glow by harmonic function.
 */
const MAJ = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];
const MIN = ["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm"];

const SPRING = "transform 560ms cubic-bezier(.22,1,.36,1)";

function KeyWheelBase({ prog, activeKey, currentIdx, onPickTonic, onAudition }) {
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

  // The wedge travels to the active key's slot (minor keys via relative major).
  const homeMajPc = activeKey.mode === "minor" ? (activeKey.tonic + 3) % 12 : activeKey.tonic;
  const homeIdx = Math.max(0, CIRCLE_OF_FIFTHS.indexOf(homeMajPc));

  // Continuous wedge angle: always swing the SHORT way (F→C is one step back,
  // not eleven forward), so the ref accumulates signed deltas across renders.
  const spin = useRef(null);
  if (spin.current === null) spin.current = { idx: homeIdx, deg: homeIdx * 30 };
  else if (spin.current.idx !== homeIdx) {
    const cur = ((spin.current.deg % 360) + 360) % 360;
    const delta = ((homeIdx * 30 - cur) % 360 + 540) % 360 - 180;
    spin.current = { idx: homeIdx, deg: spin.current.deg + delta };
  }
  const wedgeDeg = spin.current.deg;

  // Home wedge drawn at noon, then rotated onto the key: an annulus sector
  // over the key, its two neighbors, and their relative minors.
  const rO = rMaj + nMaj + 5, rI = rMin - nMin - 5;
  const wedge = useMemo(() => {
    const a0 = -Math.PI / 2 - Math.PI / 4, a1 = -Math.PI / 2 + Math.PI / 4;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return `M ${p(rO, a0)} A ${rO} ${rO} 0 0 1 ${p(rO, a1)} L ${p(rI, a1)} A ${rI} ${rI} 0 0 0 ${p(rI, a0)} Z`;
  }, []);
  // HOME rides the wedge: the outer group orbits it, the inner counter-rotation
  // (same spring, same clock) keeps the word upright the whole way around.
  const homeX = cx, homeY = cy - rO - 15;

  const click = (pc, mode) => {
    onAudition?.(buildChord(pc, mode === "minor" ? "m" : "maj"));
    onPickTonic?.(pc, mode);
  };

  // The song's walk drawn on the dial: one curve per traveled segment, sagging
  // toward the center the farther the jump (neighbors hug the rim, tritones
  // dive through the middle), growing thicker where the song walks it again.
  const trail = useMemo(() => wheelTrail(prog), [prog]);
  const nodeXY = (a) => {
    const angle = (a.slot / 12) * 2 * Math.PI - Math.PI / 2;
    const r = a.ring === "min" ? rMin : rMaj;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const segPath = (from, to) => {
    const [x1, y1] = nodeXY(from), [x2, y2] = nodeXY(to);
    const steps = Math.min(((to.slot - from.slot) % 12 + 12) % 12, ((from.slot - to.slot) % 12 + 12) % 12);
    const pull = 0.85 - 0.09 * steps;
    const qx = cx + ((x1 + x2) / 2 - cx) * pull, qy = cy + ((y1 + y2) / 2 - cy) * pull;
    return `M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`;
  };
  const curSeg = useMemo(() => {
    if (!prog?.length || currentIdx < 1) return null;
    const [seg] = wheelTrail([prog[currentIdx - 1], prog[currentIdx]]);
    return seg || null; // null when both chords share a node
  }, [prog, currentIdx]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="group"
      aria-label="circle of fifths — C at the top like the printed chart; the dotted wedge travels to your key; click any key to hear it and make it home"
      style={{ display: "block", maxWidth: 440, margin: "0 auto", overflow: "visible" }}>
      <g style={{ transform: `rotate(${wedgeDeg}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: SPRING }}>
        <path d={wedge} fill={`${C.tone}14`} stroke={`${C.toneUi}55`} strokeWidth={1} strokeDasharray="3 3" />
        <text x={homeX} y={homeY} textAnchor="middle" fontSize="8.5" fontWeight="700"
          fill={C.toneText}
          style={{ fontFamily: "var(--kl-sans)", letterSpacing: "0.09em",
            transform: `rotate(${-wedgeDeg}deg)`, transformOrigin: `${homeX}px ${homeY}px`, transition: SPRING }}>HOME</text>
      </g>
      <circle cx={cx} cy={cy} r={rMaj} fill="none" stroke={C.line} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rMin} fill="none" stroke={C.line} strokeWidth={1} strokeDasharray="2 3" />

      {trail.map((s, i) => (
        <path key={i} d={segPath(s.from, s.to)} fill="none" stroke={C.faint}
          strokeOpacity={0.28} strokeWidth={0.8 + Math.min(s.count, 4) * 0.45} strokeLinecap="round" />
      ))}
      {curSeg && (
        <path d={segPath(curSeg.from, curSeg.to)} fill="none" stroke={C.rootUi}
          strokeOpacity={0.75} strokeWidth={2} strokeLinecap="round" />
      )}

      {CIRCLE_OF_FIFTHS.map((pc, i) => {
        // Fixed dial: node i lives at slot i forever; only the wedge moves.
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
            <g style={{ transform: `translate(${mx}px, ${my}px)` }}
              onClick={() => click(majPc, "major")} cursor="pointer"
              role="button" tabIndex={0} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault(); event.stopPropagation(); click(majPc, "major");
                }
              }} aria-label={`hear ${MAJ[i]} major and make it home`}>
              {majPc === currentPc && !currentIsMinor && <circle r={nMaj + 4} fill="none" stroke={C.toneUi} strokeWidth={2} />}
              <circle r={nMaj} fill={majFill}
                stroke={majTonic ? C.toneUi : majInfo ? "transparent" : C.line} strokeWidth={majTonic ? 2 : 1} />
              <text y={4} textAnchor="middle" fontSize="12" fontWeight={majTonic ? 800 : 600}
                fill={majTonic || majInfo ? "#1c1305" : C.ink} style={{ fontFamily: MONO, pointerEvents: "none" }}>{MAJ[i]}</text>
            </g>
            <g style={{ transform: `translate(${ix}px, ${iy}px)` }}
              onClick={() => click(minPc, "minor")} cursor="pointer"
              role="button" tabIndex={0} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault(); event.stopPropagation(); click(minPc, "minor");
                }
              }} aria-label={`hear ${MIN[i]} and make it home`}>
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

export default memo(KeyWheelBase);
