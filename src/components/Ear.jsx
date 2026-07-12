// Ear.jsx — "hear the record": drop an audio file, get a chord chart. The
// DSP brain is lib/ear.js (pure, tested); this file is decode + progress +
// the confidence timeline. HARD PROMISE: the audio is decoded and analyzed
// in this tab and never leaves the machine — there is no upload path here.
import { useRef, useState } from "react";
import { Disc3, FileAudio, RotateCcw, ScrollText, X } from "lucide-react";
import { frameChroma, finishDetection, summarizeSegments } from "../lib/ear.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const TARGET_SR = 22050;
const SIZE = 8192, HOP = 4096;

const confColor = (c) => (c >= 0.6 ? C.tone : c >= 0.42 ? C.root : C.bass);
const confGlow = (c) => (c >= 0.6 ? C.toneGlow : c >= 0.42 ? C.rootGlow : C.bassGlow);

export default function Ear({ onLoadSheet, onClose }) {
  const [phase, setPhase] = useState("idle"); // idle|decoding|listening|done|error
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);   // { segments, key, sheet, symbolFor }
  const [dragOver, setDragOver] = useState(false);
  const cancelRef = useRef(false);

  const analyze = async (file) => {
    if (!file) return;
    cancelRef.current = false;
    setFileName(file.name.replace(/\.[a-z0-9]+$/i, ""));
    setError(null);
    setResult(null);
    setPhase("decoding");
    try {
      const buf = await file.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const decoded = await ac.decodeAudioData(buf);
      ac.close?.();
      if (decoded.duration > 15 * 60) throw new Error("That's a long record — try something under 15 minutes.");
      const oac = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SR), TARGET_SR);
      const src = oac.createBufferSource();
      src.buffer = decoded;
      src.connect(oac.destination);
      src.start();
      const mono = (await oac.startRendering()).getChannelData(0);

      setPhase("listening");
      const count = Math.max(0, Math.floor((mono.length - SIZE) / HOP) + 1);
      if (count < 4) throw new Error("Too short to hear a progression in.");
      const frames = [];
      for (let i = 0; i < count; i++) {
        if (cancelRef.current) return;
        frames.push(frameChroma(mono, i * HOP, SIZE, TARGET_SR));
        if (i % 24 === 0) {
          setProgress(i / count);
          await new Promise((r) => setTimeout(r, 0));   // keep the bench responsive
        }
      }
      setResult(finishDetection(frames, HOP / TARGET_SR));
      setPhase("done");
    } catch (e) {
      setError(e?.message || "Couldn't decode that file — is it audio?");
      setPhase("error");
    }
  };

  // Tap a chip: swap in the next ranked alternate; key + chart re-derive live.
  const cycleAlt = (idx) => {
    if (!result) return;
    const segs = result.segments.map((s, k) => {
      if (k !== idx || s.quality === "N" || !s.alts?.length) return s;
      const cur = s.alts.findIndex((a) => a.pc === s.pc && a.quality === s.quality);
      const next = s.alts[(cur + 1) % s.alts.length];
      return { ...s, pc: next.pc, quality: next.quality, corrected: true };
    });
    setResult(summarizeSegments(segs));
  };

  const chords = result ? result.segments.filter((s) => s.quality !== "N") : [];
  const totalDur = chords.reduce((a, s) => a + (s.end - s.start), 0) || 1;

  return (
    <div className="faceplate kl-rise" style={{ margin: "14px 0 18px", padding: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="kl-eyebrow">Hear a record · audio → chords</span>
        <button onClick={onClose} aria-label="close"
          style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer" }}><X size={16} /></button>
      </div>

      {(phase === "idle" || phase === "error") && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); analyze(e.dataTransfer?.files?.[0]); }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "34px 16px",
            border: `1.5px dashed ${dragOver ? C.toneUi : C.line}`, borderRadius: 14, cursor: "pointer",
            background: dragOver ? C.panel2 : "transparent", transition: "background 140ms ease" }}>
          <FileAudio size={26} style={{ color: C.toneText }} />
          <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink }}>
            Drop a song here — mp3, wav, whatever plays
          </span>
          <span style={{ fontSize: 12.5, color: C.muted, textAlign: "center", maxWidth: 460 }}>
            Keylit listens for the harmony and writes the chart. Solo guitar and piano come out cleanest; dense mixes get rougher.
          </span>
          {error && <span style={{ color: C.bassText, fontSize: 13 }}>{error}</span>}
          <input type="file" accept="audio/*" style={{ display: "none" }}
            onChange={(e) => analyze(e.target.files?.[0])} />
        </label>
      )}

      {(phase === "decoding" || phase === "listening") && (
        <div style={{ textAlign: "center", padding: "30px 10px" }}>
          <Disc3 size={26} className="kl-spin" style={{ color: C.toneText }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink, marginTop: 10 }}>
            {phase === "decoding" ? "Dropping the needle…" : `Listening… ${Math.round(progress * 100)}%`}
          </div>
          <div style={{ maxWidth: 320, height: 5, borderRadius: 3, background: C.panel2, margin: "14px auto 0", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${phase === "decoding" ? 6 : Math.round(progress * 100)}%`, background: C.tone, borderRadius: 3, transition: "width 200ms ease" }} />
          </div>
          <button className="bench-btn" style={{ marginTop: 16 }} onClick={() => { cancelRef.current = true; setPhase("idle"); }}>cancel</button>
        </div>
      )}

      {phase === "done" && result && (
        <div>
          <div className="flex items-center" style={{ gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 20, color: C.ink }}>{fileName}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.toneText }}>sounds like {result.key.name}</span>
            <span style={{ fontSize: 12, color: C.faint }}>{chords.length} changes heard</span>
          </div>

          {/* the timeline: width = duration, color = confidence, tap = next-best guess */}
          <div style={{ display: "flex", gap: 3, alignItems: "stretch", flexWrap: "wrap" }}>
            {result.segments.map((s, i) => {
              if (s.quality === "N") return null;
              const w = Math.max(6, Math.round(((s.end - s.start) / totalDur) * 100));
              return (
                <button key={i} onClick={() => cycleAlt(i)}
                  title={`${Math.round(s.conf * 100)}% sure — tap for the next-best guess`}
                  style={{ flexGrow: w, flexBasis: 0, minWidth: 44, padding: "10px 4px 8px", cursor: "pointer",
                    background: C.panel, border: `1px solid ${confColor(s.conf)}`, borderRadius: 9,
                    boxShadow: s.corrected ? `0 0 0 1px ${confGlow(s.conf)}` : "none" }}>
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: C.ink, display: "block" }}>
                    {result.symbolFor(s)}
                  </span>
                  <span style={{ display: "block", height: 3, borderRadius: 2, marginTop: 6, background: confColor(s.conf), opacity: 0.85 }} />
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
            <b style={{ color: C.toneText }}>teal</b> = confident · <b style={{ color: C.rootText }}>amber</b> = probable ·
            <b style={{ color: C.bassText }}> coral</b> = squint — tap any chord to try its next-best reading.
          </p>

          <div className="flex items-center" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="bench-btn primary" onClick={() => onLoadSheet?.(result.sheet, fileName)}>
              <ScrollText size={14} /> Open as a chart
            </button>
            <button className="bench-btn" onClick={() => { setPhase("idle"); setResult(null); }}>
              <RotateCcw size={14} /> Another record
            </button>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.faint }}>
              analyzed right here — the audio never left this machine
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
