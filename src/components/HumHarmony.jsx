// HumHarmony.jsx — melody-first writing: hum a line, get chord candidates
// that each explain WHY they'd work under your notes. The hum→chords
// mechanic has a lineage (MySong 2008 → today's hum apps) and we say so —
// the teaching layer is the part that's ours. Mic audio never leaves the
// machine (lib/pitch.js does the listening).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, Square, Play, ArrowRight } from "lucide-react";
import { detectPitch, noteOf } from "../lib/pitch.js";
import { segmentMelody, harmonizeNotes } from "../lib/harmonize.js";
import { chordSymbol } from "../lib/theory.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

export default function HumHarmony({ activeKey, onAudition, onCommitChords, onLoadProgression }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const [liveName, setLiveName] = useState(null);
  const [phrases, setPhrases] = useState(null); // [{ midis, cands, picked }]
  const [placement, setPlacement] = useState("append");
  const audioRef = useRef(null);
  const samplesRef = useRef([]);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);

  const stopMic = () => {
    const a = audioRef.current;
    if (a) {
      cancelAnimationFrame(a.raf);
      try { a.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      try { a.ctx.close(); } catch { /* noop */ }
    }
    audioRef.current = null;
    setListening(false);
    setLiveName(null);
    const segs = segmentMelody(samplesRef.current);
    setPhrases(segs.map((p) => ({
      midis: p.midis,
      cands: harmonizeNotes(p.midis, activeKey),
      picked: null,
    })));
  };
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (audioRef.current) stopMic(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (startingRef.current || audioRef.current) return; // double-click guard
    startingRef.current = true;
    setDenied(false);
    setPhrases(null);
    samplesRef.current = [];
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); }
    catch { setDenied(true); startingRef.current = false; return; }
    // the Write room may have been left while the permission prompt sat
    // open — release the just-granted stream instead of leaking a hot mic
    if (!mountedRef.current || audioRef.current) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      startingRef.current = false;
      return;
    }
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch {
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      setDenied(true);
      startingRef.current = false;
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const a = { ctx, stream, analyser, raf: 0 };
    audioRef.current = a;
    startingRef.current = false;
    setListening(true);
    const loop = () => {
      if (!audioRef.current) return;
      analyser.getFloatTimeDomainData(buf);
      const r = detectPitch(buf, ctx.sampleRate);
      if (r && r.clarity > 0.55) {
        samplesRef.current.push({ midi: r.midi, at: performance.now() });
        setLiveName(noteOf(r.midi).name);
      } else setLiveName(null);
      a.raf = requestAnimationFrame(loop);
    };
    a.raf = requestAnimationFrame(loop);
  };

  const pick = (pi, ci) => {
    setPhrases((ps) => ps.map((p, i) => (i === pi ? { ...p, picked: ci } : p)));
  };
  const picked = (phrases || []).filter((p) => p.picked !== null).map((p) => p.cands[p.picked].chord);

  return (
    <section style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: 0, cursor: "pointer", padding: 0 }}>
        <ChevronDown size={15} style={{ color: C.faint, transform: open ? "none" : "rotate(-90deg)", transition: "transform 160ms ease" }} />
        <span className="kl-eyebrow">Hum-to-Harmony · melody first</span>
        <span style={{ fontSize: 12, color: C.faint }}>sing the line, then choose its floor (a MySong-lineage tool — the explanations are the point)</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            {listening ? (
              <button className="bench-btn" onClick={stopMic} style={{ borderColor: C.rootUi, color: C.rootText }}>
                <Square size={14} /> done humming
              </button>
            ) : (
              <button className="bench-btn primary" onClick={start}><Mic size={14} /> hum a line</button>
            )}
            {listening && <span className="kl-pulse" style={{ fontFamily: MONO, fontSize: 12, color: C.rootText }}>listening{liveName ? ` — ${liveName}` : ""} · breathe to split phrases</span>}
            {denied && <span style={{ fontSize: 12, color: C.bassText }}>mic said no — check permissions</span>}
            {picked.length > 0 && (
              <>
                {onCommitChords && (
                  <div className="kl-seg" style={{ marginLeft: "auto" }}>
                    <button aria-pressed={placement === "append"} onClick={() => setPlacement("append")}>append</button>
                    <button aria-pressed={placement === "replace"} onClick={() => setPlacement("replace")}>replace section</button>
                  </div>
                )}
                <button className="bench-btn" style={onCommitChords ? undefined : { marginLeft: "auto" }}
                  onClick={() => onCommitChords
                    ? onCommitChords({ symbols: picked.map(chordSymbol), placement })
                    : onLoadProgression?.(picked)}>
                  {onCommitChords ? `${placement === "append" ? "append to" : "replace"} section` : `send ${picked.length} chord${picked.length === 1 ? "" : "s"} to the rail`} <ArrowRight size={13} />
                </button>
              </>
            )}
          </div>

          {phrases && phrases.length === 0 && (
            <p style={{ fontSize: 12.5, color: C.muted, margin: "10px 0 0" }}>Didn't catch a melody — hum louder, closer, or longer.</p>
          )}
          {phrases && phrases.map((p, pi) => (
            <div key={pi} style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              <div className="kl-meta" style={{ marginBottom: 6 }}>
                phrase {pi + 1} · {p.midis.slice(0, 10).map((m) => noteOf(m).name).join(" ")}{p.midis.length > 10 ? " …" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {p.cands.map((c, ci) => (
                  <div key={ci} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => pick(pi, ci)} aria-pressed={p.picked === ci}
                      style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, padding: "6px 14px", borderRadius: 10, cursor: "pointer",
                        border: `1.5px solid ${p.picked === ci ? C.ink : C.line}`,
                        background: p.picked === ci ? C.ink : "transparent",
                        color: p.picked === ci ? "var(--kl-on-ink)" : C.ink, minWidth: 74 }}>
                      {chordSymbol(c.chord)}
                    </button>
                    <button className="bench-btn" style={{ padding: "5px 9px" }} aria-label={`hear ${chordSymbol(c.chord)} under your line`}
                      onClick={() => onAudition?.([c.chord])}><Play size={12} /></button>
                    <span style={{ fontSize: 12.5, color: C.muted }}>{c.why}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
