// AddSong.jsx — the Library's fillable-fields door: add a song to YOUR
// songbook and it joins the catalog like any other artist. Records are built
// by lib/usersong.js (same tuning/capo intelligence as the corpus) and live
// in localStorage via storage.userSongbook.
import { useState } from "react";
import { X } from "lucide-react";
import { buildUserSong } from "../lib/usersong.js";
import { userSongbook } from "../storage.js";
import { TUNINGS } from "../lib/tuning.js";
import { C, MONO } from "../ui/theme.js";

const field = {
  width: "100%", padding: "9px 12px", fontFamily: "var(--kl-sans)", fontSize: 14,
  color: C.ink, background: C.panel2, border: `1px solid ${C.line}`,
  borderRadius: 10, outline: "none",
};
const label = { display: "block", marginBottom: 4 };

export default function AddSong({ onSaved, onClose }) {
  const [f, setF] = useState({ artist: "", title: "", album: "", key: "", capo: "", tuning: "", body: "" });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = () => {
    const built = buildUserSong(f, Date.now());
    if (built.error) { setError(built.error); return; }
    try { userSongbook.save(built.song, built.row); }
    catch { setError("Storage is full — the song wasn't saved. Export a backup, clear space, and try again."); return; }
    onSaved?.(built.song);
  };

  return (
    <div className="faceplate kl-rise" style={{ margin: "14px 0 18px", padding: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span className="kl-eyebrow">Add a song to your songbook</span>
        <button onClick={onClose} aria-label="close"
          style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer" }}><X size={16} /></button>
      </div>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <span className="kl-eyebrow" style={label}>Artist *</span>
          <input style={field} value={f.artist} onChange={set("artist")} placeholder="Buck Meek" aria-label="artist" />
        </div>
        <div>
          <span className="kl-eyebrow" style={label}>Title *</span>
          <input style={field} value={f.title} onChange={set("title")} placeholder="Candle" aria-label="title" />
        </div>
      </div>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 12, marginTop: 12 }}>
        <div>
          <span className="kl-eyebrow" style={label}>Album</span>
          <input style={field} value={f.album} onChange={set("album")} placeholder="optional" aria-label="album" />
        </div>
        <div>
          <span className="kl-eyebrow" style={label}>Key</span>
          <input style={field} value={f.key} onChange={set("key")} placeholder="G" aria-label="key" />
        </div>
        <div>
          <span className="kl-eyebrow" style={label}>Capo</span>
          <input style={field} value={f.capo} onChange={set("capo")} placeholder="0" inputMode="numeric" aria-label="capo" />
        </div>
        <div>
          <span className="kl-eyebrow" style={label}>Tuning</span>
          <input style={field} list="kl-tunings" value={f.tuning} onChange={set("tuning")}
            placeholder="auto from the sheet" aria-label="tuning" />
          <datalist id="kl-tunings">
            {Object.values(TUNINGS).map((t) => <option key={t.id} value={t.name} />)}
          </datalist>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="kl-eyebrow" style={label}>Chords or tab *</span>
        <textarea value={f.body} onChange={set("body")} spellCheck={false}
          placeholder={"[Verse]\nG        C\npaste the chart or 6-line tab here…"}
          aria-label="chart or tab"
          style={{ ...field, fontFamily: MONO, fontSize: 13, lineHeight: 1.55, minHeight: 180, resize: "vertical" }} />
        <p style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>
          Capo and tuning are read from the sheet itself when you leave them blank — "Capo 3", "Tuning: 1 step down", or the tab's string labels all count.
        </p>
      </div>

      {error && <p style={{ color: C.bassText, fontSize: 13, marginTop: 8 }}>{error}</p>}

      <div className="flex items-center" style={{ gap: 10, marginTop: 12 }}>
        <button className="bench-btn primary" onClick={save}>Add to library</button>
        <button className="bench-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
