// TabKeys.jsx — when a song has real 6-line TAB, light the EXACT fretted notes
// on a piano (guitar range C2–E6), stepping column by column. This is the truest
// "tab → piano" transcription: the literal notes, not a generic chord voicing.
// Self-contained wide keyboard so it never disturbs the tested chord keyboard.
import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { parseTab } from "../lib/tab.js";
import { tuningSpelling } from "../lib/tuning.js";
import { C } from "../ui/theme.js";

const LOW = 36, HIGH = 88; // C2 .. E6 covers standard + dropped tunings up the neck
const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (n) => BLACK.has(((n % 12) + 12) % 12);

export default function TabKeys({ sheet, onPlay }) {
  const parsed = useMemo(() => parseTab(sheet), [sheet]);
  const events = parsed.events;
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [sheet]);

  const geom = useMemo(() => {
    const WKW = 15, pos = {};
    let x = 0;
    for (let n = LOW; n <= HIGH; n++) if (!isBlack(n)) { pos[n] = { x }; x += WKW; }
    for (let n = LOW; n <= HIGH; n++) if (isBlack(n)) { let p = n - 1; while (isBlack(p)) p--; if (pos[p]) pos[n] = { x: pos[p].x + WKW - 4.5, black: true }; }
    return { pos, width: x, WKW };
  }, []);

  if (!events.length) return null;
  const idx = Math.min(i, events.length - 1);
  const midis = events[idx].notes.map((n) => n.midi);
  const set = new Set(midis);
  const go = (d) => { const ni = Math.max(0, Math.min(events.length - 1, idx + d)); setI(ni); onPlay?.(events[ni].notes.map((n) => n.midi)); };
  const WKH = 66, BKW = 9, BKH = 42;

  return (
    <section style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="kl-eyebrow">Tab → piano · {tuningSpelling(parsed.tuning.notes)}</span>
        <span className="kl-meta">position {idx + 1} / {events.length}</span>
      </div>
      <div className="deck" style={{ padding: "14px 12px" }}>
        <div className="key-felt" style={{ padding: "12px 10px" }}>
          <div style={{ width: "100%", overflowX: "auto" }}>
            <svg viewBox={`0 0 ${geom.width} ${WKH + 4}`} width="100%" style={{ maxWidth: geom.width, minWidth: 560, display: "block" }} role="img" aria-label="tab notes lit on piano">
              <defs><linearGradient id="tabWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbf6ec" /><stop offset="100%" stopColor={C.whiteShadow} /></linearGradient></defs>
              {Object.entries(geom.pos).filter(([n]) => !isBlack(+n)).map(([n, p]) => {
                const lit = set.has(+n);
                return <rect key={n} x={p.x + 1} y={2} width={geom.WKW - 2} height={WKH} rx={3} fill={lit ? C.tone : "url(#tabWhite)"} stroke={lit ? C.toneGlow : C.whiteShadow} strokeWidth={lit ? 1.6 : 1} style={{ filter: lit ? `drop-shadow(0 0 8px ${C.toneGlow}cc)` : "none", transition: "fill 120ms ease" }} />;
              })}
              {Object.entries(geom.pos).filter(([n]) => isBlack(+n)).map(([n, p]) => {
                const lit = set.has(+n);
                return <rect key={n} x={p.x} y={2} width={BKW} height={BKH} rx={2} fill={lit ? C.tone : "#221d18"} stroke={lit ? C.toneGlow : "#0c0a08"} strokeWidth={lit ? 1.4 : 1} style={{ filter: lit ? `drop-shadow(0 0 7px ${C.toneGlow}dd)` : "none", transition: "fill 120ms ease" }} />;
              })}
            </svg>
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 10, marginTop: 12, justifyContent: "center" }}>
          <button className="bench-btn" onClick={() => go(-1)} aria-label="previous position"><ChevronLeft size={16} /></button>
          <button className="bench-btn primary" onClick={() => onPlay?.(midis)}><Play size={14} /> Hear</button>
          <button className="bench-btn" onClick={() => go(1)} aria-label="next position"><ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
  );
}
