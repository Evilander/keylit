// VoiceRoom.jsx — the singing room. A live pitch trace (YIN, lib/pitch.js),
// a tessitura finder that maps where your voice LIVES (the 20–80% band —
// never a min/max belting test; range ≠ tessitura, per Titze/McKinney),
// a match-the-note drill against the piano, and Your Key: sing along with
// the loaded song and get a transpose verdict measured from YOUR voice.
// The mic signal is analyzed in this tab and never leaves the machine.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Play, Square, Target, Music2 } from "lucide-react";
import { detectPitch, noteOf, midiToHz, tessituraFrom, singFit } from "../lib/pitch.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const BAND_KEY = "keylit.voice.v1";
const loadBand = () => { try { return JSON.parse(localStorage.getItem(BAND_KEY) || "null"); } catch { return null; } };

const noteName = (m) => noteOf(m).name;

export default function VoiceRoom({ loadedTitle, onPlay, onTranspose }) {
  const [micOn, setMicOn] = useState(false);
  const [denied, setDenied] = useState(false);
  const [live, setLive] = useState(null); // { midi, hz, clarity }
  const [band, setBand] = useState(loadBand);

  // capture modes: null | "band" | "fit"
  const [capture, setCapture] = useState(null);
  const captureRef = useRef({ mode: null, samples: [] });
  const [captureCount, setCaptureCount] = useState(0);
  const [fit, setFit] = useState(null);

  // match-the-note drill
  const [target, setTarget] = useState(null); // midi
  const [held, setHeld] = useState(0);        // ms in tune
  const [streak, setStreak] = useState(0);
  const heldRef = useRef({ since: 0 });

  const audioRef = useRef(null); // { ctx, stream, analyser, raf, buf }
  const traceRef = useRef([]);   // ring buffer [{ at, midi, clarity }]
  const canvasRef = useRef(null);
  const targetRef = useRef(null);
  targetRef.current = target;
  // The rAF loop is created ONCE at mic-open; anything it calls that depends
  // on state (the band shading, the drill's next target) must go through a
  // ref or the loop keeps stale closures forever.
  const drawRef = useRef(() => {});
  const nextTargetRef = useRef(() => {});
  const mountedRef = useRef(true);
  const startingRef = useRef(false);

  const stopMic = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    try { a.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { a.ctx.close(); } catch { /* noop */ }
    audioRef.current = null;
    setMicOn(false);
    setLive(null);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopMic(); };
  }, [stopMic]);

  const startMic = async () => {
    // re-entrancy guard: a double-click during the permission wait would
    // open two mic sessions and orphan the first one's stream
    if (startingRef.current || audioRef.current) return;
    startingRef.current = true;
    setDenied(false);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch { setDenied(true); startingRef.current = false; return; }
    // the room may have been left while the permission prompt sat open —
    // release the just-granted stream instead of leaking a hot mic
    if (!mountedRef.current || audioRef.current) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      startingRef.current = false;
      return;
    }
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
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
    const a = { ctx, stream, analyser, buf, raf: 0 };
    audioRef.current = a;
    startingRef.current = false;
    setMicOn(true);

    const loop = () => {
      if (!audioRef.current) return;
      analyser.getFloatTimeDomainData(buf);
      const r = detectPitch(buf, ctx.sampleRate);
      const now = performance.now();
      if (r && r.clarity > 0.5) {
        setLive(r);
        traceRef.current.push({ at: now, midi: r.midi, clarity: r.clarity });
        const cap = captureRef.current;
        if (cap.mode) { cap.samples.push({ midi: r.midi, weight: r.clarity }); setCaptureCount(cap.samples.length); }
        // drill scoring: within a quarter tone of the target, hold ~900ms
        const t = targetRef.current;
        if (t != null) {
          if (Math.abs(r.midi - t) <= 0.5) {
            if (!heldRef.current.since) heldRef.current.since = now;
            const ms = now - heldRef.current.since;
            setHeld(ms);
            if (ms >= 900) {
              heldRef.current.since = 0;
              setHeld(0);
              setStreak((s) => s + 1);
              nextTargetRef.current(); // via ref — the loop's own closure is frozen at mic-open
            }
          } else if (heldRef.current.since) {
            heldRef.current.since = 0;
            setHeld(0);
          }
        }
      } else {
        setLive(null);
        if (heldRef.current.since) { heldRef.current.since = 0; setHeld(0); }
      }
      // trim to the last 9 seconds
      const cutoff = now - 9000;
      while (traceRef.current.length && traceRef.current[0].at < cutoff) traceRef.current.shift();
      drawRef.current(); // via ref — a freshly mapped band must shade LIVE
      a.raf = requestAnimationFrame(loop);
    };
    a.raf = requestAnimationFrame(loop);
  };

  /* ---- the trace ---- */
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const lo = 36, hi = 84; // C2..C6 window
    const y = (m) => H - ((Math.max(lo, Math.min(hi, m)) - lo) / (hi - lo)) * H;

    // the comfort band, painted where the voice lives
    if (band) {
      g.fillStyle = "rgba(46,155,166,0.13)";
      g.fillRect(0, y(band.high), W, y(band.low) - y(band.high));
      g.strokeStyle = "rgba(46,155,166,0.5)";
      g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(0, y(band.low)); g.lineTo(W, y(band.low)); g.stroke();
      g.beginPath(); g.moveTo(0, y(band.high)); g.lineTo(W, y(band.high)); g.stroke();
      g.setLineDash([]);
    }
    // octave gridlines
    g.strokeStyle = "rgba(127,116,90,0.25)";
    g.font = "9px 'Martian Mono', monospace";
    g.fillStyle = "rgba(127,116,90,0.8)";
    for (let m = lo; m <= hi; m += 12) {
      g.beginPath(); g.moveTo(0, y(m)); g.lineTo(W, y(m)); g.stroke();
      g.fillText(noteName(m), 4, y(m) - 3);
    }
    // the target line (drill)
    if (targetRef.current != null) {
      g.strokeStyle = "#E4602F";
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y(targetRef.current)); g.lineTo(W, y(targetRef.current)); g.stroke();
      g.lineWidth = 1;
    }
    // the voice
    const now = performance.now();
    const x = (at) => W - ((now - at) / 9000) * W;
    g.lineWidth = 2.4;
    let last = null;
    for (const p of traceRef.current) {
      const px = x(p.at), py = y(p.midi);
      g.strokeStyle = `rgba(228,96,47,${0.25 + p.clarity * 0.7})`;
      if (last && px - last.px < 30 && Math.abs(p.midi - last.midi) < 4) {
        g.beginPath(); g.moveTo(last.px, last.py); g.lineTo(px, py); g.stroke();
      }
      last = { px, py, midi: p.midi };
    }
    g.lineWidth = 1;
  }, [band]);
  drawRef.current = draw;

  /* ---- band capture ---- */
  const startBandCapture = () => {
    captureRef.current = { mode: "band", samples: [] };
    setCapture("band");
    setCaptureCount(0);
  };
  const finishBandCapture = () => {
    const t = tessituraFrom(captureRef.current.samples);
    captureRef.current = { mode: null, samples: [] };
    setCapture(null);
    if (t) {
      setBand(t);
      try { localStorage.setItem(BAND_KEY, JSON.stringify(t)); } catch { /* noop */ }
    }
  };

  /* ---- your key capture ---- */
  const startFitCapture = () => {
    captureRef.current = { mode: "fit", samples: [] };
    setCapture("fit");
    setCaptureCount(0);
    setFit(null);
  };
  const finishFitCapture = () => {
    const take = captureRef.current.samples.map((s) => s.midi);
    captureRef.current = { mode: null, samples: [] };
    setCapture(null);
    setFit(singFit(take, band) || { shift: null, note: "not enough singing to judge — give it 20 honest seconds" });
  };

  /* ---- drill ---- */
  const nextTarget = useCallback(() => {
    const lo = band ? band.low : 48;
    const hi = band ? band.high : 60;
    const t = Math.round(lo + Math.random() * Math.max(2, hi - lo));
    setTarget(t);
    onPlay?.([t], 1.4);
  }, [band, onPlay]);
  nextTargetRef.current = nextTarget;

  const liveNote = live ? noteOf(live.midi) : null;

  return (
    <div className="kl-section">
      <div className="kl-eyebrow faint">The singing room</div>
      <h1 className="kl-title" style={{ marginTop: 6 }}>Voice</h1>
      <p className="kl-prose" style={{ color: C.muted, maxWidth: 620, margin: "10px 0 0" }}>
        The mic listens here and nowhere else — nothing you sing leaves this machine. Find where your
        voice lives, train your pitch against the piano, and fit any song to your actual range.
      </p>

      {/* ---- the trace deck ---- */}
      <div className="deck" style={{ padding: "14px 16px", margin: "18px 0 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
          {micOn ? (
            <button className="bench-btn" onClick={stopMic} style={{ borderColor: "#F08A5A", color: "#F08A5A", background: "transparent" }}>
              <MicOff size={14} /> mic off
            </button>
          ) : (
            <button className="bench-btn primary" onClick={startMic} style={{ background: "#F0EADB", borderColor: "#F0EADB", color: "#171511" }}>
              <Mic size={14} /> open the mic
            </button>
          )}
          {denied && <span style={{ fontSize: 12.5, color: "#E0B453" }}>the browser said no — check mic permissions for this site</span>}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: liveNote ? "#F0EADB" : "#5E574B", minWidth: 86, textAlign: "right" }}>
              {liveNote ? liveNote.name : "—"}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: liveNote ? (Math.abs(liveNote.cents) < 12 ? "#57BEC8" : "#E0B453") : "#5E574B", minWidth: 52 }}>
              {liveNote ? `${liveNote.cents > 0 ? "+" : ""}${Math.round(liveNote.cents)}¢` : ""}
            </span>
          </span>
        </div>
        <canvas ref={canvasRef} width={1000} height={200} style={{ width: "100%", height: 200, display: "block" }}
          aria-label="live pitch trace — your voice against the octaves, with your comfort band shaded" />
      </div>
      <p style={{ fontSize: 11.5, color: C.faint, margin: "0 0 16px" }}>
        the shaded band is where your voice lives · the trace is the last nine seconds of you
      </p>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14, alignItems: "start" }}>
        {/* ---- station 1: the band ---- */}
        <div className="faceplate" style={{ padding: "16px 18px" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}>Where your voice lives</div>
          <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 10px" }}>
            Hum or sing anything comfortable for ~30 seconds — a song you love, up and down, easy.
            Not your highest or lowest: your <i>easy</i>. We keep the middle 60% — that's your tessitura,
            the difference between a note you can hit and a note you can live on.
          </p>
          {capture === "band" ? (
            <button className="bench-btn primary" onClick={finishBandCapture} disabled={captureCount < 20}>
              <Square size={13} /> done ({captureCount} samples{captureCount < 20 ? " — keep going" : ""})
            </button>
          ) : (
            <button className="bench-btn" onClick={startBandCapture} disabled={!micOn || capture === "fit"}
              title={capture === "fit" ? "finish singing the song first" : undefined}>
              <Play size={13} /> {band ? "re-map it" : "map my voice"}
            </button>
          )}
          {band && (
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 13, color: C.toneText }}>
              {noteName(Math.round(band.low))} – {noteName(Math.round(band.high))}
              <span style={{ color: C.faint }}> · centered {noteName(Math.round(band.center))}</span>
            </div>
          )}
        </div>

        {/* ---- station 2: the drill ---- */}
        <div className="faceplate" style={{ padding: "16px 18px" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}><Target size={15} style={{ marginRight: 6, color: C.rootText }} />Match the note</div>
          <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 10px" }}>
            The piano throws a note inside your band; sing it and hold it for one steady second.
            The tangerine line on the trace is the target.
          </p>
          <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="bench-btn" onClick={nextTarget} disabled={!micOn}>
              <Play size={13} /> {target != null ? "another" : "throw one"}
            </button>
            {target != null && (
              <button className="bench-btn" style={{ padding: "6px 11px" }} onClick={() => onPlay?.([target], 1.4)} aria-label="hear the target again">hear it</button>
            )}
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.muted, marginLeft: "auto" }}>
              streak <b style={{ color: streak ? C.rootText : C.faint }}>{streak}</b>
            </span>
          </div>
          {target != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 6, borderRadius: 3, background: C.panel2, border: `1px solid ${C.line}`, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (held / 900) * 100)}%`, height: "100%", background: C.tone }} />
              </div>
              <div className="kl-meta" style={{ marginTop: 4, color: C.faint }}>target {noteName(target)} — hold it steady</div>
            </div>
          )}
        </div>

        {/* ---- station 3: your key ---- */}
        <div className="faceplate" style={{ padding: "16px 18px" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}><Music2 size={15} style={{ marginRight: 6, color: C.bassText }} />Your key</div>
          {!band ? (
            <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
              Map your voice first (station one) — then this station can measure any song against it.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 10px" }}>
                {loadedTitle ? <>Sing ~20 seconds of <b style={{ color: C.ink }}>{loadedTitle}</b> the way you'd actually sing it.</>
                  : <>Open a song first, then sing ~20 seconds of it here.</>}
                {" "}We measure where you sang against where you live, and call the transpose.
              </p>
              {capture === "fit" ? (
                <button className="bench-btn primary" onClick={finishFitCapture} disabled={captureCount < 20}>
                  <Square size={13} /> judge it ({captureCount})
                </button>
              ) : (
                <button className="bench-btn" onClick={startFitCapture} disabled={!micOn || !loadedTitle || capture === "band"}
                  title={capture === "band" ? "finish mapping your voice first" : undefined}>
                  <Play size={13} /> sing the song
                </button>
              )}
              {fit && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, margin: 0 }}>{fit.note}</p>
                  {fit.shift ? (
                    <button className="bench-btn primary" style={{ marginTop: 8, padding: "6px 13px", fontSize: 12.5 }}
                      onClick={() => { onTranspose?.(fit.shift); setFit({ ...fit, applied: true }); }}
                      disabled={fit.applied}>
                      {fit.applied ? "moved — check the Song room" : `move the song ${fit.shift > 0 ? "up" : "down"} ${Math.abs(fit.shift)}`}
                    </button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
