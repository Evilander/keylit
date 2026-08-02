// PianoRoom.jsx — the Piano room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import { chordSymbol, displaySymbol, nashville, romanNumeral } from "../../lib/theory.js";
import { spellChord } from "../../lib/spelling.js";
import { C, MONO } from "../../ui/theme.js";
import { BenchButton } from "../../ui/Bench.jsx";
import WaterfallLane from "../WaterfallLane.jsx";
import Keyboard from "../Keyboard.jsx";
import Arranger from "../Arranger.jsx";

// Only the Piano room switches between Shape/Voicing/Smooth.
function Segmented({ label, value, onChange, options, dark }) {
  return (
    <div className="kl-seg" role="tablist" aria-label={label} style={dark ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" } : undefined}>
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          style={dark && value !== o.v ? { color: "#b8b0a4" } : undefined}>{o.t}</button>
      ))}
    </div>
  );
}

export default function PianoRoom({
  soundingCurrent, currentIdx, pitchShift, soundingKey, soundingView, view, capoShift, current,
  transpose, selectUnique, setSection, setImportTarget, setImportOpen, mode, arm, setMode, transport,
  isPlaying, tempo, roleForKeyboard, playSingleKey, flash, loaded, startArrangement, setCurrentIdx, tabKeysPanel,
}) {
  return (
    <div className="kl-section">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <div className="kl-eyebrow faint">The instrument</div>
          {soundingCurrent ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
                <div key={currentIdx + chordSymbol(soundingCurrent)} className="kl-noteswap"
                  style={{ fontFamily: MONO, fontSize: "clamp(44px, 8vw, 88px)", fontWeight: 600, lineHeight: 0.95, letterSpacing: "-0.02em", color: C.ink }}>
                  {displaySymbol(soundingCurrent, pitchShift)}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: C.root }}>{nashville(soundingCurrent, soundingKey.tonic)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 16, color: C.toneText }}>{romanNumeral(soundingCurrent, soundingKey.tonic, { next: soundingView.prog[currentIdx + 1], mode: soundingKey.mode })}</span>
                  </div>
                  <div className="kl-eyebrow faint" style={{ marginTop: 10 }}>
                    {soundingCurrent.section || "now playing"} · {currentIdx + 1} / {view.prog.length}
                    {capoShift > 0 && current && <> · written {displaySymbol(current, transpose)} (capo {capoShift})</>}
                  </div>
                </div>
              </div>
              {soundingView.unique.length > 0 && (
                <div style={{ marginTop: 26, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {soundingView.unique.map((ch, i) => {
                    const active = soundingCurrent && chordSymbol(soundingCurrent) === chordSymbol(ch);
                    const shown = displaySymbol(ch, pitchShift);
                    const piano = spellChord(ch, soundingKey);
                    return (
                      <button key={i} onClick={() => selectUnique(ch, soundingView.prog)}
                        title={piano !== shown ? `piano says ${piano}` : undefined}
                        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2,
                          fontFamily: MONO, padding: "9px 15px", borderRadius: 12, cursor: "pointer",
                          transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
                          border: `1.5px solid ${active ? C.ink : C.lineStrong}`,
                          background: active ? C.ink : "transparent",
                          color: active ? "var(--kl-on-ink)" : C.ink }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{shown}</span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>{nashville(ch, soundingKey.tonic)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 14 }}>
              <h1 className="kl-title">Nothing on the stand yet.</h1>
              <div className="flex items-center" style={{ gap: 8, marginTop: 16 }}>
                <BenchButton onClick={() => setSection("library")}>Pick from the Library</BenchButton>
                <BenchButton onClick={() => { setImportTarget("song"); setImportOpen(true); }}>Paste a chart or tab</BenchButton>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-end" }}>
          <Segmented label="Keys" value={mode} onChange={(v) => { arm(); setMode(v); }}
            options={[{ v: "shape", t: "Shape" }, { v: "voicing", t: "Voicing" }, { v: "smooth", t: "Smooth" }]} />
          {transport}
        </div>
      </div>
      <div className="deck" style={{ padding: "16px 18px", marginTop: 24 }}>
        <WaterfallLane prog={soundingView.prog}
          voicings={mode === "smooth" ? soundingView.smoothFull : soundingView.rootFull}
          labels={soundingView.prog.map((ch) => displaySymbol(ch, pitchShift))}
          mode={mode}
          currentIdx={currentIdx} playing={isPlaying} msPerChord={tempo} />
        <Keyboard height={210} roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash}
          ariaLabel="piano keyboard — the current chord is lit" />
      </div>
      <p style={{ color: C.faint, fontSize: 12.5, marginTop: 18, maxWidth: 620 }}>
        <b style={{ color: C.muted }}>Shape</b> lights every note of the chord across the deck. <b style={{ color: C.muted }}>Voicing</b> shows one close hand position. <b style={{ color: C.muted }}>Smooth</b> voice-leads from the chord before it — the least your hand can move.
      </p>
      <Arranger prog={soundingView.prog} title={loaded?.title || "your chart"}
        onStart={startArrangement} onStepIdx={setCurrentIdx} />
      {tabKeysPanel}
    </div>
  );
}
