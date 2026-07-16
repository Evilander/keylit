// RetabPanel.jsx — the tab half of the tuning dropdown, made live. Chord
// sheets always retuned freely off the dropdown; a TAB's fret numbers were
// welded to the tuning it was written in. Now, when the guitar in your hands
// differs from the tab's source tuning/capo, App re-frets the tab for YOUR
// setup (lib/retab.js) and the chart below shows it automatically. This strip
// sits over that chart and does two jobs: it names every compromise out loud
// (octave-rescued and dropped pitches are counted, never hidden), and it lets
// you flip back to the original transcription — the re-fret is never
// destructive. Renders nothing when your guitar already matches the source.
import { useState } from "react";
import { Guitar, Copy, Save, Check } from "lucide-react";
import { C } from "../ui/theme.js";

export default function RetabPanel({ retab, asWritten, onToggle, onKeep, loaded }) {
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState(false);
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
      capo: dstCapo || "",
    });
    setKept(true);
  };

  const seg = (active) => ({
    padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: 0, borderRadius: 8, transition: "background 140ms ease, color 140ms ease",
    background: active ? C.ink : "transparent",
    color: active ? "var(--kl-on-ink)" : C.muted,
  });

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

        {/* segmented toggle: what the chart below is showing */}
        <span style={{
          marginLeft: "auto", display: "inline-flex", gap: 2, padding: 2,
          borderRadius: 10, background: C.panel, border: `1px solid ${C.line}`,
        }}>
          <button style={seg(!asWritten)} onClick={() => asWritten && onToggle?.()}
            aria-pressed={!asWritten}>Re-fretted</button>
          <button style={seg(asWritten)} onClick={() => !asWritten && onToggle?.()}
            aria-pressed={asWritten}>As written</button>
        </span>
      </div>

      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <span className="kl-meta">
          {summary.blocks} block{summary.blocks === 1 ? "" : "s"}
        </span>
        {summary.shifted > 0 && (
          <span className="kl-meta" style={{ color: C.bassText }}>
            {summary.shifted} note{summary.shifted === 1 ? "" : "s"} octave-rescued
          </span>
        )}
        {summary.dropped > 0 ? (
          <span className="kl-meta" style={{ color: C.rootText }}>
            {summary.dropped} unplayable in {dst.name} — dropped, not faked
          </span>
        ) : (
          <span className="kl-meta" style={{ color: C.toneText }}>every pitch survived</span>
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
