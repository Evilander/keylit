// RetabPanel.jsx — the tab half of the tuning dropdown, made live. Chord
// sheets always retuned freely off the dropdown; a TAB's fret numbers were
// welded to the tuning it was written in. Now, when the guitar in your hands
// differs from the tab's source tuning/capo, App re-frets the tab for YOUR
// setup (lib/retab.js) and the chart below shows it automatically. This status
// strip names every compromise out loud (octave-rescued and dropped pitches
// are counted, never hidden). Renders nothing when your guitar already matches
// the source.
import { useEffect, useState } from "react";
import { Guitar, Copy, Save, Check } from "lucide-react";
import { C } from "../ui/theme.js";

export function retabForCurrentSheet(retab, deferredSheet, currentSheet) {
  return retab && deferredSheet === currentSheet ? retab : null;
}

export default function RetabPanel({ retab, onKeep, loaded }) {
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState(false);
  // The panel never unmounts across song loads inside the Song room (setlist
  // arrows, pasting a chart) — reset per re-fret or Song B inherits Song A's
  // "in your songbook" disabled Keep button.
  useEffect(() => { setKept(false); setCopied(false); }, [retab]);
  if (!retab) return null; // guitar matches the tab's tuning — nothing to re-fret

  const { text, summary, src, dst, srcCapo, dstCapo } = retab;
  const srcLabel = `${src.name}${srcCapo ? ` · capo ${srcCapo}` : ""}`;
  const dstLabel = `${dst.name}${dstCapo ? ` · capo ${dstCapo}` : ""}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard denied — nothing to do */ }
  };
  const keep = () => {
    onKeep?.(text, {
      title: `${loaded?.title || "Untitled"} (${dst.name})`,
      artist: loaded?.artist || "",
      tuning: dst.spelling,
      // explicit, even at zero — "" would invite detectCapo to re-read stale prose
      capo: String(dstCapo || 0),
    });
    setKept(true);
  };

  return (
    <section style={{
      marginBottom: 14, padding: "11px 13px", borderRadius: 12,
      background: C.panel2, border: `1px solid ${C.line}`,
    }}>
      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        <Guitar size={15} style={{ color: C.rootText, flexShrink: 0 }} />
        <span className="kl-eyebrow">Tab re-fretted</span>
        <span style={{ fontSize: 12.5, color: C.faint }}>
          written for {srcLabel} — playable on your {dstLabel}
        </span>
      </div>

      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {/* ink text + colored dot: the hue is semantic decoration, the words
            stay AA-legible on panel2 in both themes */}
        <span className="kl-meta" style={{ color: C.ink }}>
          {summary.blocks} block{summary.blocks === 1 ? "" : "s"}
        </span>
        {summary.shifted > 0 && (
          <span className="kl-meta" style={{ color: C.ink }}>
            <span aria-hidden="true" style={{ color: C.bassText }}>● </span>
            {summary.shifted} note{summary.shifted === 1 ? "" : "s"} octave-rescued
          </span>
        )}
        {summary.dropped > 0 ? (
          <span className="kl-meta" style={{ color: C.ink }}>
            <span aria-hidden="true" style={{ color: C.rootText }}>● </span>
            {summary.dropped} unplayable in {dst.name} — dropped, not faked
          </span>
        ) : (
          <span className="kl-meta" style={{ color: C.ink }}>
            <span aria-hidden="true" style={{ color: C.toneText }}>● </span>
            every pitch survived
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <button className="bench-btn" style={{ padding: "5px 11px", fontSize: 12 }} onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} copy
          </button>
          <button className="bench-btn" style={{ padding: "5px 11px", fontSize: 12 }} onClick={keep} disabled={kept}>
            <Save size={13} /> {kept ? "in your songbook" : `keep (${dst.name})`}
          </button>
        </span>
      </div>
    </section>
  );
}
