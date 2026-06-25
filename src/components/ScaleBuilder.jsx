// ScaleBuilder.jsx — the Learn-room centerpiece. Two modes:
//  • Scale: the W-W-H-W-W-W-H formula made physical (degrees lit on the keys,
//    half-steps flagged, forced sharps/flats explained in a bandmate's voice).
//  • Chords: stack thirds on each degree -> the 7 diatonic chords with Nashville
//    + Roman + notes + function, each playable on the shared keyboard.
import { useState, useEffect } from "react";
import {
  spellScale, diatonicChord, nashville, romanNumeral, chordSymbol, harmonicFunction,
} from "../lib/theory.js";
import { spellPc } from "../lib/spelling.js";
import { CONCEPTS, buildSuggestionChips } from "../lib/voice.js";
import { C, FUNCTION_COLOR, FUNCTION_LABEL, MONO, DISPLAY } from "../ui/theme.js";
import { Faceplate, BenchButton, SuggestionChips } from "../ui/Bench.jsx";

export default function ScaleBuilder({ tutor, onIntent }) {
  const { activeKey } = tutor;
  const tonic = activeKey.tonic;
  const keyMode = activeKey.mode;
  const [view, setView] = useState("scale"); // scale | chords
  const [sevenths, setSevenths] = useState(false);
  const [pick, setPick] = useState(0); // selected degree (chords) / step (scale derive)
  const [derive, setDerive] = useState(false);

  const scale = spellScale(tonic, keyMode);
  const keyName = `${spellPc(tonic, activeKey)} ${keyMode}`;

  const chords = scale.map((_, d) => diatonicChord(tonic, keyMode, d, sevenths));

  // Drive the shared keyboard from whatever's on screen.
  useEffect(() => {
    if (view === "scale") {
      const upTo = derive ? pick : 6;
      const entries = scale
        .filter((s) => s.degree - 1 <= upTo)
        .map((s) => ({ pc: s.semitone, role: s.degree === 1 ? "root" : "scale", label: String(s.degree) }));
      tutor.light(entries);
    } else {
      const ch = chords[pick];
      if (!ch) { tutor.light(null); return; }
      const entries = ch.intervals.map((iv) => {
        const pc = (ch.rootSemitone + iv) % 12;
        return { pc, role: iv === 0 ? "root" : "tone", label: spellPc(pc, activeKey) };
      });
      tutor.light(entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, derive, pick, sevenths, tonic, keyMode]);

  // Clear the lesson light when this widget leaves the screen.
  useEffect(() => () => tutor.light(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = buildSuggestionChips({ key: activeKey, chord: view === "chords" ? chords[pick] : null, lesson: "scale" });

  const Connector = ({ step }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 2px", minWidth: 22 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: step === "H" ? C.bass : C.faint }}>{step}</span>
      <span style={{ width: step === "H" ? 8 : 16, height: 2, borderRadius: 2, background: step === "H" ? C.bass : C.line, marginTop: 3 }} />
    </div>
  );

  return (
    <Faceplate label={`scale workshop · ${keyName}`} right={
      <div className="room-tabs" style={{ padding: 4 }}>
        <button className="room-tab" aria-selected={view === "scale"} onClick={() => { setView("scale"); setPick(0); }} style={{ padding: "5px 12px", fontSize: 12 }}>Scale</button>
        <button className="room-tab" aria-selected={view === "chords"} onClick={() => { setView("chords"); setPick(0); }} style={{ padding: "5px 12px", fontSize: 12 }}>Chords</button>
      </div>
    }>
      {view === "scale" ? (
        <div>
          <div className="flex items-center" style={{ gap: 2, flexWrap: "wrap", marginBottom: 12 }}>
            {scale.map((s, i) => {
              const lit = !derive || i <= pick;
              const justSnapped = derive && i === pick && s.name.length > 1;
              return (
                <div key={i} className="flex items-center">
                  <button onClick={() => { tutor.playPc(s.semitone); setPick(i); }}
                    className={justSnapped ? "kl-snap" : ""}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      padding: "8px 11px", borderRadius: 10, cursor: "pointer",
                      background: s.degree === 1 ? "rgba(240,180,41,0.14)" : lit ? C.panel2 : "transparent",
                      border: `1px solid ${s.degree === 1 ? C.root : lit ? C.line : C.soft || C.line}`,
                      opacity: lit ? 1 : 0.4, transition: "opacity 200ms ease, background 160ms ease",
                    }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: s.degree === 1 ? C.root : C.faint }}>{s.degree}</span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{s.name}</span>
                  </button>
                  {i < scale.length - 1 && <Connector step={s.stepType} />}
                </div>
              );
            })}
          </div>

          <p style={{ color: C.ink, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 6px", maxWidth: 640 }}>
            {CONCEPTS["scale-formula"]?.line}
          </p>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 12px", maxWidth: 640 }}>
            {CONCEPTS["scale-formula"]?.bridge}
          </p>

          <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            <BenchButton onClick={() => { setDerive(true); setPick(0); }}>Derive it ↑</BenchButton>
            {derive && (
              <>
                <BenchButton onClick={() => setPick((p) => Math.min(6, p + 1))} disabled={pick >= 6}>Next degree</BenchButton>
                <BenchButton onClick={() => { setDerive(false); setPick(0); }}>Show all</BenchButton>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>
                  {pick + 1} of 7 · {spellPc(scale[pick].semitone, activeKey)}
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-stretch kl-stagger" style={{ gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
            {chords.map((ch, d) => {
              if (!ch) return null;
              const fn = harmonicFunction(ch, tonic, keyMode);
              const fnColor = FUNCTION_COLOR[fn] || C.faint;
              const active = d === pick;
              return (
                <button key={d} onClick={() => { setPick(d); tutor.playChord(ch); }} title={`${FUNCTION_LABEL[fn]} function`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    padding: "9px 12px", borderRadius: 11, cursor: "pointer", minWidth: 64,
                    background: active ? "rgba(240,180,41,0.10)" : C.panel,
                    border: `1px solid ${active ? C.root : C.line}`,
                    borderBottom: `3px solid ${active ? C.root : fnColor}`,
                    transition: "background 140ms ease, border-color 140ms ease",
                  }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: fnColor }}>{romanNumeral(ch, tonic)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: C.ink }}>{chordSymbol(ch)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{nashville(ch, tonic)}</span>
                </button>
              );
            })}
          </div>

          <p style={{ color: C.ink, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 6px", maxWidth: 640 }}>
            {CONCEPTS["diatonic-qualities"]?.line}
          </p>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 12px", maxWidth: 640 }}>
            {CONCEPTS["diatonic-qualities"]?.bridge}
          </p>

          <label className="flex items-center" style={{ gap: 8, cursor: "pointer", fontSize: 13, color: C.muted, userSelect: "none" }}>
            <input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} style={{ accentColor: C.tone }} />
            add the diatonic 7th (Imaj7 · ii7 · V7 · viiø)
          </label>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <SuggestionChips chips={chips} onIntent={onIntent} />
      </div>
    </Faceplate>
  );
}
