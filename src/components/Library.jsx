// Library.jsx — the catalog. Alphabetical artist index (hairline rows, no
// cards); expand an artist to see songs grouped BY ALBUM (chronological), with
// key/capo/source badges. Clicking a song loads it. Lazy-loads the manifest.
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { loadManifest, groupByArtist, SOURCE_LABEL } from "../corpus.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

export default function Library({ onOpen }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => { let on = true; loadManifest().then((r) => { if (on) setRows(r); }); return () => { on = false; }; }, []);

  const groups = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => r.artist.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle) || (r.album || "").toLowerCase().includes(needle))
      : rows;
    return groupByArtist(filtered);
  }, [rows, q]);

  const toggle = (artist) => setOpen((s) => { const n = new Set(s); n.has(artist) ? n.delete(artist) : n.add(artist); return n; });
  const autoOpen = q.trim().length > 0;

  if (rows === null) return <p style={{ color: C.muted }}>Loading the library…</p>;

  return (
    <div className="kl-section">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="kl-eyebrow">The catalog</div>
          <h1 className="kl-title" style={{ marginTop: 4 }}>Library</h1>
        </div>
        <div className="kl-meta">{rows.length} songs · {groups.length} artists</div>
      </div>

      <div style={{ position: "relative", margin: "18px 0 6px", maxWidth: 420 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.faint }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, albums, artists" aria-label="Search the library"
          style={{ width: "100%", padding: "10px 12px 10px 34px", fontFamily: "var(--kl-sans)", fontSize: 14, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, outline: "none" }} />
      </div>

      {rows.length === 0 && (
        <p style={{ color: C.muted, marginTop: 20 }}>The corpus hasn't been built yet. Run <code>tools/scrape_tabs.py</code> to fill the shelves.</p>
      )}

      <div className="kl-rows" style={{ marginTop: 12 }}>
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
                      {al.songs.map((s) => <SongRow key={s.id} s={s} onOpen={onOpen} />)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SongRow({ s, onOpen }) {
  return (
    <button onClick={() => onOpen?.(s)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "7px 4px 7px 31px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ fontFamily: "var(--kl-sans)", fontSize: 14.5, color: C.ink, flex: 1 }}>{s.title}</span>
      {s.format === "tab" && <Tag>tab</Tag>}
      {s.tuning && s.tuning !== "standard" && <Tag color={C.toneText}>{s.tuning}</Tag>}
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
