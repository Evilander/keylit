import React, { useState } from "react";
import { Wand2, Save, FolderOpen, Download, Trash2, ClipboardPaste, Cable } from "lucide-react";
import { generateProgression, GEN_STYLES } from "../lib/generate.js";
import { midiBlob } from "../lib/midi.js";
import { spellPc } from "../lib/spelling.js";
import { library } from "../storage.js";
import { C, MONO } from "../ui/theme.js";

/**
 * SongTools — the go-to-app hub: spark a new progression, save/load songs,
 * export MIDI. Sits at the top as a utility bar.
 *
 * Props:
 *  activeKey        : { tonic, mode }
 *  sheet            : current chord-sheet text (for Save)
 *  voicings         : number[][] current chord voicings (for MIDI export)
 *  tempoMs          : playback tempo (ms/chord) — used to set MIDI tempo
 *  onLoadProgression: (chords) => void   — load a generated progression
 *  onLoadSheet      : (sheet) => void     — load a saved song's sheet
 *  nowStamp         : () => number        — monotonic-ish timestamp for ids
 */
export default function SongTools({ activeKey, sheet, voicings, tempoMs = 1500, onImport, onLoadProgression, onLoadSheet, nowStamp,
  midiSupported, midiOutputs = [], midiOutId = "", onPickMidiOut, onRefreshMidi }) {
  const [style, setStyle] = useState("pop");
  const [genMode, setGenMode] = useState(activeKey.mode || "major");
  const [sevenths, setSevenths] = useState(false);
  const [name, setName] = useState("");
  const [songs, setSongs] = useState(() => library.list());
  const [note, setNote] = useState("");

  const spark = () => {
    const tonic = activeKey.tonic ?? 0;
    const { chords, name: tplName } = generateProgression({ tonic, mode: genMode, style, seventhsBias: sevenths });
    onLoadProgression(chords);
    setNote(`${spellPc(tonic, { tonic, mode: genMode })} ${genMode} · ${tplName}`);
  };

  const save = () => {
    const stamp = nowStamp ? nowStamp() : songs.length + 1;
    const song = library.save({ name: name.trim() || "Untitled", sheet, savedAt: stamp });
    setSongs(library.list());
    setNote(`Saved "${song.name}"`);
  };

  const load = (id) => {
    const s = library.get(id);
    if (s) { onLoadSheet(s.sheet); setNote(`Loaded "${s.name}"`); }
  };

  const del = (id) => { library.remove(id); setSongs(library.list()); };

  const exportMidi = () => {
    const useful = (voicings || []).filter((v) => v && v.length);
    if (!useful.length) { setNote("Nothing to export yet"); return; }
    const beatsPerChord = 2;
    const tempoBpm = Math.max(40, Math.min(220, Math.round((60000 / tempoMs) * beatsPerChord)));
    const blob = midiBlob(useful, { tempoBpm, beatsPerChord });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name.trim() || "keylit-progression").replace(/[^a-z0-9]+/gi, "-")}.mid`;
    a.click();
    URL.revokeObjectURL(url);
    setNote("Exported .mid");
  };

  return (
    <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      {/* Import — jumps to the paste box */}
      <button onClick={onImport} style={{ ...primary, background: C.tone }} title="Paste a chord sheet (Ultimate-Guitar, ChordPro, or plain text)">
        <ClipboardPaste size={14} /> Import chords
      </button>
      <div style={{ width: 1, height: 24, background: C.line }} />

      {/* Spark */}
      <div className="flex items-center" style={{ gap: 7 }}>
        <select value={style} onChange={(e) => setStyle(e.target.value)} style={sel} aria-label="style">
          {GEN_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={genMode} onChange={(e) => setGenMode(e.target.value)} style={sel} aria-label="mode">
          <option value="major">major</option>
          <option value="minor">minor</option>
        </select>
        <label style={{ fontSize: 11, color: C.muted, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} /> 7ths
        </label>
        <button onClick={spark} style={primary}><Wand2 size={14} /> Spark</button>
      </div>

      <div style={{ width: 1, height: 24, background: C.line }} />

      {/* Save / Library */}
      <div className="flex items-center" style={{ gap: 7 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="song name"
          style={{ ...sel, width: 130 }} aria-label="song name" />
        <button onClick={save} style={ghost}><Save size={14} /> Save</button>
        {songs.length > 0 && (
          <div className="flex items-center" style={{ gap: 4 }}>
            <FolderOpen size={14} color={C.faint} />
            <select onChange={(e) => e.target.value && load(e.target.value)} value="" style={sel} aria-label="open saved song">
              <option value="">Library ({songs.length})</option>
              {songs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {songs[0] && <button onClick={() => del(songs[0].id)} title={`Delete "${songs[0].name}"`} style={{ ...ghost, padding: "6px 8px" }}><Trash2 size={13} /></button>}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: C.line }} />

      <button onClick={exportMidi} style={ghost}><Download size={14} /> Export MIDI</button>

      {/* Web MIDI out — drive a DAW/VST live */}
      {midiSupported ? (
        <div className="flex items-center" style={{ gap: 6 }}>
          <Cable size={14} color={midiOutId ? C.tone : C.faint} />
          <select value={midiOutId} onFocus={onRefreshMidi}
            onChange={(e) => onPickMidiOut(e.target.value)} style={sel} aria-label="MIDI output"
            title="Send chords live to a DAW/VST via a MIDI port">
            <option value="">MIDI out: off</option>
            {midiOutputs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: C.faint }} title="Web MIDI needs Chrome/Edge">MIDI out: browser N/A</span>
      )}

      {note && <span style={{ fontSize: 11.5, color: C.tone, fontFamily: MONO }}>{note}</span>}
    </div>
  );
}

const sel = {
  background: "#2a241e", color: "#ece6dd", border: "1px solid #3a322a",
  borderRadius: 7, padding: "5px 7px", fontSize: 12.5, cursor: "pointer",
};
const ghost = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "transparent",
  color: "#ece6dd", border: "1px solid #322b24", borderRadius: 8, padding: "6px 11px",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};
const primary = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "#b48ef0",
  color: "#1c1305", border: "none", borderRadius: 8, padding: "6px 13px",
  fontSize: 12.5, fontWeight: 700, cursor: "pointer",
};
