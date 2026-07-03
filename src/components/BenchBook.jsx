// BenchBook.jsx — setlists + practice memory. Musician-shaped: "tonight's
// bench", not a playlist; a cold shelf that resurfaces what's going stale
// (lib/bench.js does the honest math); a plain paper printout for the bench.
// Storage is storage.js/createBenchBook; play-along passes log themselves.
import { useEffect, useMemo, useState } from "react";
import { Play, Check, X, ChevronUp, ChevronDown, Printer, Plus, Search } from "lucide-react";
import { benchBook, userSongbook } from "../storage.js";
import { loadManifest } from "../corpus.js";
import { slugSongKey, coldSongs } from "../lib/bench.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const ago = (at, now) => {
  const d = Math.floor((now - at) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

export default function BenchBook({ onOpen }) {
  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [renaming, setRenaming] = useState(false);
  const now = Date.now();

  useEffect(() => {
    let dead = false;
    loadManifest().then((rows) => {
      if (dead) return;
      let userRows = [];
      try { userRows = userSongbook.rows(); } catch { /* fresh browser */ }
      setAllRows([...userRows, ...rows]);
    });
    return () => { dead = true; };
  }, []);

  const setlists = useMemo(() => benchBook.setlists(), [rev]);
  const log = useMemo(() => benchBook.log(), [rev]);
  const active = setlists.find((s) => s.id === activeId) || setlists[0] || null;

  const byKey = useMemo(() => {
    const m = new Map();
    for (const r of allRows) { const k = slugSongKey(r.artist, r.title); if (!m.has(k)) m.set(k, r); }
    return m;
  }, [allRows]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const inSet = new Set((active?.songs || []).map((s) => s.songKey));
    return allRows
      .filter((r) => `${r.title} ${r.artist}`.toLowerCase().includes(q))
      .filter((r) => !inSet.has(slugSongKey(r.artist, r.title)))
      .slice(0, 10);
  }, [query, allRows, active]);

  const cold = useMemo(() => coldSongs(log, now, { limit: 6 }), [log, now]);

  const create = () => {
    const sl = benchBook.createSetlist("Tonight", Date.now());
    setActiveId(sl.id);
    bump();
  };
  const add = (row) => {
    if (!active) return;
    benchBook.addToSetlist(active.id, {
      songKey: slugSongKey(row.artist, row.title),
      title: row.title, artist: row.artist,
      source: row.source, id: row.id,
      tuning: row.tuning || null, capo: row.capo || null, key: row.key || null,
    });
    setQuery("");
    bump();
  };
  const ranIt = (s) => {
    benchBook.logPractice({ songKey: s.songKey, title: s.title, artist: s.artist || null, at: Date.now(), kind: "ran-it" });
    bump();
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="kl-eyebrow">The bench book</div>
          <h2 className="kl-title" style={{ marginTop: 4, fontSize: 26 }}>Setlists &amp; practice memory</h2>
        </div>
        <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
          {setlists.map((sl) => (
            <button key={sl.id} onClick={() => setActiveId(sl.id)} aria-pressed={active?.id === sl.id}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                background: active?.id === sl.id ? C.panel2 : "transparent",
                color: active?.id === sl.id ? C.ink : C.muted,
                border: `1px solid ${active?.id === sl.id ? C.toneUi : C.line}` }}>
              {sl.name}
            </button>
          ))}
          <button className="bench-btn" onClick={create}><Plus size={14} /> new setlist</button>
        </div>
      </div>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 20, marginTop: 16, alignItems: "start" }}>
        {/* ---- tonight ---- */}
        <div className="faceplate" style={{ padding: 18 }}>
          {!active ? (
            <div style={{ color: C.muted, fontSize: 14 }}>
              <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 19, color: C.ink }}>Nothing on the bench yet.</p>
              <p style={{ marginTop: 8 }}>A setlist is tonight's plan: the songs, the order, the notes to self. Start one and search your library into it.</p>
              <button className="bench-btn primary" style={{ marginTop: 12 }} onClick={create}><Plus size={14} /> Start tonight's setlist</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between" style={{ gap: 10, marginBottom: 10 }}>
                {renaming ? (
                  <input autoFocus defaultValue={active.name} aria-label="setlist name"
                    onBlur={(e) => { benchBook.renameSetlist(active.id, e.target.value.trim() || active.name); setRenaming(false); bump(); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 22, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "2px 8px", outline: "none", width: 220 }} />
                ) : (
                  <button onClick={() => setRenaming(true)} title="rename"
                    style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 22, color: C.ink, background: "transparent", border: 0, cursor: "text", padding: 0 }}>
                    {active.name}
                  </button>
                )}
                <span className="flex items-center" style={{ gap: 8 }}>
                  <button className="bench-btn" onClick={() => window.print()} title="print this setlist"><Printer size={14} /> print</button>
                  <button onClick={() => { benchBook.removeSetlist(active.id); setActiveId(null); bump(); }} title="delete setlist"
                    style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer" }}><X size={15} /></button>
                </span>
              </div>

              {active.songs.length === 0 && (
                <p style={{ color: C.faint, fontSize: 13, margin: "6px 0 10px" }}>Empty bench — search your library below and stack it up.</p>
              )}
              {active.songs.map((s, i) => {
                const row = byKey.get(s.songKey) || (s.source && s.id ? s : null);
                const meta = [s.key ? `key ${s.key}` : null, s.capo ? `capo ${s.capo}` : null, s.tuning && s.tuning !== "standard" ? s.tuning : null].filter(Boolean).join(" · ");
                return (
                  <div key={s.songKey} className="flex items-center" style={{ gap: 8, padding: "7px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, width: 18, textAlign: "right" }}>{i + 1}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{s.title}</span>
                      <span style={{ fontSize: 12.5, color: C.muted }}> · {s.artist}</span>
                      {meta && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginLeft: 8 }}>{meta}</span>}
                    </span>
                    <button onClick={() => row && onOpen?.(row)} disabled={!row} title={row ? "open it" : "not in this library copy"}
                      style={{ ...rowBtn, opacity: row ? 1 : 0.35 }}><Play size={13} /></button>
                    <button onClick={() => ranIt(s)} title="mark practiced tonight" style={rowBtn}><Check size={13} /></button>
                    <button onClick={() => { benchBook.moveInSetlist(active.id, i, -1); bump(); }} disabled={i === 0} title="up" style={{ ...rowBtn, opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={13} /></button>
                    <button onClick={() => { benchBook.moveInSetlist(active.id, i, +1); bump(); }} disabled={i === active.songs.length - 1} title="down" style={{ ...rowBtn, opacity: i === active.songs.length - 1 ? 0.3 : 1 }}><ChevronDown size={13} /></button>
                    <button onClick={() => { benchBook.removeFromSetlist(active.id, s.songKey); bump(); }} title="take it off" style={rowBtn}><X size={13} /></button>
                  </div>
                );
              })}

              <div style={{ marginTop: 12, position: "relative" }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <Search size={14} style={{ color: C.faint }} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search your library to add…" aria-label="add songs"
                    style={{ flex: 1, background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 11px", fontSize: 13, outline: "none" }} />
                </div>
                {results.length > 0 && (
                  <div style={{ marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
                    {results.map((r) => (
                      <button key={`${r.source}/${r.id}`} onClick={() => add(r)}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 11px", background: C.panel, border: 0, borderTop: `1px solid ${C.line}`, cursor: "pointer", textAlign: "left" }}>
                        <Plus size={12} style={{ color: C.toneText }} />
                        <span style={{ fontSize: 13, color: C.ink }}>{r.title}</span>
                        <span style={{ fontSize: 12, color: C.muted }}>· {r.artist}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <textarea value={active.notes || ""} onChange={(e) => { benchBook.setSetlistNotes(active.id, e.target.value); bump(); }}
                placeholder="notes to self — tempos, capo moves, who sings what…" aria-label="setlist notes" spellCheck={false}
                style={{ width: "100%", marginTop: 12, minHeight: 54, resize: "vertical", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, lineHeight: 1.5, outline: "none", fontFamily: "var(--kl-sans)" }} />
            </>
          )}
        </div>

        {/* ---- the shelf + the log ---- */}
        <div>
          <div className="faceplate" style={{ padding: 16 }}>
            <span className="kl-eyebrow">The cold shelf</span>
            {cold.length === 0 ? (
              <p style={{ color: C.faint, fontSize: 12.5, marginTop: 8 }}>Practice something and Keylit starts keeping score — what sits too long shows up here.</p>
            ) : (
              cold.map((c) => {
                const row = byKey.get(c.songKey);
                return (
                  <div key={c.songKey} className="flex items-center" style={{ gap: 8, marginTop: 9 }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13.5, color: C.ink }}>{c.title}</span>
                      {c.artist && <span style={{ fontSize: 12, color: C.muted }}> · {c.artist}</span>}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: c.daysSince > 13 ? C.bassText : C.faint }}>
                      {c.daysSince}d{c.lastAccuracy != null ? ` · ${Math.round(c.lastAccuracy * 100)}%` : ""}
                    </span>
                    <button onClick={() => row && onOpen?.(row)} disabled={!row} title={row ? "warm it up" : "chart not in this copy"}
                      style={{ ...rowBtn, opacity: row ? 1 : 0.35 }}><Play size={12} /></button>
                  </div>
                );
              })
            )}
          </div>

          <div className="faceplate" style={{ padding: 16, marginTop: 16 }}>
            <span className="kl-eyebrow">Recent passes</span>
            {log.length === 0 ? (
              <p style={{ color: C.faint, fontSize: 12.5, marginTop: 8 }}>Play-along scores and "ran it" marks land here.</p>
            ) : (
              log.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, width: 64 }}>{ago(e.at, now)}</span>
                  <span style={{ fontSize: 12.5, color: C.ink, minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: e.kind === "playalong" ? C.toneText : C.faint }}>
                    {e.kind === "playalong" && typeof e.accuracy === "number" ? `${Math.round(e.accuracy * 100)}%` : "ran it"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* paper copy: only this survives print */}
      {active && (
        <div className="kl-printonly">
          <h1 style={{ fontSize: 26, margin: 0 }}>{active.name}</h1>
          <ol style={{ fontSize: 16, lineHeight: 1.9, marginTop: 16, paddingLeft: 22 }}>
            {active.songs.map((s) => (
              <li key={s.songKey}>
                <b>{s.title}</b> — {s.artist}
                {(s.key || s.capo || (s.tuning && s.tuning !== "standard")) && (
                  <span> ({[s.key ? `key ${s.key}` : null, s.capo ? `capo ${s.capo}` : null, s.tuning && s.tuning !== "standard" ? s.tuning : null].filter(Boolean).join(", ")})</span>
                )}
              </li>
            ))}
          </ol>
          {active.notes && <p style={{ marginTop: 18, fontSize: 14, whiteSpace: "pre-wrap" }}>{active.notes}</p>}
        </div>
      )}
    </div>
  );
}

const rowBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 7, background: "transparent",
  color: C.muted, border: `1px solid ${C.line}`, cursor: "pointer", flex: "0 0 auto",
};
