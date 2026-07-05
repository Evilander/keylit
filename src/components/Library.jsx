// Library.jsx — the catalog. Alphabetical artist index (hairline rows, no
// cards); expand an artist to see songs grouped BY ALBUM. A tuning filter bar
// lets you click a tuning to see every song in it, across all artists.
// "Setlist" mode turns rows into a picker: check songs across any artists,
// stack them straight into the Bench Book.
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, X, Plus, Disc3, ListMusic, CircleCheck, Circle } from "lucide-react";
import { loadManifest, groupByArtist, SOURCE_LABEL } from "../corpus.js";
import { userSongbook, benchBook } from "../storage.js";
import { slugSongKey } from "../lib/bench.js";
import AddSong from "./AddSong.jsx";
import Ear from "./Ear.jsx";
import { C, MONO, DISPLAY } from "../ui/theme.js";

// Browse state survives leaving the room (Back returns you to the same
// search, tuning filter, and expanded artists — not a collapsed index).
const remembered = { q: "", tuning: null, open: [] };

export default function Library({ onOpen, onSetlist, onPaste, onDemo, onHeard }) {
  const [fetched, setFetched] = useState(null);
  const [userRows, setUserRows] = useState(() => userSongbook.rows());
  const [adding, setAdding] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [q, setQ] = useState(remembered.q);
  const [tuning, setTuning] = useState(remembered.tuning); // tuningId or null
  const [open, setOpen] = useState(() => new Set(remembered.open));
  const [allTunings, setAllTunings] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Map()); // id -> manifest row
  const [setName, setSetName] = useState("Tonight");
  const [destId, setDestId] = useState("new");

  useEffect(() => { remembered.q = q; }, [q]);
  useEffect(() => { remembered.tuning = tuning; }, [tuning]);
  useEffect(() => { remembered.open = [...open]; }, [open]);

  const toggleSel = (row) => setSel((m) => {
    const n = new Map(m);
    n.has(row.id) ? n.delete(row.id) : n.set(row.id, row);
    return n;
  });

  const makeSetlist = () => {
    if (!sel.size) return;
    let target = destId !== "new" && benchBook.setlists().find((s) => s.id === destId);
    if (!target) target = benchBook.createSetlist(setName.trim() || "Tonight", Date.now());
    for (const row of sel.values()) {
      benchBook.addToSetlist(target.id, {
        songKey: slugSongKey(row.artist, row.title),
        title: row.title, artist: row.artist,
        source: row.source, id: row.id,
        tuning: row.tuning || null, capo: row.capo || null, key: row.key || null,
      });
    }
    setSel(new Map());
    setSelecting(false);
    onSetlist?.(target);
  };

  useEffect(() => { let on = true; loadManifest().then((r) => { if (on) setFetched(r); }); return () => { on = false; }; }, []);
  // Your songs join the same catalog, grouped and styled like everyone else.
  const rows = useMemo(() => (fetched === null ? null : [...userRows, ...fetched]), [fetched, userRows]);

  const removeUserSong = (id) => { userSongbook.remove(id); setUserRows(userSongbook.rows()); };
  const onSaved = (song) => {
    setUserRows(userSongbook.rows());
    setAdding(false);
    setOpen((s) => new Set(s).add(song.artist));
  };

  const tuningFacets = useMemo(() => {
    if (!rows) return [];
    const by = new Map();
    for (const r of rows) {
      const id = r.tuningId || "standard";
      if (!by.has(id)) by.set(id, { id, name: r.tuningName || (id === "standard" ? "Standard" : id), count: 0 });
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

  // No songs at all — invite, don't apologize.
  if (rows.length === 0) {
    return (
      <div className="kl-section" style={{ maxWidth: 640 }}>
        <div className="kl-eyebrow">The catalog</div>
        <h1 className="kl-title" style={{ marginTop: 4 }}>Bring a song</h1>
        <p className="kl-prose" style={{ marginTop: 12 }}>
          This copy of Keylit ships without a bundled songbook. Add any chord
          chart or guitar tab — Ultimate-Guitar, ChordPro, plain chords over
          lyrics, 6-line ASCII tab — and it becomes a playable piano: lit keys,
          numbers, fingerings, the works.
        </p>
        {adding ? (
          <AddSong onSaved={onSaved} onClose={() => setAdding(false)} />
        ) : (
          <div className="flex items-center" style={{ gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button className="bench-btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add a song to your library</button>
            <button className="bench-btn" onClick={() => setHearing((v) => !v)}><Disc3 size={15} /> Hear a record</button>
            <button className="bench-btn" onClick={() => onPaste?.()}>Just paste one</button>
            <button className="bench-btn" onClick={() => onDemo?.()}>Try the demo song</button>
          </div>
        )}
        {hearing && <Ear onLoadSheet={onHeard} onClose={() => setHearing(false)} />}
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
        <div className="flex items-center" style={{ gap: 12 }}>
          <span className="kl-meta kl-hide-sm">{rows.length} songs · {new Set(rows.map((r) => r.artist || "Various")).size} artists</span>
          <button className={`bench-btn${selecting ? " primary" : ""}`} style={{ padding: "7px 13px", fontSize: 13 }}
            onClick={() => { setSelecting((v) => !v); setSel(new Map()); }} aria-pressed={selecting}
            title="pick songs across the library and stack them into a setlist">
            <ListMusic size={14} /> {selecting ? "picking…" : "Setlist"}
          </button>
          <button className="bench-btn" style={{ padding: "7px 13px", fontSize: 13 }} onClick={() => setHearing((v) => !v)}>
            <Disc3 size={14} /> Hear a record
          </button>
          <button className="bench-btn" style={{ padding: "7px 13px", fontSize: 13 }} onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> Add a song
          </button>
        </div>
      </div>

      {hearing && <Ear onLoadSheet={onHeard} onClose={() => setHearing(false)} />}
      {adding && <AddSong onSaved={onSaved} onClose={() => setAdding(false)} />}

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
              <button key={s.id} onClick={() => (selecting ? toggleSel(s) : onOpen?.(s))}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: `1px solid ${C.line}`, background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                {selecting && <SelMark on={sel.has(s.id)} />}
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
                  <span className="kl-meta kl-hide-sm" style={{ color: C.faint, minWidth: 110, textAlign: "right" }}>{sources.join(" · ")}</span>
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
                        {al.songs.map((s) => (
                          <SongRow key={s.id} s={s} onOpen={onOpen} onTuning={setTuning} onRemove={removeUserSong}
                            selecting={selecting} selected={sel.has(s.id)} onToggle={toggleSel} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selecting && (
        <div style={{ position: "sticky", bottom: 12, marginTop: 16, zIndex: 20 }}>
          <div className="faceplate" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap", boxShadow: "0 8px 28px rgba(30,25,18,0.18)" }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: sel.size ? C.toneText : C.faint }}>
              {sel.size} picked
            </span>
            <select value={destId} onChange={(e) => setDestId(e.target.value)} aria-label="destination setlist"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 13 }}>
              <option value="new">new setlist…</option>
              {benchBook.setlists().map((sl) => <option key={sl.id} value={sl.id}>add to: {sl.name}</option>)}
            </select>
            {destId === "new" && (
              <input value={setName} onChange={(e) => setSetName(e.target.value)} aria-label="setlist name" placeholder="setlist name"
                style={{ width: 150, background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none" }} />
            )}
            <button className="bench-btn primary" disabled={!sel.size} onClick={makeSetlist} style={{ opacity: sel.size ? 1 : 0.5 }}>
              <ListMusic size={14} /> To the Bench Book
            </button>
            <button className="bench-btn" onClick={() => { setSelecting(false); setSel(new Map()); }}>cancel</button>
            <span style={{ fontSize: 12, color: C.faint, marginLeft: "auto" }} className="kl-hide-sm">
              click songs to pick them — any artist, any tuning
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SelMark({ on }) {
  return on
    ? <CircleCheck size={16} style={{ color: C.toneUi, flex: "0 0 auto" }} />
    : <Circle size={16} style={{ color: C.faint, flex: "0 0 auto" }} />;
}

function SongRow({ s, onOpen, onTuning, onRemove, selecting, selected, onToggle }) {
  const alt = s.tuningId && s.tuningId !== "standard";
  const mine = s.source === "user";
  return (
    <button onClick={() => (selecting ? onToggle?.(s) : onOpen?.(s))}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "7px 4px 7px 31px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      {selecting && <SelMark on={selected} />}
      <span style={{ fontFamily: "var(--kl-sans)", fontSize: 14.5, color: C.ink, flex: 1 }}>{s.title}</span>
      {mine && <Tag color={C.toneText}>yours</Tag>}
      {s.format === "tab" && <Tag>tab</Tag>}
      {alt && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onTuning?.(s.tuningId); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onTuning?.(s.tuningId); } }}
        title={`Filter by ${s.tuningName}`}
        style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: C.toneText, border: `1px solid ${C.toneText}66`, borderRadius: 5, padding: "1px 6px", cursor: "pointer" }}>{s.tuningName}</span>}
      {s.capo ? <Tag color={C.rootText}>capo {s.capo}</Tag> : null}
      {s.key ? <span className="kl-meta kl-hide-sm" style={{ minWidth: 42, textAlign: "right" }}>{s.key}</span> : null}
      {mine && (
        <span role="button" tabIndex={0} aria-label={`remove ${s.title} from your songbook`}
          onClick={(e) => { e.stopPropagation(); onRemove?.(s.id); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRemove?.(s.id); } }}
          title="Remove from your songbook"
          style={{ color: C.faint, display: "inline-flex", padding: 2, cursor: "pointer" }}>
          <X size={13} />
        </span>
      )}
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
