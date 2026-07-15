// Metronome.jsx — the controller for the one metronome (audio/metronome.js).
// Full panel in Practice; `compact` renders the one-line transport other
// rooms (Perform) can embed. The engine keeps ticking when this unmounts.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Minus, Plus } from "lucide-react";
import { metronome } from "../audio/metronome.js";
import { METERS, meterById, clickPattern, tapTempo, tempoName } from "../lib/click.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

export default function Metronome({ compact = false }) {
  const [st, setSt] = useState(() => metronome.getState());
  const [lit, setLit] = useState(-1);
  const tapsRef = useRef([]);

  useEffect(() => metronome.subscribe(setSt), []);
  useEffect(() => metronome.onPulse((p) => setLit(p.step)), []);
  useEffect(() => { if (!st.running) setLit(-1); }, [st.running]);

  const pattern = useMemo(() => clickPattern(st.meterId, st.subdivision), [st.meterId, st.subdivision]);
  const meter = meterById(st.meterId);

  const tap = () => {
    const now = performance.now();
    tapsRef.current = [...tapsRef.current.slice(-7), now];
    const bpm = tapTempo(tapsRef.current);
    if (bpm) metronome.set({ bpm });
  };

  const nudge = (d) => metronome.set({ bpm: Math.max(30, Math.min(260, st.bpm + d)) });

  const onKey = (e) => {
    if (e.key === " ") { e.preventDefault(); metronome.toggle(); }
    else if (e.key === "t" || e.key === "T") { e.preventDefault(); tap(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); nudge(e.shiftKey ? 5 : 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); nudge(e.shiftKey ? -5 : -1); }
  };

  const lamps = (size = 1) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7 * size }} aria-hidden>
      {pattern.steps.map((s, i) => {
        const on = i === lit && st.running;
        const d = (s.kind === "accent" ? 13 : s.kind === "beat" ? 10 : 6) * size;
        const hue = s.kind === "accent" ? C.root : s.kind === "beat" ? C.ink : C.faint;
        return (
          <span key={i} style={{
            width: d, height: d, borderRadius: "50%",
            background: on ? hue : "transparent",
            border: `1.5px solid ${on ? hue : s.kind === "sub" ? C.line : C.lineStrong}`,
            transform: on && s.kind === "accent" ? "scale(1.25)" : "none",
            transition: "transform 80ms ease, background 60ms linear",
          }} />
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center" style={{ gap: 10 }} onKeyDown={onKey} tabIndex={0} aria-label="metronome">
        <button className={`bench-btn${st.running ? "" : " primary"}`} style={{ padding: "6px 12px", fontSize: 12 }}
          onClick={() => metronome.toggle()} aria-pressed={st.running}>
          {st.running ? <Square size={12} /> : <Play size={12} />} {st.running ? "stop" : "click"}
        </button>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.ink, minWidth: 34, textAlign: "right" }}>{st.bpm}</span>
        <input type="range" min={30} max={260} value={st.bpm} onChange={(e) => metronome.set({ bpm: +e.target.value })}
          style={{ width: 90, accentColor: C.root }} aria-label="tempo" />
        <button className="bench-btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={tap}>tap</button>
        {lamps(0.8)}
      </div>
    );
  }

  return (
    <div className="faceplate" style={{ maxWidth: 560, padding: "20px 24px" }} onKeyDown={onKey} tabIndex={0} aria-label="metronome — space starts, T taps, arrows nudge">
      <div className="kl-eyebrow">The click</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 600, lineHeight: 0.95, letterSpacing: "-0.02em", color: C.ink }}>
            {st.bpm}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, color: C.muted, marginTop: 6 }}>
            {tempoName(st.bpm)}
            <span className="kl-meta" style={{ marginLeft: 8, color: C.faint }}>bpm · the {meter.pulsesPerBeat > 1 ? "dotted quarter" : "quarter"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <button className="bench-btn" style={{ padding: "8px 12px" }} onClick={() => nudge(-5)} aria-label="five slower">−5</button>
          <button className="bench-btn" style={{ padding: "8px 12px" }} onClick={() => nudge(-1)} aria-label="one slower"><Minus size={14} /></button>
          <button className="bench-btn" style={{ padding: "8px 12px" }} onClick={() => nudge(1)} aria-label="one faster"><Plus size={14} /></button>
          <button className="bench-btn" style={{ padding: "8px 12px" }} onClick={() => nudge(5)} aria-label="five faster">+5</button>
        </div>
      </div>

      <input type="range" min={30} max={260} value={st.bpm} onChange={(e) => metronome.set({ bpm: +e.target.value })}
        style={{ width: "100%", accentColor: C.root, marginTop: 14 }} aria-label="tempo slider" />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button className={`bench-btn${st.running ? "" : " primary"}`} style={{ minWidth: 120 }}
          onClick={() => metronome.toggle()} aria-pressed={st.running}>
          {st.running ? <><Square size={14} /> Stop</> : <><Play size={14} /> Start</>}
        </button>
        <button className="bench-btn" onClick={tap} title="tap the tempo (T)">Tap tempo</button>
        <div style={{ marginLeft: "auto" }}>{lamps()}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <label className="kl-meta" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          meter
          <select value={st.meterId} onChange={(e) => metronome.set({ meterId: e.target.value })} aria-label="meter"
            style={{ background: C.panel, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 7px", fontSize: 13, fontFamily: MONO }}>
            {METERS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {meter.simple && (
          <div className="kl-seg" role="radiogroup" aria-label="subdivision">
            {[{ v: 1, t: "♩" }, { v: 2, t: "♫" }, { v: 3, t: "3" }, { v: 4, t: "♬" }].map((o) => (
              <button key={o.v} role="radio" aria-checked={st.subdivision === o.v} title={{ 1: "quarters", 2: "eighths", 3: "triplets", 4: "sixteenths" }[o.v]}
                onClick={() => metronome.set({ subdivision: o.v })} style={{ padding: "5px 12px" }}>
                {o.t}
              </button>
            ))}
          </div>
        )}
        <label className="kl-meta" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          volume
          <input type="range" min={0} max={100} value={st.volume} onChange={(e) => metronome.set({ volume: +e.target.value })}
            style={{ width: 90, accentColor: C.tone }} aria-label="click volume" />
        </label>
      </div>
      <p style={{ fontSize: 12, color: C.faint, margin: "12px 0 0" }}>
        space starts and stops · T taps the tempo · ↑↓ nudge (shift for ±5) — and the click keeps
        going when you walk to another room.
      </p>
    </div>
  );
}
