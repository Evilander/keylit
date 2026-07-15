// RetabPanel.jsx — the missing half of the tuning dropdown: chord sheets
// always retuned freely, but a TAB's fret numbers were welded to their
// tuning. This panel re-frets the loaded tab for the guitar in your hands
// (lib/retab.js beam search) and reports every compromise out loud —
// octave-rescued notes and dropped notes are counted, never hidden.
import { useMemo, useState } from "react";
import { ChevronDown, Guitar, Copy, Save, Check } from "lucide-react";
import { hasTab } from "../lib/tab.js";
import { canonicalTuning } from "../lib/tuning.js";
import { swapTabBlocks } from "../lib/retab.js";
import { C, MONO } from "../ui/theme.js";

export default function RetabPanel({ sheet, sourceTuning, sourceCapo, targetTuningId, targetCapo, onKeep, loaded }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState(false);

  const src = canonicalTuning(sourceTuning || "standard");
  const dst = canonicalTuning(targetTuningId || "standard");
  const relevant = useMemo(
    () => hasTab(sheet) && (src.id !== dst.id || (sourceCapo || 0) !== (targetCapo || 0)),
    [sheet, src.id, dst.id, sourceCapo, targetCapo]
  );
  if (!relevant) return null;

  const run = () => {
    const r = swapTabBlocks(sheet, {
      from: { tuning: src.id, capo: sourceCapo || 0 },
      to: { tuning: dst.id, capo: targetCapo || 0 },
    });
    setResult(r);
    setCopied(false);
    setKept(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(result.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard denied */ }
  };

  const keep = () => {
    onKeep?.(result.text, {
      title: `${loaded?.title || "Untitled"} (${dst.name})`,
      artist: loaded?.artist || "",
      tuning: dst.spelling,
      capo: targetCapo || "",
    });
    setKept(true);
  };

  return (
    <section style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}>
        <ChevronDown size={15} style={{ color: C.faint, transform: open ? "none" : "rotate(-90deg)", transition: "transform 160ms ease" }} />
        <span className="kl-eyebrow">Re-fret the tab</span>
        <span style={{ fontSize: 12.5, color: C.faint }}>
          — written for {src.name}{sourceCapo ? ` capo ${sourceCapo}` : ""}; your guitar is in {dst.name}{targetCapo ? ` capo ${targetCapo}` : ""}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {!result ? (
            <button className="bench-btn primary" onClick={run}>
              <Guitar size={14} /> Re-fret for {dst.name}{targetCapo ? ` · capo ${targetCapo}` : ""}
            </button>
          ) : (
            <div>
              <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <span className="kl-meta">
                  {result.summary.blocks} block{result.summary.blocks === 1 ? "" : "s"} re-fretted
                </span>
                {result.summary.shifted > 0 && (
                  <span className="kl-meta" style={{ color: C.bassText }}>
                    {result.summary.shifted} note{result.summary.shifted === 1 ? "" : "s"} octave-rescued
                  </span>
                )}
                {result.summary.dropped > 0 ? (
                  <span className="kl-meta" style={{ color: C.rootText }}>
                    {result.summary.dropped} unplayable in this tuning — dropped, not faked
                  </span>
                ) : (
                  <span className="kl-meta" style={{ color: C.toneText }}>every pitch survived</span>
                )}
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                  <button className="bench-btn" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={copy}>
                    {copied ? <Check size={13} /> : <Copy size={13} />} copy
                  </button>
                  <button className="bench-btn" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={keep} disabled={kept}>
                    <Save size={13} /> {kept ? "in your songbook" : `keep as a song (${dst.name})`}
                  </button>
                  <button className="bench-btn" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={run}>again</button>
                </span>
              </div>
              <pre style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", maxHeight: 340, overflow: "auto", whiteSpace: "pre" }}>
                {result.text}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
