// TabKeys.jsx — when a song has real 6-line TAB, light the EXACT fretted notes
// on a piano and show WHICH FINGER plays each one, stepping column by column.
// This is the truest "tab → piano" transcription: the literal notes (tuning-
// and capo-aware), not a generic chord voicing, with five-finger-position
// fingering suggestions from lib/fingering.js.
// Self-contained wide keyboard so it never disturbs the tested chord keyboard.
import { useMemo, useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import { parseTab } from "../lib/tab.js";
import { fingerEvents } from "../lib/fingering.js";
import { C, MONO } from "../ui/theme.js";

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (n) => BLACK.has(((n % 12) + 12) % 12);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// L = amber (root hue), R = teal (tone hue) — the deck's two warmest voices.
const HAND = {
  L: { fill: C.root, glow: C.rootGlow, label: "left" },
  R: { fill: C.tone, glow: C.toneGlow, label: "right" },
};

export default function TabKeys({ sheet, tuning, tuningRaw, capo, shift = 0, onPlay }) {
  const parsed = useMemo(
    () => parseTab(sheet, { defaultTuning: tuningRaw || tuning, capo }),
    [sheet, tuning, tuningRaw, capo]
  );
  const events = useMemo(
    () => fingerEvents(parsed.events, shift),
    [parsed, shift]
  );
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stepMs, setStepMs] = useState(700);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  useEffect(() => { setI(0); setPlaying(false); }, [sheet, shift]);

  const idx = Math.min(i, Math.max(0, events.length - 1));
  const current = events[idx];

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const id = setInterval(() => {
      setI((prev) => {
        const ni = prev + 1;
        if (ni >= events.length) { setPlaying(false); return prev; }
        onPlayRef.current?.(events[ni].notes.map((n) => n.midi));
        return ni;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [playing, stepMs, events]);

  // Keyboard range hugs the actual notes (bass tabs dive low, lead tabs go high).
  const range = useMemo(() => {
    let lo = 48, hi = 76;
    for (const e of events) for (const n of e.notes) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    }
    lo = Math.max(21, lo - ((lo % 12) + 12) % 12);      // down to a C
    hi = Math.min(108, hi + (11 - (((hi % 12) + 12) % 12))); // up to a B
    return { lo, hi };
  }, [events]);

  const geom = useMemo(() => {
    const WKW = 15, pos = {};
    let x = 0;
    for (let n = range.lo; n <= range.hi; n++) if (!isBlack(n)) { pos[n] = { x }; x += WKW; }
    for (let n = range.lo; n <= range.hi; n++) if (isBlack(n)) { let p = n - 1; while (isBlack(p)) p--; if (pos[p]) pos[n] = { x: pos[p].x + WKW - 4.5, black: true }; }
    return { pos, width: x, WKW };
  }, [range]);

  if (!events.length) return null;

  const noteByMidi = new Map(current.notes.map((n) => [n.midi, n]));
  const midis = current.notes.map((n) => n.midi);
  const goTo = (ni, sound = true) => {
    const clamped = Math.max(0, Math.min(events.length - 1, ni));
    setI(clamped);
    if (sound) onPlayRef.current?.(events[clamped].notes.map((n) => n.midi));
  };
  const WKH = 66, BKW = 9, BKH = 42;

  const tuningLabel = parsed.tuning.family === "standard" ? null : parsed.tuning.name;
  const meta = [
    tuningLabel,
    parsed.capo ? `capo ${parsed.capo}` : null,
    shift ? `moved ${shift > 0 ? "+" : ""}${shift}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <span className="kl-eyebrow">
          Tab → piano{meta ? <span style={{ color: C.toneText }}> · {meta}</span> : ""}
        </span>
        <span className="kl-meta">
          {current.handShift && <span style={{ color: C.bassText, marginRight: 10 }}>hand moves ↷</span>}
          position {idx + 1} / {events.length}
        </span>
      </div>
      <div className="deck" style={{ padding: "14px 12px" }}>
        <div className="key-felt" style={{ padding: "12px 10px" }}>
          <div style={{ width: "100%", overflowX: "auto" }}>
            <svg viewBox={`0 0 ${geom.width} ${WKH + 4}`} width="100%" style={{ maxWidth: geom.width, minWidth: 560, display: "block" }} role="img"
              aria-label={`tab notes on piano, position ${idx + 1} of ${events.length}`}>
              <defs><linearGradient id="tabWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbf6ec" /><stop offset="100%" stopColor={C.whiteShadow} /></linearGradient></defs>
              {Object.entries(geom.pos).filter(([n]) => !isBlack(+n)).map(([n, p]) => {
                const note = noteByMidi.get(+n);
                const h = note && HAND[note.hand];
                return (
                  <g key={n}>
                    <rect x={p.x + 1} y={2} width={geom.WKW - 2} height={WKH} rx={3}
                      fill={h ? h.fill : "url(#tabWhite)"} stroke={h ? h.glow : C.whiteShadow} strokeWidth={h ? 1.6 : 1}
                      style={{ filter: h ? `drop-shadow(0 0 8px ${h.glow}cc)` : "none", transition: "fill 120ms ease" }} />
                    {note && (
                      <text x={p.x + geom.WKW / 2} y={WKH - 6} textAnchor="middle"
                        fontSize="9.5" fontWeight="700" fill={C.deck} style={{ fontFamily: MONO }}>
                        {note.finger}
                      </text>
                    )}
                  </g>
                );
              })}
              {Object.entries(geom.pos).filter(([n]) => isBlack(+n)).map(([n, p]) => {
                const note = noteByMidi.get(+n);
                const h = note && HAND[note.hand];
                return (
                  <g key={n}>
                    <rect x={p.x} y={2} width={BKW} height={BKH} rx={2}
                      fill={h ? h.fill : "#221d18"} stroke={h ? h.glow : "#0c0a08"} strokeWidth={h ? 1.4 : 1}
                      style={{ filter: h ? `drop-shadow(0 0 7px ${h.glow}dd)` : "none", transition: "fill 120ms ease" }} />
                    {note && (
                      <text x={p.x + BKW / 2} y={BKH - 4} textAnchor="middle"
                        fontSize="8.5" fontWeight="700" fill={C.deck} style={{ fontFamily: MONO }}>
                        {note.finger}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* what to play, in words — L5 E2 means "left-hand pinky on E2" */}
        <div className="flex items-center" style={{ gap: 14, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {current.notes.map((n, k) => (
            <span key={k} style={{ fontFamily: MONO, fontSize: 13, color: HAND[n.hand].glow }}>
              <b>{n.hand}{n.finger}</b>
              <span style={{ color: "#b8b0a4" }}> {noteName(n.midi)}</span>
            </span>
          ))}
        </div>

        <div className="flex items-center" style={{ gap: 10, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="bench-btn" onClick={() => { setPlaying(false); goTo(idx - 1); }} aria-label="previous position"><ChevronLeft size={16} /></button>
          <button className="bench-btn primary" style={{ minWidth: 110 }}
            onClick={() => {
              if (!playing && idx >= events.length - 1) goTo(0);
              else if (!playing) onPlayRef.current?.(midis);
              setPlaying((p) => !p);
            }}>
            {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Walk it</>}
          </button>
          <button className="bench-btn" onClick={() => { setPlaying(false); goTo(idx + 1); }} aria-label="next position"><ChevronRight size={16} /></button>
          <input type="range" min={0} max={events.length - 1} value={idx}
            onChange={(e) => { setPlaying(false); goTo(Number(e.target.value), false); }}
            style={{ width: 160, accentColor: C.toneUi }} aria-label="scrub through tab positions" />
          <span style={{ fontSize: 11, color: "#8b8378" }}>slow</span>
          <input type="range" min={220} max={1200} step={40} value={1420 - stepMs}
            onChange={(e) => setStepMs(1420 - Number(e.target.value))}
            style={{ width: 80, accentColor: C.toneUi }} aria-label="walk speed" />
          <span style={{ fontSize: 11, color: "#8b8378" }}>fast</span>
        </div>
      </div>
      <p style={{ color: C.faint, fontSize: 12, marginTop: 10 }}
        title="Fingering follows five-finger hand positions; “hand moves ↷” flags a position shift.">
        <b style={{ color: C.rootText }}>Amber = left hand</b> · <b style={{ color: C.toneText }}>teal = right</b> · numbers are fingers (1 = thumb, 5 = pinky).
      </p>
    </section>
  );
}
