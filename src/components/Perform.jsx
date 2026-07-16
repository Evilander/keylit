// Perform.jsx — the stage. Two ways to play along with the page:
//   ROLL (guitar in hand): the chart scrolls at your reading speed while both
//   hands stay on the strings. Space rolls/pauses, ←→ jump sections, the
//   click can ride underneath.
//   WALK (piano play-along): the progression steps at the practice tempo; the
//   current chord lights the page AND the keyboard on the slab below.
// The playhead line sits ~35% down the stage. Keyboard-first by design —
// at a gig your hands are busy and your boot can find a spacebar.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, ChevronLeft, ChevronRight, Maximize2, SkipBack } from "lucide-react";
import { chartOutline, sectionIndex, progressionAnchors } from "../lib/chartlines.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";
import PerformChart from "./PerformChart.jsx";
import Metronome from "./Metronome.jsx";
import Keyboard from "./Keyboard.jsx";

const PREF_KEY = "keylit.perform.v1";
const loadPrefs = () => {
  try { return { mode: "roll", speed: 36, size: 18, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; }
  catch { return { mode: "roll", speed: 36, size: 18 }; }
};

export default function Perform({
  sheet, loaded, keyName,
  activeKey, transpose, prog,
  currentIdx, onSelectIdx, isPlaying, onTogglePlay, tempo, onTempo,
  roleFor, flash, onKeyPress,
  setlistCtx, onOpenSetlistSong, onPickSong,
  retabTag, // e.g. "re-fretted for Drop D" — the stage must say so out loud
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const setPref = (patch) => setPrefs((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* storage optional */ }
    return next;
  });
  const { mode, speed, size } = prefs;

  const [rolling, setRolling] = useState(false);
  const [currentLine, setCurrentLine] = useState(-1);

  const outline = useMemo(() => chartOutline(sheet), [sheet]);
  const sections = useMemo(() => sectionIndex(outline), [outline]);
  const anchors = useMemo(() => progressionAnchors(outline), [outline]);
  // positional playhead only when the anchor walk mirrored the parser exactly
  const anchorsOk = anchors.length === prog.length && prog.length > 0;

  const scrollRef = useRef(null);
  const stageRef = useRef(null);
  const lineEls = useRef([]);
  const lineTops = useRef([]);
  const registerLine = useCallback((i, el) => { lineEls.current[i] = el; }, []);

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const measure = useCallback(() => {
    lineTops.current = lineEls.current.map((el) => (el ? el.offsetTop : 0));
  }, []);
  useLayoutEffect(() => { lineEls.current.length = outline.length; measure(); }, [outline, size, measure]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // ---- the ROLL engine: a rAF loop nudging scrollTop at px/sec ----
  const speedRef = useRef(speed);
  speedRef.current = speed;
  useEffect(() => {
    if (!rolling || mode !== "roll") return;
    const el = scrollRef.current;
    if (!el) return;
    if (reduced) {
      // prefers-reduced-motion: rolling is the FEATURE (a teleprompter), so
      // it can't just vanish — but the continuous crawl can. Step a whole
      // line at a time at the same reading speed: a page-turner, no motion.
      const lineH = Math.max(18, Math.round(size * 1.6));
      const stepMs = Math.max(250, (lineH / Math.max(4, speedRef.current)) * 1000);
      const t = setInterval(() => {
        el.scrollTop += lineH;
        updatePlayhead();
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setRolling(false);
      }, stepMs);
      return () => clearInterval(t);
    }
    let raf, last = performance.now(), acc = 0, carry = 0;
    const frame = (now) => {
      const dt = Math.min(100, now - last);
      last = now;
      carry += (speedRef.current * dt) / 1000;
      if (carry >= 1) { const px = Math.floor(carry); el.scrollTop += px; carry -= px; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { setRolling(false); return; }
      acc += dt;
      if (acc > 150) { acc = 0; updatePlayhead(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, mode, reduced, size]);

  const updatePlayhead = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.scrollTop + el.clientHeight * 0.35;
    const tops = lineTops.current;
    let lo = 0, hi = tops.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid] <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    setCurrentLine(ans);
  }, []);
  // manual scrolls move the playhead too (roll mode reads wherever you drag)
  const onScroll = useCallback(() => { if (mode === "roll") updatePlayhead(); }, [mode, updatePlayhead]);

  // ---- WALK mode: center the line that owns the current chord ----
  const anchor = mode === "walk" && anchorsOk ? anchors[currentIdx] || null : null;
  useEffect(() => {
    if (mode !== "walk") return;
    const el = scrollRef.current;
    if (!el) return;
    const li = anchor ? anchor.line : -1;
    if (li < 0) return;
    setCurrentLine(li);
    const top = Math.max(0, (lineTops.current[li] || 0) - el.clientHeight * 0.35);
    el.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, mode, anchor?.line]);

  const jumpSection = (dir) => {
    const el = scrollRef.current;
    if (!el || !sections.length) return;
    const cur = currentLine;
    const ahead = sections.filter((s) => (dir > 0 ? s.lineIdx > cur : s.lineIdx < cur));
    const target = dir > 0 ? ahead[0] : ahead[ahead.length - 1];
    if (!target) return;
    const top = Math.max(0, (lineTops.current[target.lineIdx] || 0) - el.clientHeight * 0.35);
    el.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    setCurrentLine(target.lineIdx);
  };

  const restart = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "auto" });
    setCurrentLine(0);
    if (mode === "walk") onSelectIdx?.(0);
  };

  const goFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => { /* stage stays inline */ });
  };

  const onKeys = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === " ") {
      e.preventDefault();
      if (mode === "roll") setRolling((r) => !r);
      else onTogglePlay?.();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (mode === "roll") jumpSection(1);
      else onSelectIdx?.(Math.min(prog.length - 1, currentIdx + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (mode === "roll") jumpSection(-1);
      else onSelectIdx?.(Math.max(0, currentIdx - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (mode === "roll") setPref({ speed: Math.min(140, speed + 4) });
      else onTempo?.(Math.max(600, tempo - 100));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (mode === "roll") setPref({ speed: Math.max(8, speed - 4) });
      else onTempo?.(Math.min(2400, tempo + 100));
    } else if (e.key === "Home") { e.preventDefault(); restart(); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); goFullscreen(); }
  };

  if (!sheet || !sheet.trim()) {
    return (
      <div style={{ marginTop: 8 }}>
        <div className="kl-eyebrow">The stage</div>
        <h1 className="kl-title" style={{ marginTop: 6 }}>Nothing on the stand.</h1>
        <p className="kl-prose" style={{ color: C.muted, marginTop: 10, maxWidth: 520 }}>
          Open a song and it lands here at performance size — a rolling page for the guitar,
          a stepped walk for the piano.
        </p>
        <button className="bench-btn primary" style={{ marginTop: 16 }} onClick={onPickSong}>Pick from the Library</button>
      </div>
    );
  }

  const title = loaded?.title || "Your chart";
  const artist = loaded?.artist;

  return (
    <div onKeyDown={onKeys} tabIndex={0} aria-label="performance stage — space rolls or plays, arrows move, F goes fullscreen" style={{ outline: "none" }}>
      {/* ---- the stand's header: what's up + how it runs ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ minWidth: 0, marginRight: "auto" }}>
          <div className="kl-eyebrow">{artist ? `${artist} · ` : ""}{keyName}{retabTag ? <span style={{ color: C.bassText }}> · {retabTag}</span> : null}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420 }}>{title}</div>
        </div>
        {setlistCtx?.rows?.length > 0 && (
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="kl-meta">{setlistCtx.name} · {setlistCtx.idx + 1}/{setlistCtx.rows.length}</span>
            <button className="bench-btn" style={{ padding: "5px 9px" }} disabled={setlistCtx.idx === 0}
              onClick={() => onOpenSetlistSong?.(setlistCtx.rows[setlistCtx.idx - 1], { ...setlistCtx, idx: setlistCtx.idx - 1 })}
              aria-label="previous song in setlist"><ChevronLeft size={14} /></button>
            <button className="bench-btn" style={{ padding: "5px 9px" }} disabled={setlistCtx.idx >= setlistCtx.rows.length - 1}
              onClick={() => onOpenSetlistSong?.(setlistCtx.rows[setlistCtx.idx + 1], { ...setlistCtx, idx: setlistCtx.idx + 1 })}
              aria-label="next song in setlist"><ChevronRight size={14} /></button>
          </div>
        )}
        <div className="kl-seg" role="tablist" aria-label="play-along mode">
          <button role="tab" aria-selected={mode === "roll"} onClick={() => { setRolling(false); setPref({ mode: "roll" }); }}>Roll · guitar</button>
          <button role="tab" aria-selected={mode === "walk"} onClick={() => { setRolling(false); setPref({ mode: "walk" }); }}>Walk · piano</button>
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <button className="bench-btn" style={{ padding: "6px 11px", fontFamily: MONO, fontSize: 12 }}
            onClick={() => setPref({ size: Math.max(14, size - 2) })} aria-label="smaller chart type">A−</button>
          <button className="bench-btn" style={{ padding: "6px 11px", fontFamily: MONO, fontSize: 12 }}
            onClick={() => setPref({ size: Math.min(30, size + 2) })} aria-label="bigger chart type">A+</button>
          <button className="bench-btn" style={{ padding: "6px 11px" }} onClick={goFullscreen} title="fullscreen (F)" aria-label="fullscreen">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ---- transport row (per mode) ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {mode === "roll" ? (
          <>
            <button className={`bench-btn${rolling ? "" : " primary"}`} style={{ minWidth: 110 }} onClick={() => setRolling((r) => !r)} aria-pressed={rolling}>
              {rolling ? <><Pause size={14} /> Hold</> : <><Play size={14} /> Roll</>}
            </button>
            <button className="bench-btn" style={{ padding: "8px 12px" }} onClick={restart} aria-label="back to the top"><SkipBack size={14} /></button>
            <label className="kl-meta" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              speed
              <input type="range" min={8} max={140} value={speed} onChange={(e) => setPref({ speed: +e.target.value })}
                style={{ width: 130, accentColor: C.root }} aria-label="scroll speed" />
            </label>
            <span style={{ marginLeft: "auto" }}><Metronome compact /></span>
          </>
        ) : (
          <>
            <button className={`bench-btn${isPlaying ? "" : " primary"}`} style={{ minWidth: 110 }} onClick={onTogglePlay} aria-pressed={isPlaying}>
              {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
            </button>
            <button className="bench-btn" style={{ padding: "8px 12px" }} onClick={restart} aria-label="back to the top"><SkipBack size={14} /></button>
            <label className="kl-meta" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              slow
              <input type="range" min={600} max={2400} step={100} value={2400 - (tempo - 600)}
                onChange={(e) => onTempo?.(2400 - (Number(e.target.value) - 600))}
                style={{ width: 130, accentColor: C.root }} aria-label="walk tempo" />
              fast
            </label>
            <span className="kl-meta" style={{ marginLeft: "auto", color: C.faint }}>
              {anchorsOk ? `${currentIdx + 1} / ${prog.length}` : "lighting every match of the sounding chord"}
            </span>
          </>
        )}
      </div>

      {/* ---- the stage itself ---- */}
      <div ref={stageRef} style={{ background: "#0D0C09", borderRadius: 18, padding: "18px 8px 8px", display: "flex", flexDirection: "column", boxShadow: "inset 0 3px 16px rgba(0,0,0,0.6)" }}>
        <div ref={scrollRef} onScroll={onScroll}
          style={{ overflowY: "auto", position: "relative", height: mode === "walk" ? "calc(100vh - 420px)" : "calc(100vh - 320px)", minHeight: 320, padding: "8px 18px 40vh" }}>
          {/* roll is a reading page — only walk lights chords */}
          <PerformChart outline={outline} activeKey={activeKey} transpose={transpose}
            activeChord={mode === "walk" ? prog[currentIdx] || null : null} anchor={anchor}
            currentLine={currentLine} size={size} registerLine={registerLine} />
        </div>
        {mode === "walk" && (
          <div style={{ padding: "10px 14px 12px" }}>
            <Keyboard height={120} roleFor={roleFor} onKey={onKeyPress} flash={flash}
              ariaLabel="piano keyboard — the walking chord is lit" />
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: C.faint, margin: "10px 0 0" }}>
        space {mode === "roll" ? "rolls" : "plays"} · ← → {mode === "roll" ? "jump sections" : "step chords"} ·
        ↑↓ {mode === "roll" ? "speed" : "tempo"} · Home restarts · F fullscreen
      </p>
    </div>
  );
}
