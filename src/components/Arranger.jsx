// Arranger.jsx — style picker over lib/arrange.js + lib/band.js: the chart
// played as MUSIC (ballad / waltz / boom-chick / broken / after hours), not
// block pads — with a rhythm section behind it. Bass on means the piano's
// left hand steps aside (arrangeBand drops the "L" events); drums are a
// synthesized kit; the count-off is a bar of stick clicks. Playback goes
// through the engine's beat scheduler via App. Export writes the same parts
// to a multi-track .mid via lib/midi.js#eventsToMidiTracks — what you hear
// is what you export, stem by stem.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Download, Repeat } from "lucide-react";
import { STYLES } from "../lib/arrange.js";
import { arrangeBand } from "../lib/band.js";
import { eventsToMidiTracks } from "../lib/midi.js";
import { C, MONO } from "../ui/theme.js";

export default function Arranger({ prog, title, onStart, onStepIdx }) {
  const [style, setStyle] = useState("ballad");
  const [bpm, setBpm] = useState(84);
  const [loop, setLoop] = useState(true);
  const [bass, setBass] = useState(true);
  const [drums, setDrums] = useState(true);
  const [count, setCount] = useState(false);
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef(null);
  const restartTimer = useRef(null);

  const arrangement = useMemo(
    () => (prog && prog.length ? arrangeBand(prog, style, { bass, drums, count }) : null),
    [prog, style, bass, drums, count]
  );

  const stop = () => {
    clearTimeout(restartTimer.current); // a queued restart must not outlive Stop
    handleRef.current?.stop();
    handleRef.current = null;
    setPlaying(false);
  };

  const start = async () => {
    if (!arrangement) return;
    handleRef.current?.stop();
    const h = await onStart(arrangement, {
      bpm, loop,
      // Count-in clicks carry no stepIdx — don't blank the highlight for them.
      onStep: (e) => { if (Number.isInteger(e.stepIdx)) onStepIdx?.(e.stepIdx); },
      // Every way a take can end clears any queued restart — a debounced
      // restart must never resurrect playback the player already left.
      onDone: () => { clearTimeout(restartTimer.current); setPlaying(false); },
      // Another surface took the stage: reset the transport, don't sit on "Stop".
      onCancel: () => { clearTimeout(restartTimer.current); setPlaying(false); },
    });
    handleRef.current = h;
    setPlaying(true);
  };

  // Style, tempo, or a band member turned mid-flight: restart the take
  // (debounced for the slider). Deliberately NOT keyed on `playing` — the
  // true-transition would queue a spurious restart right after every start.
  useEffect(() => {
    if (!playing) return;
    clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => { start(); }, 220);
    return () => clearTimeout(restartTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, bpm, loop, bass, drums, count]);

  useEffect(() => () => { handleRef.current?.stop(); }, []);
  // A different song while playing: stop rather than play the wrong chart.
  useEffect(() => { if (playing) stop(); /* eslint-disable-next-line */ }, [prog]);

  const exportMid = () => {
    if (!arrangement) return;
    // Stems, not a blob of notes: piano / upright bass / kit each on their own
    // track and channel (drums on 10, per General MIDI). The count-in stays
    // out of the file — a DAW has its own.
    const { tracks, beatsPerBar } = arrangement;
    const parts = [
      tracks.piano.length ? { name: "Piano", channel: 0, program: 0, events: tracks.piano } : null,
      tracks.bass.length ? { name: "Upright Bass", channel: 1, program: 32, events: tracks.bass } : null,
      tracks.drums.length ? { name: "Drums", channel: 9, events: tracks.drums } : null,
    ].filter(Boolean);
    const bytes = eventsToMidiTracks(parts, { tempoBpm: bpm, timeSig: { num: beatsPerBar, den: 4 } });
    const blob = new Blob([bytes], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const band = bass || drums ? "-band" : "";
    a.download = `${(title || "keylit").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${style}${band}.mid`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <span className="kl-eyebrow">The Arranger · styles, not block chords</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>
          {STYLES[style].line}
          {STYLES[style].swing ? " · swings, all three of them" : ""}
        </span>
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
        <div className="flex items-center" style={{ gap: 6 }} role="group" aria-label="the rhythm section">
          <span style={{ fontSize: 11, color: C.faint, letterSpacing: "0.04em" }}>with</span>
          {[
            { id: "bass", on: bass, set: setBass, label: "bass", title: "an upright takes the low end — the piano's left hand steps aside" },
            { id: "drums", on: drums, set: setDrums, label: "drums", title: "a synthesized kit, matched to the style" },
            { id: "count", on: count, set: setCount, label: "count-off", title: "one bar of clicks before the band comes in (and on every loop pass — the drummer counts you back in)" },
          ].map((m) => (
            <button key={m.id} onClick={() => m.set((v) => !v)} aria-pressed={m.on} title={m.title}
              style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                background: m.on ? C.panel2 : "transparent", color: m.on ? C.ink : C.muted,
                border: `1px solid ${m.on ? C.bassUi : C.line}` }}>
              {m.label}
            </button>
          ))}
        </div>
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
