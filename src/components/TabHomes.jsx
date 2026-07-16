// TabHomes.jsx — "where does this tab sit?" CapoAdvisor answers that for
// chord shapes; this is the tab's analog, judged on the REAL notes:
// lib/tabfit.js re-frets the whole transcription into each candidate setup
// with retab's beam search and ranks by how a hand would feel it. Click a
// home and the tuning/capo dropdowns move there — the live re-fret does the
// rest. Renders nothing when the sheet has no tab.
import { useMemo } from "react";
import { Compass } from "lucide-react";
import { parseTab } from "../lib/tab.js";
import { tabHomes } from "../lib/tabfit.js";
import { C, MONO } from "../ui/theme.js";

export default function TabHomes({ sheet, sourceTuning, sourceCapo, currentTuningId, currentCapo, onApply }) {
  const homes = useMemo(() => {
    const parsed = parseTab(sheet, { defaultTuning: sourceTuning, capo: sourceCapo });
    if (!parsed.blocks.some((b) => b.events?.length)) return null;
    return tabHomes(parsed.blocks, { maxResults: 3, sourceCapo: sourceCapo || 0 });
  }, [sheet, sourceTuning, sourceCapo]);

  if (!homes || !homes.length) return null;

  return (
    <section style={{ marginTop: 14 }}>
      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
        <Compass size={14} style={{ color: C.toneText, flexShrink: 0 }} />
        <span className="kl-eyebrow">Where this tab sits</span>
        {homes.blocksJudged < homes.blocksTotal && (
          <span className="kl-meta" style={{ color: C.faint }}>
            judged on the first {homes.blocksJudged} of {homes.blocksTotal} riffs
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {homes.map((h, i) => {
          const active = h.tuning.id === currentTuningId && h.capo === (currentCapo || 0);
          const name = `${h.tuning.name}${h.capo ? ` · capo ${h.capo}` : ""}`;
          return (
            <button key={`${h.tuning.id}@${h.capo}`}
              onClick={() => !active && onApply?.(h.tuning.id, h.capo)}
              title={active ? "your current setup" : `set the guitar to ${name}`}
              aria-pressed={active}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
                padding: "8px 12px", borderRadius: 10, cursor: active ? "default" : "pointer",
                background: active ? C.panel2 : "transparent",
                border: `1px solid ${active ? C.lineStrong : C.line}`,
                textAlign: "left", minWidth: 150,
              }}>
              <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: i === 0 ? C.toneText : C.ink }}>
                {i === 0 ? "easiest — " : ""}{name}{active ? " ✓" : ""}
              </span>
              <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{h.verdict}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
