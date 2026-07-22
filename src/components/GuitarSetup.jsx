import React, { useState } from "react";
import { ArrowRight, Guitar, Minus, Plus, Sparkles } from "lucide-react";
import { spellChord, spellPc } from "../lib/spelling.js";
import { shapeShiftForTuning, TUNINGS } from "../lib/tuning.js";
import { C, MONO } from "../ui/theme.js";
import { EngLabel, Faceplate } from "../ui/Bench.jsx";

const GUITAR_TUNING_IDS = ["standard", "ebStandard", "dStandard"];
const CHORD_NAME_OPTIONS = [
  { id: "sharps", label: "Guitar ♯", title: "Sharp names everywhere — G#, C#7, D# — the way the fretboard reads" },
  { id: "guitar", label: "Campfire", title: "The mixed set guitarists trade: C#, Eb, F#, Ab, Bb" },
  { id: "key", label: "Piano", title: "Key-signature spelling — what a piano chart prints (Ab, Db7, Eb)" },
  { id: "flats", label: "All ♭", title: "Always name black-key roots with flats" },
];

const signed = (n) => `${n > 0 ? "+" : ""}${n}`;

export default function GuitarSetup({
  tuningId,
  onTuningChange,
  capo,
  chartCapo,
  onCapoChange,
  onResetCapo,
  bestCapo,
  spelling,
  onSpellingChange,
  shapeChord,
  soundingChord,
  shapeKey,
  soundingKey,
  transpose,
  onUseDetunedSetup,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tuning = TUNINGS[tuningId] || TUNINGS.standard;
  const tuningShapeShift = shapeShiftForTuning(tuning.id) || 0;
  const capoChanged = capo !== chartCapo;
  const pitchEffects = [];
  if (tuningShapeShift > 0) {
    pitchEffects.push(`${tuning.name} lowers your guitar ${tuningShapeShift} semitone${tuningShapeShift === 1 ? "" : "s"}`);
  }
  if (capo > 0) pitchEffects.push(`capo ${capo} raises it ${capo}`);
  else if (chartCapo > 0) pitchEffects.push(`no capo removes the chart's ${chartCapo}-semitone lift`);
  const shapeLabel = shapeChord ? spellChord(shapeChord, shapeKey) : "—";
  const soundLabel = soundingChord ? spellChord(soundingChord, soundingKey) : "—";
  const shapeKeyName = shapeKey ? `${spellPc(shapeKey.tonic, shapeKey)} ${shapeKey.mode}` : "—";
  const soundKeyName = soundingKey ? `${spellPc(soundingKey.tonic, soundingKey)} ${soundingKey.mode}` : "—";
  const detuneCandidate = tuning.id === "standard" && (transpose === 1 || transpose === 2)
    ? (transpose === 1 ? TUNINGS.ebStandard : TUNINGS.dStandard)
    : null;
  const selectStyle = {
    fontFamily: "var(--kl-sans)", fontSize: 13, fontWeight: 600,
    color: C.ink, background: C.panel2, border: `1px solid ${C.line}`,
    borderRadius: 8, padding: "7px 28px 7px 9px", cursor: "pointer",
  };
  const stepButton = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 7, background: C.panel2,
    color: C.ink, border: `1px solid ${C.line}`, cursor: "pointer",
  };

  if (!isExpanded) {
    const spellingOption = CHORD_NAME_OPTIONS.find((o) => o.id === spelling)?.label || "Guitar ♯";
    const capoText = capo === 0 ? "no capo" : `capo ${capo}`;
    const summaryText = `${tuning.name} · ${capoText} · ${spellingOption} names`;

    return (
      <Faceplate label="Guitar setup"
        right={
          <button
            onClick={() => setIsExpanded(true)}
            className="bench-btn"
            style={{ padding: "4px 10px", fontSize: 11.5 }}
            aria-label="Expand guitar setup"
          >
            Adjust
          </button>
        }
        style={{ marginTop: 14, padding: "10px 14px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0" }}>
          <Guitar size={15} color={C.rootText} aria-hidden="true" />
          <span style={{ fontFamily: "var(--kl-sans)", fontSize: 13, fontWeight: 500, color: C.muted }}>
            {summaryText}
          </span>
          {tuningShapeShift > 0 && (
            <span className="eng-pill" style={{ fontSize: 10.5, padding: "2px 6px" }}>
              shapes {signed(tuningShapeShift)}
            </span>
          )}
          {bestCapo != null && bestCapo !== capo && (
            <span style={{ fontSize: 11.5, color: C.faint, fontStyle: "italic" }}>
              (easiest: {bestCapo === 0 ? "none" : bestCapo})
            </span>
          )}
        </div>
      </Faceplate>
    );
  }

  return (
    <Faceplate label="Guitar setup"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setIsExpanded(false)}
            className="bench-btn"
            style={{ padding: "4px 10px", fontSize: 11.5 }}
            aria-label="Collapse guitar setup"
          >
            Collapse
          </button>
          <span className="kl-meta">shapes move · sound stays</span>
        </div>
      }
      style={{ marginTop: 14, padding: 14 }}>
      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)", gap: 14, alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            <Guitar size={17} color={C.rootText} aria-hidden="true" />
            <EngLabel>My guitar</EngLabel>
            <select value={tuning.id} onChange={(e) => onTuningChange(e.target.value)} aria-label="My guitar tuning"
              title="Choose the tuning on the guitar in your hands"
              style={selectStyle}>
              {GUITAR_TUNING_IDS.map((id) => {
                const t = TUNINGS[id];
                const move = shapeShiftForTuning(id);
                return <option key={id} value={id}>{t.name}{move ? ` · shapes +${move}` : ""}</option>;
              })}
            </select>
            {tuningShapeShift > 0 && (
              <span className="eng-pill" title={`${tuning.name} sounds ${tuningShapeShift} semitones below standard`}>
                chart shapes {signed(tuningShapeShift)}
              </span>
            )}
          </div>

          <div className="flex items-center" style={{ gap: 9, flexWrap: "wrap" }}>
            <EngLabel>Capo</EngLabel>
            <button onClick={() => onCapoChange(Math.max(0, capo - 1))} style={stepButton} aria-label="Capo down a fret"><Minus size={14} /></button>
            <span style={{ fontFamily: MONO, fontSize: 14, minWidth: 54, textAlign: "center", color: capo ? C.rootText : C.muted }}>
              {capo === 0 ? "none" : `fret ${capo}`}
            </span>
            <button onClick={() => onCapoChange(Math.min(11, capo + 1))} style={stepButton} aria-label="Capo up a fret"><Plus size={14} /></button>
            {bestCapo != null && bestCapo !== capo && (
              <button onClick={() => onCapoChange(bestCapo)} className="chip" style={{ padding: "4px 9px", fontSize: 11.5 }}
                title="Use the capo position with the friendliest open shapes">
                easiest: {bestCapo === 0 ? "none" : bestCapo}
              </button>
            )}
            {capoChanged && (
              <button onClick={onResetCapo} className="chip" style={{ padding: "4px 9px", fontSize: 11.5 }}>
                chart setting
              </button>
            )}
          </div>

          <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            <EngLabel>Chord names</EngLabel>
            <div className="kl-seg" role="radiogroup" aria-label="Chart chord naming">
              {CHORD_NAME_OPTIONS.map((option) => (
                <button key={option.id} role="radio" aria-checked={spelling === option.id} title={option.title}
                  style={{ padding: "6px 10px" }} onClick={() => onSpellingChange(option.id)}>{option.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="readout" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="flex items-center" style={{ gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", minWidth: 86 }}>
              <EngLabel>Finger</EngLabel>
              <div key={`shape-${shapeLabel}`} className="kl-noteswap" style={{ fontFamily: MONO, fontSize: 25, fontWeight: 700, color: C.rootText, marginTop: 3 }}>{shapeLabel}</div>
            </div>
            <ArrowRight size={18} color={C.faint} aria-hidden="true" />
            <div style={{ textAlign: "center", minWidth: 86 }}>
              <EngLabel>Piano · sound</EngLabel>
              <div key={`sound-${soundLabel}`} className="kl-noteswap" style={{ fontFamily: MONO, fontSize: 25, fontWeight: 700, color: C.toneText, marginTop: 3 }}>{soundLabel}</div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 8, textAlign: "center", fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
            shapes in {shapeKeyName} · concert pitch {soundKeyName}
          </div>
          {pitchEffects.length > 0 && (
            <div style={{ marginTop: 7, textAlign: "center", fontSize: 12, lineHeight: 1.4, color: C.muted }}>
              {pitchEffects.join("; ")}. Keylit does the shape math; playback does not move.
            </div>
          )}
        </div>
      </div>

      {detuneCandidate && (
        <div className="flex items-center" style={{ gap: 9, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <Sparkles size={14} color={C.rootText} aria-hidden="true" />
          <span style={{ fontSize: 12.5, color: C.muted, flex: "1 1 360px" }}>
            Is <b style={{ color: C.ink }}>Transpose {signed(transpose)}</b> only compensating for a {detuneCandidate.name} guitar? Keep the song at its real pitch and move only the shapes.
          </span>
          <button className="bench-btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => onUseDetunedSetup(detuneCandidate.id)}>
            Use {detuneCandidate.name} shapes
          </button>
        </div>
      )}
    </Faceplate>
  );
}
