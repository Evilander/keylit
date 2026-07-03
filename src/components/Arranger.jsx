// Arranger.jsx — style picker over lib/arrange.js: the chart played as piano
// MUSIC (ballad / waltz / boom-chick / broken), not block pads. Playback goes
// through the engine's beat scheduler via App (which also keeps the pad
// walker quiet while we drive the lights). Export writes the same events to
// a .mid via lib/midi.js#eventsToMidi — what you hear is what you export.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Download, Repeat } from "lucide-react";
import { STYLES, arrangeProgression } from "../lib/arrange.js";
import { eventsToMidi } from "../lib/midi.js";
import { C, MONO } from "../ui/theme.js";

export default function Arranger({ prog, title, onStart, onStepIdx }) {
  const [style, setStyle] = useState("ballad");
  const [bpm, setBpm] = useState(84);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef(null);
  const restartTimer = useRef(null);

  const arrangement = useMemo(
    () => (prog && prog.length ? arrangeProgression(prog, style) : null),
    [prog, style]
  );

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlaying(false);
  };

  const start = async () => {
    if (!arrangement) return;
    handleRef.current?.stop();
    const h = await onStart(arrangement, {
      bpm, loop,
      onStep: (e) => onStepIdx?.(e.stepIdx),
      onDone: () => setPlaying(false),
    });
    handleRef.current = h;
    setPlaying(true);
  };

  // Style or tempo turned mid-flight: restart the take (debounced for the slider).
  useEffect(() => {
    if (!playing) return;
    clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => { start(); }, 220);
    return () => clearTimeout(restartTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, bpm, loop]);

  useEffect(() => () => { handleRef.current?.stop(); }, []);
  // A different song while playing: stop rather than play the wrong chart.
  useEffect(() => { if (playing) stop(); /* eslint-disable-next-line */ }, [prog]);

  const exportMid = () => {
    if (!arrangement) return;
    const bytes = eventsToMidi(arrangement.events, { tempoBpm: bpm });
    const blob = new Blob([bytes], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(title || "keylit").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${style}.mid`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <span className="kl-eyebrow">The Arranger · styles, not block chords</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>{STYLES[style].line}</span>
      </div>
      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="kl-seg" role="tablist" aria-label="arrangement style">
          {Object.values(STYLES).map((s) => (
            <button key={s.id} role="tab" aria-selected={style === s.id} onClick={() => setStyle(s.id)}>{s.name}</button>
          ))}
        </div>
        <div className="flex items-center" style={{ gap: 7 }}>
          <input type="range" min={50} max={140} step={2} value={bpm} onChange={(e) => setBpm(Number(e.target.value))}
            style={{ width: 110, accentColor: C.toneUi }} aria-label="tempo" />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, minWidth: 58 }}>{bpm} bpm</span>
        </div>
        <button onClick={() => setLoop((v) => !v)} aria-pressed={loop} title="loop the chart"
          style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
            background: loop ? C.panel2 : "transparent", color: loop ? C.ink : C.muted,
            border: `1px solid ${loop ? C.toneUi : C.line}`, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Repeat size={12} /> loop
        </button>
        {playing ? (
          <button className="bench-btn primary" style={{ minWidth: 108 }} onClick={stop}><Square size={13} /> Stop</button>
        ) : (
          <button className="bench-btn primary" style={{ minWidth: 108 }} onClick={start} disabled={!arrangement}>
            <Play size={14} /> Play it
          </button>
        )}
        <button className="bench-btn" onClick={exportMid} disabled={!arrangement} title="export exactly this arrangement">
          <Download size={14} /> .mid
        </button>
      </div>
    </section>
  );
}
