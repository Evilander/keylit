// AddToSetlist.jsx — "put it on tonight's bench" from the Song room itself.
// One button next to Pass-the-chart: no lists yet → creates "Tonight" and adds
// in one move; one list → adds straight to it; several → a small menu picks
// the target (lists already holding the song show a check). Entries reuse the
// exact record shape Library/BenchBook write, so the Practice room resolves
// them the same way.
import { useEffect, useRef, useState } from "react";
import { ListMusic, Check, Plus } from "lucide-react";
import { benchBook } from "../storage.js";
import { slugSongKey } from "../lib/bench.js";
import { C } from "../ui/theme.js";

export default function AddToSetlist({ song }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(null); // name of the list just added to
  const wrapRef = useRef(null);

  const songKey = slugSongKey(song.artist, song.title);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(id);
  }, [flash]);

  const addTo = (sl) => {
    benchBook.addToSetlist(sl.id, {
      songKey, title: song.title, artist: song.artist || null,
      source: song.source, id: song.id,
      tuning: song.tuning || null, capo: song.capo || null, key: song.key || null,
    });
    setOpen(false);
    setFlash(sl.name);
  };

  const click = () => {
    if (flash) return;
    const lists = benchBook.setlists();
    if (lists.length === 0) addTo(benchBook.createSetlist("Tonight", Date.now()));
    else if (lists.length === 1) addTo(lists[0]);
    else setOpen((o) => !o);
  };

  const lists = open ? benchBook.setlists() : [];
  const itemStyle = {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    padding: "6px 10px", background: "transparent", border: 0, borderRadius: 7,
    color: C.ink, fontSize: 13, textAlign: "left", cursor: "pointer",
  };

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button className="bench-btn" onClick={click} aria-haspopup="menu" aria-expanded={open}
        title="put this song on a setlist — tonight's plan lives in the Practice room">
        {flash
          ? <><Check size={14} /> on {flash}</>
          : <><ListMusic size={14} /> Add to setlist</>}
      </button>
      {open && (
        <div role="menu" aria-label="choose a setlist" className="kl-rise" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
          minWidth: 190, padding: 5, background: C.panel,
          border: `1px solid ${C.line}`, borderRadius: 10,
          boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
        }}>
          {lists.map((sl) => {
            const on = sl.songs.some((s) => s.songKey === songKey);
            return (
              <button key={sl.id} role="menuitem" className="kl-menu-item" style={itemStyle} onClick={() => addTo(sl)}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sl.name}</span>
                {on && <Check size={13} style={{ color: C.toneText, flexShrink: 0 }} />}
              </button>
            );
          })}
          <button role="menuitem" className="kl-menu-item" style={{ ...itemStyle, color: C.muted }}
            onClick={() => addTo(benchBook.createSetlist("Tonight", Date.now()))}>
            <Plus size={13} style={{ flexShrink: 0 }} /> new setlist
          </button>
        </div>
      )}
    </span>
  );
}
