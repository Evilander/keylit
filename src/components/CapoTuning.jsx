// CapoTuning.jsx — Theory › Capo & Tunings. Two parts:
//  1) "Play it easier" — the real capo.js advisor ranks ways to play the loaded
//     song across capo positions AND open tunings, with authentic fretboard math.
//  2) "Tunings" — the curated alternate-tuning reference (data/tunings.js).
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { suggestArrangements } from "../lib/capo.js";
import { TUNINGS_REFERENCE } from "../data/tunings.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const FAMILY_LABEL = { standard: "Standard", drop: "Drop", open: "Open", modal: "Modal", raised: "Pitch-shift" };

export default function CapoTuning({ prog }) {
  const [q, setQ] = useState("");

  const [ranking, setRanking] = useState({ prog: null, rows: [], loading: false });
  useEffect(() => {
    let cancelled = false, timer;
    const results = [];
    const tunings = ["standard", "dropD", "openD", "openE", "openG", "openA", "openC", "DADGAD"];
    let index = 0;
    setRanking({ prog, rows: [], loading: !!prog?.length });
    const step = () => {
      if (cancelled || !prog?.length) return;
      try {
        results.push(...suggestArrangements(prog, { tunings: [tunings[index++]], maxFret: 7 }));
        if (index < tunings.length) { timer = setTimeout(step, 0); return; }
        const friction = (id) => id === "standard" ? 0 : id === "dropD" ? 0.4 : 1;
        results.sort((a, b) => a.totalEase - b.totalEase || a.capo - b.capo || friction(a.tuningId) - friction(b.tuningId));
        setRanking({ prog, rows: results.slice(0, 6), loading: false });
      } catch { setRanking({ prog, rows: [], loading: false }); }
    };
    timer = setTimeout(step, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [prog]);
  const arrangements = ranking.prog === prog ? ranking.rows : [];
  const loading = !!prog?.length && (ranking.prog !== prog || ranking.loading);

  const tunings = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return TUNINGS_REFERENCE;
    return TUNINGS_REFERENCE.filter((t) =>
      [t.name, t.strings, t.description, ...(t.artists || []).map((a) => a.name)]
        .join(" ").toLowerCase().includes(needle));
  }, [q]);

  return (
    <div>
      {loading && <p role="status">Finding easier capo and tuning arrangements…</p>}
      {arrangements.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <div className="kl-eyebrow" style={{ marginBottom: 4 }}>Play it easier</div>
          <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, maxWidth: 620, marginTop: 0 }}>
            Ranked ways to play this song — capo positions and open tunings — scored by how friendly the shapes are. Honest math: it won't tell you to retune unless it genuinely helps.
          </p>
          <div className="kl-rows" style={{ marginTop: 8 }}>
            {arrangements.map((a, i) => (
              <div key={`${a.tuningId}-${a.capo}`} style={{ borderBottom: `1px solid ${C.line}`, padding: "13px 4px" }}>
                <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}>
                    {a.tuningName}{a.capo > 0 ? ` · capo ${a.capo}` : a.tuningId === "standard" ? " · no capo" : " · open"}
                  </span>
                  {i === 0 && <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.toneText, border: `1px solid ${C.toneText}66`, borderRadius: 5, padding: "1px 6px" }}>easiest</span>}
                  <span className="kl-meta" style={{ marginLeft: "auto", color: C.faint }}>{a.openChordCount} easy shape{a.openChordCount === 1 ? "" : "s"}</span>
                </div>
                {a.note && <div style={{ color: C.muted, fontSize: 12.5, marginTop: 5 }}>{a.note}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {a.shapes.map((s, j) => (
                    <span key={j} style={{ fontFamily: MONO, fontSize: 11.5, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 8px" }}>
                      <b style={{ color: C.rootText }}>{s.symbol}</b> <span style={{ color: C.muted }}>{s.how}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div className="kl-eyebrow">Tunings — {TUNINGS_REFERENCE.length} in the book</div>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.faint }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tunings or artists" aria-label="Search tunings"
              style={{ padding: "7px 10px 7px 30px", fontFamily: "var(--kl-sans)", fontSize: 13, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, outline: "none", width: 230 }} />
          </div>
        </div>
        <div className="kl-rows">
          {tunings.map((t) => (
            <div key={t.id} style={{ borderBottom: `1px solid ${C.line}`, padding: "13px 4px" }}>
              <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}>{t.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.toneText, letterSpacing: "0.06em" }}>{t.strings}</span>
                <span className="kl-meta" style={{ marginLeft: "auto", color: C.faint }}>{FAMILY_LABEL[t.family] || t.family}</span>
              </div>
              {t.description && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 720 }}>{t.description}</p>}
              {t.artists?.length > 0 && (
                <div className="kl-meta" style={{ marginTop: 6, color: C.faint }}>
                  {t.artists.map((a) => a.name).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
