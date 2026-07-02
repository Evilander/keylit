// Library.jsx — the catalog. Alphabetical artist index (hairline rows, no
// cards); expand an artist to see songs grouped BY ALBUM. A tuning filter bar
// lets you click a tuning to see every song in it, across all artists.
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, X } from "lucide-react";
import { loadManifest, groupByArtist, SOURCE_LABEL } from "../corpus.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

export default function Library({ onOpen, onPaste, onDemo }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [tuning, setTuning] = useState(null); // tuningId or null
  const [open, setOpen] = useState(() => new Set());
  const [allTunings, setAllTunings] = useState(false);

  useEffect(() => { let on = true; loadManifest().then((r) => { if (on) setRows(r); }); return () => { on = false; }; }, []);

  const tuningFacets = useMemo(() => {
    if (!rows) return [];
    const by = new Map();
    for (const r of rows) {
      const id = r.tuningId || "standard";
      if (id === "standard") continue;
      if (!by.has(id)) by.set(id, { id, name: r.tuningName || id, count: 0 });
      by.get(id).count++;
    }
    return [...by.values()].filter((t) => t.count >= 2).sort((a, b) => b.count - a.count);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!tuning || r.tuningId === tuning) &&
      (!needle || r.artist?.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle) || (r.album || "").toLowerCase().includes(needle)));
  }, [rows, q, tuning]);

  const groups = useMemo(() => groupByArtist(filtered), [filtered]);
  const toggle = (artist) => setOpen((s) => { const n = new Set(s); n.has(artist) ? n.delete(artist) : n.add(artist); return n; });
  const autoOpen = q.trim().length > 0 || !!tuning;

  if (rows === null) return <p style={{ color: C.muted }}>Loading the library…</p>;

  // No bundled corpus (the public build ships without one) — invite, don't apologize.
  if (rows.length === 0) {
    return (
      <div className="kl-section" style={{ maxWidth: 560 }}>
        <div className="kl-eyebrow">The catalog</div>
        <h1 className="kl-title" style={{ marginTop: 4 }}>Bring a song</h1>
        <p className="kl-prose" style={{ marginTop: 12 }}>
          This copy of Keylit ships without a bundled songbook. Paste any chord
          chart or guitar tab — Ultimate-Guitar, ChordPro, plain chords over
          lyrics, 6-line ASCII tab — and it becomes a playable piano: lit keys,
          numbers, fingerings, the works.
        </p>
        <div className="flex items-center" style={{ gap: 10, marginTop: 18 }}>
          <button className="bench-btn primary" onClick={() => onPaste?.()}>Paste a chart or tab</button>
          <button className="bench-btn" onClick={() => onDemo?.()}>Try the demo song</button>
        </div>
      </div>
    );
  }

  const tuningName = tuning && (tuningFacets.find((t) => t.id === tuning)?.name || tuning);
  const shownFacets = allTunings ? tuningFacets : tuningFacets.slice(0, 8);

  return (
    <div className="kl-section">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="kl-eyebrow">The catalog</div>
          <h1 className="kl-title" style={{ marginTop: 4 }}>Library</h1>
        </div>
        <div className="kl-meta">{rows.length} songs · {new Set(rows.map((r) => r.artist || "Various")).size} artists</div>
      </div>

      <div style={{ position: "relative", margin: "18px 0 10px", maxWidth: 420 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.faint }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, albums, artists" aria-label="Search the library"
          style={{ width: "100%", padding: "10px 12px 10px 34px", fontFamily: "var(--kl-sans)", fontSize: 14, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, outline: "none" }} />
      </div>

      {tuningFacets.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          <span className="kl-eyebrow" style={{ marginRight: 4 }}>Tuning</span>
          {shownFacets.map((t) => {
            const active = tuning === t.id;
            return (
              <button key={t.id} onClick={() => setTuning(active ? null : t.id)}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  color: active ? "#FAFAF8" : C.toneText, background: active ? C.toneUi : C.panel, border: `1px solid ${active ? C.toneUi : C.line}` }}>
                {t.name} <span style={{ opacity: 0.7 }}>{t.count}</span>
              </button>
            );
          })}
          {tuningFacets.length > 8 && (
            <button onClick={() => setAllTunings((v) => !v)}
              style={{ fontFamily: "var(--kl-sans)", fontSize: 12, fontWeight: 600, color: C.muted, background: "transparent", border: 0, cursor: "pointer", padding: "4px 6px" }}>
              {allTunings ? "fewer" : `+${tuningFacets.length - 8} more`}
            </button>
          )}
        </div>
      )}

      {tuning ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 6px" }}>
            <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 19, color: C.ink }}>Songs in {tuningName}</span>
            <span className="kl-meta">{filtered.length}</span>
            <button onClick={() => setTuning(null)} className="chip" style={{ padding: "3px 10px", fontSize: 12 }}><X size={12} /> clear</button>
          </div>
          <div className="kl-rows" style={{ marginTop: 4 }}>
            {filtered.slice().sort((a, b) => (a.artist || "").localeCompare(b.artist || "") || a.title.localeCompare(b.title)).map((s) => (
              <button key={s.id} onClick={() => onOpen?.(s)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: `1px solid ${C.line}`, background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 15, color: C.muted, minWidth: 160 }}>{s.artist || "Various"}</span>
                <span style={{ fontFamily: "var(--kl-sans)", fontSize: 14.5, color: C.ink, flex: 1 }}>{s.title}</span>
                {s.capo ? <Tag color={C.rootText}>capo {s.capo}</Tag> : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="kl-rows">
          {groups.map((g) => {
            const isOpen = autoOpen || open.has(g.artist);
            const allSongs = g.albums.flatMap((a) => a.songs);
            const sources = [...new Set(allSongs.map((s) => s.source))].map((s) => SOURCE_LABEL[s] || s);
            return (
              <div key={g.artist} style={{ borderBottom: `1px solid ${C.line}` }}>
                <button onClick={() => toggle(g.artist)} aria-expanded={isOpen}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 4px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}>
                  <ChevronRight size={15} style={{ color: C.faint, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }} />
                  <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 21, color: C.ink, flex: 1 }}>{g.artist}</span>
                  <span className="kl-meta">{g.count} {g.count === 1 ? "song" : "songs"}</span>
                  <span className="kl-meta" style={{ color: C.faint, minWidth: 110, textAlign: "right" }}>{sources.join(" · ")}</span>
                </button>
                {isOpen && (
                  <div style={{ paddingBottom: 10 }}>
                    {g.albums.map((al, ai) => (
                      <div key={ai}>
                        {g.multiAlbum && (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 4px 4px 31px" }}>
                            <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 15.5, color: C.muted }}>{al.album || "Other"}</span>
                            <span className="kl-meta" style={{ color: C.faint, fontSize: 11 }}>{al.songs.length}</span>
                            <span style={{ flex: 1, height: 1, background: C.line, marginLeft: 4 }} />
                          </div>
                        )}
                        {al.songs.map((s) => <SongRow key={s.id} s={s} onOpen={onOpen} onTuning={setTuning} />)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SongRow({ s, onOpen, onTuning }) {
  const alt = s.tuningId && s.tuningId !== "standard";
  return (
    <button onClick={() => onOpen?.(s)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "7px 4px 7px 31px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ fontFamily: "var(--kl-sans)", fontSize: 14.5, color: C.ink, flex: 1 }}>{s.title}</span>
      {s.format === "tab" && <Tag>tab</Tag>}
      {alt && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onTuning?.(s.tuningId); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onTuning?.(s.tuningId); } }}
        title={`Filter by ${s.tuningName}`}
        style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: C.toneText, border: `1px solid ${C.toneText}66`, borderRadius: 5, padding: "1px 6px", cursor: "pointer" }}>{s.tuningName}</span>}
      {s.capo ? <Tag color={C.rootText}>capo {s.capo}</Tag> : null}
      {s.key ? <span className="kl-meta" style={{ minWidth: 42, textAlign: "right" }}>{s.key}</span> : null}
    </button>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em", color: color || C.muted, border: `1px solid ${color ? `${color}66` : C.line}`, borderRadius: 5, padding: "1px 6px" }}>
      {children}
    </span>
  );
}
