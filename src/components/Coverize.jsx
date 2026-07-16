// Coverize.jsx — "make it a Bill Callahan version." Pick a writer, the engine
// re-speaks the loaded song in their arrangement language (lib/coverize.js),
// and every move is explained — this is a teaching surface wearing a fun
// feature. The cover applies as a performance LENS (the Lab progression);
// the original chart stays the source document until you choose to keep the
// cover as its own song.
import { useMemo, useState } from "react";
import { Play, ListMusic, Save, ChevronDown } from "lucide-react";
import { coverize, coverSheet, COVER_STYLES } from "../lib/coverize.js";
import { displaySymbol } from "../lib/theory.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

export default function Coverize({ prog, activeKey, loaded, sourceHasTab = false, onAudition, onApply, onKeep }) {
  const [open, setOpen] = useState(false);
  const [styleId, setStyleId] = useState(null);
  const [allMoves, setAllMoves] = useState(false);
  const [note, setNote] = useState(null);

  const result = useMemo(
    () => (styleId && prog?.length ? coverize(prog, activeKey, styleId) : null),
    [styleId, prog, activeKey]
  );
  const style = COVER_STYLES.find((s) => s.id === styleId);

  if (!prog?.length) return null;

  const title = loaded?.title || "this chart";
  const shownMoves = result ? (allMoves ? result.moves : result.moves.slice(0, 8)) : [];

  const keep = () => {
    if (!result || !style) return;
    const body = coverSheet(result, { title: loaded?.title || "Untitled", artist: loaded?.artist || "", styleName: style.name, hadTab: sourceHasTab });
    onKeep?.(body, {
      title: `${loaded?.title || "Untitled"} (${style.name} version)`,
      artist: loaded?.artist || "",
      key: result.targetKeyName,
      capo: result.capo || "",
    });
    setNote("kept — it's in your songbook now, and on the stand");
  };

  return (
    <section style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}>
        <ChevronDown size={15} style={{ color: C.faint, transform: open ? "none" : "rotate(-90deg)", transition: "transform 160ms ease" }} />
        <span className="kl-eyebrow">Coverize</span>
        <span style={{ fontSize: 12.5, color: C.faint }}>— {title} in another writer's hands</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COVER_STYLES.map((s) => {
              const active = styleId === s.id;
              return (
                <button key={s.id} onClick={() => { setStyleId(active ? null : s.id); setAllMoves(false); setNote(null); }}
                  aria-pressed={active} title={s.line}
                  style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                    padding: "8px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                    border: `1.5px solid ${active ? C.ink : C.line}`,
                    background: active ? C.ink : "transparent",
                    color: active ? "var(--kl-on-ink)" : C.ink,
                    transition: "background 150ms ease, color 150ms ease, border-color 150ms ease" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 15 }}>{s.name}</span>
                  <span style={{ fontSize: 10.5, opacity: 0.75 }}>{s.line}</span>
                </button>
              );
            })}
          </div>

          {result && style && (
            <div className="faceplate" style={{ marginTop: 14, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.rootText }}>{result.targetKeyName}</span>
                {result.capo ? <span className="kl-meta">capo {result.capo}</span> : <span className="kl-meta">no capo</span>}
                <span className="kl-meta">{result.tempo.bpm[0]}–{result.tempo.bpm[1]} bpm</span>
                <span className="kl-meta" style={{ color: C.faint }}>{result.tempo.feel}</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, margin: "10px 0 0", maxWidth: 640 }}>{result.notes}</p>

              {/* the new changes, at a glance */}
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, margin: "12px 0 0", color: C.ink, overflowWrap: "anywhere", lineHeight: 1.8 }}>
                {[...new Map(result.chords.map((c) => [displaySymbol(c, 1), c])).keys()].join("  ")}
              </div>

              <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}` }}>
                {shownMoves.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.line}`, alignItems: "baseline" }}>
                    {m.from ? (
                      <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                        <span style={{ color: C.faint }}>{m.from}</span>
                        <span style={{ color: C.faint }}> → </span>
                        <span style={{ color: C.toneText }}>{m.to}</span>
                      </span>
                    ) : (
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.rootText, whiteSpace: "nowrap", letterSpacing: "0.08em" }}>MOVE</span>
                    )}
                    <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{m.why}</span>
                  </div>
                ))}
                {result.moves.length > 8 && (
                  <button onClick={() => setAllMoves((v) => !v)}
                    style={{ background: "transparent", border: 0, color: C.faint, fontSize: 12, cursor: "pointer", padding: "6px 0" }}>
                    {allMoves ? "fewer" : `+${result.moves.length - 8} more moves`}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button className="bench-btn primary" onClick={() => onAudition?.(result.chords.slice(0, 8))}>
                  <Play size={14} /> Hear the change
                </button>
                <button className="bench-btn" onClick={() => { onApply?.(result.chords); setNote("on the bench — the rail, piano and playback speak the cover; the paper stays original"); }}>
                  <ListMusic size={14} /> Play it this way
                </button>
                <button className="bench-btn" onClick={keep}>
                  <Save size={14} /> Keep as a song
                </button>
                {note && <span style={{ fontSize: 12, color: C.toneText, fontFamily: MONO }}>{note}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
