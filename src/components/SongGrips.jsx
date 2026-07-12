// SongGrips.jsx — the row of chord boxes a guitarist expects at the top of a
// chart: every distinct chord in the song, best grip first, derived for the
// tuning/capo lens the Guitar setup declares (so "capo 3" or "D standard"
// redraws every box honestly). Click a box to hear that grip strummed at
// concert pitch. Presentational; App owns the audio.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { chordShapes, shapeFingerString, shapeMidi } from "../lib/chordShapes.js";
import { spellChord } from "../lib/spelling.js";
import { STANDARD_TUNING } from "../lib/tuning.js";
import ChordDiagram from "./ChordDiagram.jsx";
import { Faceplate } from "../ui/Bench.jsx";
import { C, MONO } from "../ui/theme.js";

const pcOf = (m) => ((m % 12) + 12) % 12;

export default function SongGrips({
  chords, activeKey,
  shapeTuning = STANDARD_TUNING,
  strumTuning = STANDARD_TUNING, strumCapo = 0,
  onStrum,
}) {
  const [open, setOpen] = useState(true);

  const grips = useMemo(
    () => (chords || []).map((ch) => ({
      ch,
      label: spellChord(ch, activeKey),
      piano: spellChord(ch, activeKey ? { tonic: activeKey.tonic, mode: activeKey.mode } : null),
      shape: chordShapes(ch, { tuning: shapeTuning, limit: 1 })[0] || null,
    })),
    [chords, activeKey, shapeTuning]
  );

  if (!grips.length) return null;

  return (
    <Faceplate label={`Grips · ${grips.length}`} style={{ marginTop: 18, padding: open ? 14 : "10px 14px" }}
      right={
        <button className="bench-btn" style={{ padding: "3px 9px", fontSize: 11.5 }}
          onClick={() => setOpen((o) => !o)} aria-expanded={open}
          aria-label={open ? "fold the grips away" : "show every chord's grip"}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {open ? "fold" : "show"}
        </button>
      }>
      {open && (
        <div className="flex" style={{ gap: 9, flexWrap: "wrap" }}>
          {grips.map(({ ch, label, piano, shape }, i) => (
            <button key={i}
              onClick={() => shape && onStrum?.(shapeMidi(shape, strumTuning, strumCapo))}
              title={shape
                ? `${shapeFingerString(shape)}${piano !== label ? ` · piano says ${piano}` : ""} · click to strum`
                : `no comfortable grip${piano !== label ? ` · piano says ${piano}` : ""}`}
              aria-label={`${label} grip — click to strum`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                padding: "6px 7px 4px", borderRadius: 10, cursor: shape ? "pointer" : "default",
                background: C.panel, border: `1px solid ${C.line}`,
              }}>
              <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.ink }}>{label}</span>
              {shape ? (
                <ChordDiagram shape={shape} tuning={shapeTuning}
                  rootPc={pcOf(ch.rootSemitone)} bassPc={ch.bassSemitone} width={72} />
              ) : (
                <span style={{ fontSize: 10.5, color: C.faint, padding: "16px 4px" }}>keys only</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Faceplate>
  );
}
