// LearnRoom.jsx — the Learn room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import { C, MONO } from "../../ui/theme.js";
import Keyboard from "../Keyboard.jsx";
import ScaleBuilder from "../ScaleBuilder.jsx";
import DegreeFinder from "../DegreeFinder.jsx";
import EarTrainer from "../EarTrainer.jsx";
import MeterFeel from "../MeterFeel.jsx";
import PedalLab from "../PedalLab.jsx";

export default function LearnRoom({
  quote, roleForKeyboard, playSingleKey, flash, learnTab, setLearnTab,
  tutor, onChipIntent, view, activeKey, loaded, auditionChords,
}) {
  return (
    <div className="kl-section">
      <div className="kl-eyebrow faint">The theory tutor</div>
      <h1 className="kl-title" style={{ marginTop: 12, marginBottom: 0, maxWidth: 760,
        fontSize: quote.q.length > 150 ? 26 : quote.q.length > 100 ? 32 : undefined }}>
        {quote.q}
      </h1>
      <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: "0.05em", color: C.muted, marginTop: 12 }}>— {quote.by}</div>
      <div className="deck" style={{ padding: "14px 16px", margin: "24px 0 18px" }}>
        <Keyboard height={150} roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash}
          ariaLabel="piano keyboard — the lesson is lit" />
      </div>
      {/* One lesson at the keyboard at a time — five stacked widgets used
          to share (and fight over) the lit deck in a single long scroll. */}
      <div className="kl-seg" role="tablist" aria-label="Learn area" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={learnTab === "scale"} onClick={() => setLearnTab("scale")}>Scale &amp; degrees</button>
        <button role="tab" aria-selected={learnTab === "ear"} onClick={() => setLearnTab("ear")}>The ear</button>
        <button role="tab" aria-selected={learnTab === "meter"} onClick={() => setLearnTab("meter")}>Meter</button>
        <button role="tab" aria-selected={learnTab === "pedal"} onClick={() => setLearnTab("pedal")}>The pedal</button>
      </div>
      {learnTab === "scale" && (
        <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}>
          <ScaleBuilder tutor={tutor} onIntent={onChipIntent} />
          <DegreeFinder tutor={tutor} onIntent={onChipIntent} />
        </div>
      )}
      {learnTab === "ear" && (
        <EarTrainer prog={view.prog} activeKey={activeKey} songTitle={loaded?.title} onPlaySeq={auditionChords} />
      )}
      {learnTab === "meter" && <MeterFeel tutor={tutor} />}
      {learnTab === "pedal" && <PedalLab tutor={tutor} onIntent={onChipIntent} />}
    </div>
  );
}
