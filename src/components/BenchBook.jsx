import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { benchBook, userSongbook } from "../storage.js";
import { loadManifest } from "../corpus.js";
import { coldSongs, slugSongKey } from "../lib/bench.js";
import { C, MONO } from "../ui/theme.js";
import SetlistPaper from "./SetlistPaper.jsx";

const ago = (at, now) => {
  const days = Math.floor((now - at) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
};

export default function BenchBook({ onOpen, onPerformSet, onRunFrom }) {
  const [revision, setRevision] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const bump = () => setRevision((value) => value + 1);
  const setlists = useMemo(() => benchBook.setlists(), [revision]);
  const log = useMemo(() => benchBook.log(), [revision]);
  const active = setlists.find((setlist) => setlist.id === activeId) || setlists[0] || null;
  const now = Date.now();

  useEffect(() => {
    let cancelled = false;
    loadManifest().then((manifest) => {
      if (!cancelled) setRows([...userSongbook.rows(), ...manifest]);
    });
    return () => { cancelled = true; };
  }, []);

  const resultRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return rows.filter((row) => `${row.title} ${row.artist || ""}`.toLowerCase().includes(needle)).slice(0, 10);
  }, [query, rows]);
  const bySongKey = useMemo(() => new Map(rows.map((row) => [row.songKey || slugSongKey(row.artist, row.title), row])), [rows]);
  const cold = useMemo(() => coldSongs(log, now, { limit: 6 }), [log, now]);

  const create = () => {
    const setlist = benchBook.createSetlist("Tonight", Date.now());
    if (setlist) { setActiveId(setlist.id); bump(); }
  };
  const add = (row) => {
    if (!active) return;
    benchBook.addToSetlist(active.id, {
      songKey: row.songKey || slugSongKey(row.artist, row.title),
      title: row.title, artist: row.artist || null, source: row.source, id: row.id,
      tuning: row.tuning || null, capo: row.capo ?? null, key: row.key || null,
    });
    bump();
  };

  return (
    <div className="bench-book" style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10 }}>
        <div><div className="kl-eyebrow">The bench book</div><h2 className="kl-title" style={{ marginTop: 4, fontSize: 26 }}>Setlists</h2></div>
        <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
          {setlists.map((setlist) => <button key={setlist.id} onClick={() => setActiveId(setlist.id)} aria-pressed={active?.id === setlist.id}
            className="bench-btn" style={{ borderColor: active?.id === setlist.id ? C.toneUi : undefined }}>{setlist.name}</button>)}
          <button className="bench-btn" onClick={create}><Plus size={14} /> new setlist</button>
        </div>
      </div>

      {!active ? (
        <div className="faceplate" style={{ padding: 22, marginTop: 16 }}>
          <p className="kl-prose">A setlist holds the order, repeat appearances, and the notes you need on the stand.</p>
          <button className="bench-btn primary" style={{ marginTop: 12 }} onClick={create}><Plus size={14} /> Start a setlist</button>
        </div>
      ) : (
        <>
          <SetlistPaper setlist={active} searchResults={resultRows} onSearch={setQuery} onAppendSong={add}
            onOpenSong={(entry, context) => onOpen?.(entry, context)} onPerformSet={onPerformSet} onRunFrom={onRunFrom}
            onMarkPracticed={(entry) => { benchBook.logPractice({ songKey: entry.songKey, title: entry.title, artist: entry.artist || null, at: Date.now(), kind: "ran-it" }); bump(); }}
            onRename={(name) => { benchBook.renameSetlist(active.id, name); bump(); }}
            onDeleteSetlist={(id) => { benchBook.removeSetlist(id); setActiveId(null); bump(); }}
            onSetNotes={(notes) => { benchBook.setSetlistNotes(active.id, notes); bump(); }}
            onSetEntryNote={(entryId, note) => { benchBook.setEntryNote(active.id, entryId, note); bump(); }}
            onMove={(entryId, toIndex) => { benchBook.moveInSetlist(active.id, entryId, toIndex); bump(); }}
            onRemove={(entryId) => { const removed = benchBook.removeFromSetlist(active.id, entryId); if (removed) bump(); return removed; }}
            onRestore={(entry, index) => { benchBook.restoreToSetlist(active.id, entry, index); bump(); }} />

          <div className="bench-book__memory">
            <section className="faceplate" style={{ padding: 16 }}>
              <span className="kl-eyebrow">The cold shelf</span>
              {cold.length ? cold.map((entry) => (
                <div key={entry.songKey} className="flex items-center" style={{ gap: 8, marginTop: 9 }}>
                  <span style={{ minWidth: 0, flex: 1, color: C.ink }}>{entry.title}</span>
                  <span style={{ fontFamily: MONO, color: C.faint, fontSize: 11 }}>{entry.daysSince}d</span>
                  {bySongKey.get(entry.songKey) && <button className="bench-btn" onClick={() => onOpen?.(bySongKey.get(entry.songKey))}>open</button>}
                </div>
              )) : <p style={{ color: C.faint, fontSize: 13, marginTop: 8 }}>Practice something and it will return here when it goes cold.</p>}
            </section>
            <section className="faceplate" style={{ padding: 16 }}>
              <span className="kl-eyebrow">Recent passes</span>
              {log.length ? log.slice(0, 8).map((entry, index) => <div key={`${entry.at}-${index}`} className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                <span style={{ fontFamily: MONO, color: C.faint, fontSize: 11, width: 64 }}>{ago(entry.at, now)}</span><span style={{ color: C.ink, fontSize: 13 }}>{entry.title}</span>
              </div>) : <p style={{ color: C.faint, fontSize: 13, marginTop: 8 }}>Your practiced songs show up here.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
