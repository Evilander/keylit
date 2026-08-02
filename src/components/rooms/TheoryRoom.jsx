// TheoryRoom.jsx — the Theory room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import { Play } from "lucide-react";
import { C, DISPLAY } from "../../ui/theme.js";
import { QuoteLine } from "../../ui/Bench.jsx";
import KeyWheel from "../KeyWheel.jsx";
import TheoryGuide from "../TheoryGuide.jsx";
import WheelLesson from "../WheelLesson.jsx";
import TensionStrip from "../TensionStrip.jsx";
import CapoTuning from "../CapoTuning.jsx";

export default function TheoryRoom({
  quote, theoryTab, setTheoryTab, view, activeKey, currentIdx, pickTonic, auditionChords,
  sendSongToWrite, setPracticeTab, setSection, keyName, keyFacts, moves, arm, setKeyOverride, selectIdx,
}) {
  return (
    <div className="kl-section">
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="kl-eyebrow">The map</div>
          <h1 className="kl-title" style={{ marginTop: 4 }}>Theory</h1>
          <QuoteLine quote={quote} style={{ marginTop: 10 }} />
        </div>
        <div className="kl-seg" role="tablist" aria-label="Theory view">
          <button role="tab" aria-selected={theoryTab === "circle"} onClick={() => setTheoryTab("circle")}>Circle of Fifths</button>
          <button role="tab" aria-selected={theoryTab === "tension"} onClick={() => setTheoryTab("tension")}>Tension</button>
          <button role="tab" aria-selected={theoryTab === "capo"} onClick={() => setTheoryTab("capo")}>Capo &amp; Tunings</button>
        </div>
      </div>
      {theoryTab === "circle" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, marginTop: 18, alignItems: "start" }} className="bench-cols">
          <div>
            <KeyWheel prog={view.prog} activeKey={activeKey} currentIdx={currentIdx}
              onPickTonic={pickTonic} onAudition={auditionChords} />
            <p style={{ color: C.faint, fontSize: 12, textAlign: "center", marginTop: 10 }}>
              C sits at noon, same as the printed chart. The dotted wedge wears your key — change key and watch it travel. Click any key to <b style={{ color: C.muted }}>hear it</b> and hand it the wedge; your song's chords stay lit by their job. The faint threads are the song's walk between them, worn deeper where it walks again.
            </p>
            <TheoryGuide activeKey={activeKey} onAudition={auditionChords} onGoWrite={sendSongToWrite} />
            <WheelLesson activeKey={activeKey} onAudition={auditionChords}
              onPickTonic={pickTonic}
              onDrill={() => { setPracticeTab("drills"); setSection("practice"); }} />
          </div>
          <div>
            <div className="kl-eyebrow">Key of {keyName} · {keyFacts.acc}</div>
            {Object.entries(moves).map(([k, mv]) => (
              <div key={k} style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 17, color: C.ink }}>{mv.title}</span>
                  {mv.chords ? (
                    <button className="bench-btn" style={{ padding: "4px 11px", fontSize: 12 }}
                      onClick={() => auditionChords(mv.chords)}>
                      <Play size={12} /> hear it
                    </button>
                  ) : (
                    <button className="bench-btn" style={{ padding: "4px 11px", fontSize: 12 }}
                      onClick={() => { arm(); setKeyOverride({ tonic: mv.pivotTonic, mode: mv.pivotMode }); }}>
                      go there
                    </button>
                  )}
                </div>
                <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>{mv.line}</p>
              </div>
            ))}
          </div>
        </div>
      ) : theoryTab === "tension" ? (
        <div style={{ marginTop: 18 }}>
          <TensionStrip prog={view.prog} activeKey={activeKey} currentIdx={currentIdx} onSelectIdx={selectIdx} />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <CapoTuning prog={view.prog} />
        </div>
      )}
    </div>
  );
}
