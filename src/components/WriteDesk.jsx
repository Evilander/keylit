// WriteDesk.jsx — the Write room, rebuilt on Jeff Tweedy's How to Write One
// Song (mined from Tyler's own copy, 2026-07-15). The old SongTools bar
// crammed five jobs into one strip; the desk lays them out the way the book
// does — his actual daily practice: stockpile WORDS, stockpile MUSIC, PAIR
// them — plus the One Song Timer, the exercises, sketches that keep words
// and chords together, and a quiet corner for the DAW plumbing.
// Quoted lines are verbatim from the book and marked; everything else is
// paraphrase.
import { useEffect, useMemo, useRef, useState } from "react";
import { Wand2, Save, Trash2, Download, Cable, ClipboardPaste, Timer, Shuffle, ChevronDown, RotateCcw } from "lucide-react";
import { generateProgression, GEN_STYLES } from "../lib/generate.js";
import { parseSheet } from "../lib/theory.js";
import { midiBlob } from "../lib/midi.js";
import { spellPc } from "../lib/spelling.js";
import { library } from "../storage.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";
import PocketRecorder from "./PocketRecorder.jsx";

const PAD_KEY = "keylit.write.pad.v1";
const loadPad = () => { try { return localStorage.getItem(PAD_KEY) || ""; } catch { return ""; } };

// The book's exercises, tightened for cards. Quotes verbatim.
const EXERCISES = [
  {
    name: "Word ladder", time: "10–15 min",
    steps: ["Pick a subject. Write 10 verbs that belong to it.", "Write 10 nouns you can see from your chair.", "Pair verbs with nouns that DON'T go together.", "Write a short nonsense poem from the pairs — meaning comes later."],
    note: "Use the pad and the dealer on this desk.",
  },
  {
    name: "Steal words from a book", time: "ongoing",
    steps: ["Hum a melody — yours or anyone's — and keep humming.", "Open any book to a random page and skim, not read.", "Write down every word that jumps at the melody's rhythm.", "Over-collect. Come back after the melody fades and keep what's still alive."],
  },
  {
    name: "Cut-ups", time: "15 min",
    steps: ["Print or copy something you already wrote, double-spaced.", "Cut it into lines or phrases.", "Reorder by pull from a hat, or by feel.", "The cheap version that works: move the LAST line of a verse to the front."],
  },
  {
    name: "Have a conversation", time: "a day",
    steps: ["Ask someone easy to talk to to interrogate you about your life. Record it.", "Let time pass. Transcribe your side only.", "Mark the phrases with unpremeditated honesty.", "Arrange the marked lines into a verse — first pass adds no words at all."],
  },
  {
    name: "Playing with rhymes", time: "standing habit",
    steps: ["Write freestanding couplets attached to nothing, like crossword clues.", "Ban the telegraphed rhyme — his named enemy is train/rain."],
  },
  {
    name: "Don't be yourself", time: "one lyric",
    steps: ["Write the whole lyric as someone or something else — Johnny Cash, an insect, the kitchen table.", "Use the distance to say what you can't say straight."],
  },
];

const FINISHING = [
  ["Start in the wrong place", "invert the instinct — start from the weakest part, play the progression in reverse, play the quiet song loud."],
  ["Start in the right place", "“a good first line is the most determining factor in whether a song I've written sees the light of day.” Find the line you love; make it line one."],
  ["Put it away", "sleep on the stuck song and work on another. The counter-move is also real: sometimes sit in the discomfort and push through."],
  ["Mumble tracks", "sing nonsense that fits the melody's vowels, then “translate” it on relisten — “it starts feeling almost like you're translating from another language.”"],
];

export default function WriteDesk({
  activeKey, sheet, voicings, tempoMs = 1500,
  onImport, onLoadProgression, onLoadSheet, onPlay, nowStamp,
  midiSupported, midiOutputs = [], midiOutId = "", onPickMidiOut, onRefreshMidi,
}) {
  /* ---- the one song timer ---- */
  const [mins, setMins] = useState(10);
  const [endsAt, setEndsAt] = useState(null);
  const [left, setLeft] = useState(0);
  const [rang, setRang] = useState(false);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(id);
        setEndsAt(null);
        setRang(true);
        // three rising piano pings — the bell on the desk
        [76, 83, 88].forEach((m, i) => setTimeout(() => onPlay?.([m], 0.5), i * 260));
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt, onPlay]);

  /* ---- words: the pad + the ladder dealer ---- */
  const [pad, setPad] = useState(loadPad);
  const savePad = (v) => { setPad(v); try { localStorage.setItem(PAD_KEY, v); } catch { /* noop */ } };
  const [verbs, setVerbs] = useState("");
  const [nouns, setNouns] = useState("");
  const [pairs, setPairs] = useState([]);
  const deal = () => {
    const vs = verbs.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const ns = nouns.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!vs.length || !ns.length) return;
    const out = [];
    const used = new Set();
    for (let i = 0; i < Math.min(5, vs.length, ns.length); i++) {
      let v = vs[Math.floor(Math.random() * vs.length)];
      let n = ns[Math.floor(Math.random() * ns.length)];
      const k = `${v}|${n}`;
      if (used.has(k)) { i--; if (used.size > vs.length * ns.length - 2) break; continue; }
      used.add(k);
      out.push(`${v} the ${n}`);
    }
    setPairs(out);
  };

  /* ---- music: spark + judgment looseners ---- */
  const [style, setStyle] = useState("pop");
  const [genMode, setGenMode] = useState(activeKey.mode || "major");
  const [sevenths, setSevenths] = useState(false);
  const [note, setNote] = useState("");
  const spark = () => {
    const tonic = activeKey.tonic ?? 0;
    const { chords, name: tplName } = generateProgression({ tonic, mode: genMode, style, seventhsBias: sevenths });
    onLoadProgression(chords);
    setNote(`${spellPc(tonic, { tonic, mode: genMode })} ${genMode} · ${tplName} — it's on the rail below`);
  };
  const reverse = () => {
    const { progression } = parseSheet(sheet);
    if (progression.length < 2) { setNote("nothing on the stand to reverse"); return; }
    onLoadProgression(progression.slice().reverse());
    setNote("progression reversed — familiar chords, wrong order, new song");
  };

  /* ---- sketches: words + chords saved together ---- */
  const [name, setName] = useState("");
  const [songs, setSongs] = useState(() => library.list());
  const saveSketch = () => {
    const stamp = nowStamp ? nowStamp() : songs.length + 1;
    const song = library.save({ name: name.trim() || "Untitled", sheet, lyrics: pad, savedAt: stamp });
    setSongs(library.list());
    setNote(`kept "${song.name}" — chords and words together`);
  };
  const loadSketch = (id) => {
    const s = library.get(id);
    if (!s) return;
    onLoadSheet(s.sheet);
    if (s.lyrics) savePad(s.lyrics);
    setNote(`opened "${s.name}"`);
  };
  const delSketch = (id) => { library.remove(id); setSongs(library.list()); };

  /* ---- the daw corner ---- */
  const exportMidi = () => {
    const useful = (voicings || []).filter((v) => v && v.length);
    if (!useful.length) { setNote("nothing to export yet"); return; }
    const beatsPerChord = 2;
    const tempoBpm = Math.max(40, Math.min(220, Math.round((60000 / tempoMs) * beatsPerChord)));
    const blob = midiBlob(useful, { tempoBpm, beatsPerChord });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name.trim() || "keylit-sketch").replace(/[^a-z0-9]+/gi, "-")}.mid`;
    a.click();
    URL.revokeObjectURL(url);
    setNote("exported .mid");
  };

  const [exOpen, setExOpen] = useState(false);
  const card = { padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 };
  const stationTitle = (n, t) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.rootText, fontWeight: 700 }}>{n}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink }}>{t}</span>
    </div>
  );

  return (
    <div>
      {/* ---- the timer: the book's sharpest tool ---- */}
      <div className="faceplate hero" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <Timer size={18} style={{ color: C.rootText, flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink }}>The one song timer</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
            Whatever exists when it rings <i>counts as a song</i>. No exceptions, no judgment — then record it before the feeling leaves.
          </div>
        </div>
        {endsAt ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: C.rootText }}>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
            <button className="bench-btn" onClick={() => { setEndsAt(null); setRang(false); }}>give up honorably</button>
          </>
        ) : rang ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.toneText }}>That's ONE song. Record it ↓</span>
            <button className="bench-btn" onClick={() => setRang(false)}>again</button>
          </>
        ) : (
          <>
            <div className="kl-seg" role="radiogroup" aria-label="timer length">
              {[5, 10, 15].map((m) => (
                <button key={m} role="radio" aria-checked={mins === m} onClick={() => setMins(m)}>{m}m</button>
              ))}
            </div>
            <button className="bench-btn primary" onClick={() => { setRang(false); setEndsAt(Date.now() + mins * 60000); setLeft(mins * 60); }}>
              Write one song
            </button>
          </>
        )}
      </div>

      {/* ---- the daily desk: words · music · pair ---- */}
      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14, alignItems: "start" }}>
        <div className="faceplate" style={card}>
          {stationTitle("01", "Stockpile words")}
          <textarea value={pad} onChange={(e) => savePad(e.target.value)} spellCheck={false}
            placeholder={"the pad keeps itself — lines, fragments, overheard things.\nnothing here has to be good."}
            aria-label="lyric pad"
            style={{ width: "100%", minHeight: 150, resize: "vertical", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontFamily: "var(--kl-sans)", fontSize: 13.5, lineHeight: 1.55, outline: "none" }} />
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
            <div className="kl-eyebrow" style={{ marginBottom: 6 }}>The word ladder</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <textarea value={verbs} onChange={(e) => setVerbs(e.target.value)} placeholder={"verbs\none per line"} aria-label="verbs"
                style={{ minHeight: 84, resize: "vertical", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px", fontSize: 12.5, fontFamily: "var(--kl-sans)", outline: "none" }} />
              <textarea value={nouns} onChange={(e) => setNouns(e.target.value)} placeholder={"nouns you can see\none per line"} aria-label="nouns"
                style={{ minHeight: 84, resize: "vertical", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px", fontSize: 12.5, fontFamily: "var(--kl-sans)", outline: "none" }} />
            </div>
            <button className="bench-btn" style={{ marginTop: 8, padding: "6px 13px", fontSize: 12.5 }} onClick={deal}>
              <Shuffle size={13} /> deal wrong pairs
            </button>
            {pairs.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {pairs.map((p, i) => (
                  <button key={i} onClick={() => savePad(pad ? `${pad}\n${p}` : p)} title="add to the pad"
                    style={{ textAlign: "left", background: "transparent", border: 0, cursor: "pointer", fontFamily: DISPLAY, fontSize: 15, color: C.ink, padding: "2px 0" }}>
                    {p}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: C.faint }}>click a pair to keep it on the pad</span>
              </div>
            )}
          </div>
        </div>

        <div className="faceplate" style={card}>
          {stationTitle("02", "Stockpile music")}
          <div className="flex items-center" style={{ gap: 7, flexWrap: "wrap" }}>
            <select value={style} onChange={(e) => setStyle(e.target.value)} style={sel} aria-label="spark style">
              {GEN_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={genMode} onChange={(e) => setGenMode(e.target.value)} style={sel} aria-label="spark mode">
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
            <label style={{ fontSize: 11.5, color: C.muted, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} /> 7ths
            </label>
            <button className="bench-btn primary" style={{ padding: "7px 14px", fontSize: 12.5 }} onClick={spark}><Wand2 size={13} /> Spark</button>
          </div>
          <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.55 }}>
            A progression seed in your key — it lands on the rail below, where the Lab can bend it.
          </p>
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
            <div className="kl-eyebrow" style={{ marginBottom: 6 }}>Loosen your judgment</div>
            <button className="bench-btn" style={{ padding: "6px 13px", fontSize: 12.5 }} onClick={reverse}>
              <RotateCcw size={13} /> reverse the progression
            </button>
            <p style={{ fontSize: 12, color: C.faint, margin: "8px 0 0", lineHeight: 1.55 }}>
              Or retune the guitar to something you don't know, or write on the instrument you're worst at.
              Being willing to sound bad is the skill.
            </p>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
            <div className="kl-eyebrow" style={{ marginBottom: 6 }}>Steal like a songwriter</div>
            <p style={{ fontSize: 12, color: C.faint, margin: 0, lineHeight: 1.55 }}>
              Learn a song you love in the Library, hum a NEW melody over its changes, and come back
              after the original fades. Credit anything you keep unchanged.
            </p>
          </div>
        </div>

        <div className="faceplate" style={card}>
          {stationTitle("03", "Pair them")}
          <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.55 }}>
            Sing the pad over whatever's on the rail. No words ready? Mumble vowels that fit, then
            “translate” what you hear back — the melody knows before you do.
          </p>
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
            <PocketRecorder />
          </div>
        </div>
      </div>

      {/* ---- sketches: keep words and chords in one drawer ---- */}
      <div className="flex items-center" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="sketch name" aria-label="sketch name"
          style={{ ...sel, width: 160, cursor: "text" }} />
        <button className="bench-btn" style={{ padding: "7px 14px", fontSize: 12.5 }} onClick={saveSketch}><Save size={13} /> Keep sketch</button>
        {songs.length > 0 && songs.map((s) => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1.5px solid ${C.line}`, borderRadius: 999, padding: "5px 7px 5px 13px" }}>
            <button onClick={() => loadSketch(s.id)} style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.ink, padding: 0 }}
              title={s.lyrics ? "chords + words" : "chords"}>
              {s.name}
            </button>
            <button onClick={() => delSketch(s.id)} aria-label={`delete sketch ${s.name}`}
              style={{ background: "transparent", border: 0, cursor: "pointer", color: C.faint, display: "inline-flex", padding: 2 }}><Trash2 size={12} /></button>
          </span>
        ))}
        {note && <span style={{ fontSize: 12, color: C.toneText, fontFamily: MONO }}>{note}</span>}
      </div>

      {/* ---- the exercises, from the book ---- */}
      <section style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <button onClick={() => setExOpen((v) => !v)} aria-expanded={exOpen}
          style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: 0, cursor: "pointer", padding: 0 }}>
          <ChevronDown size={15} style={{ color: C.faint, transform: exOpen ? "none" : "rotate(-90deg)", transition: "transform 160ms ease" }} />
          <span className="kl-eyebrow">The exercises · from How to Write One Song</span>
        </button>
        {exOpen && (
          <div style={{ marginTop: 12 }}>
            <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
              {EXERCISES.map((ex) => (
                <div key={ex.name} className="faceplate" style={{ padding: "13px 15px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 16, color: C.ink }}>{ex.name}</span>
                    <span className="kl-meta" style={{ color: C.faint }}>{ex.time}</span>
                  </div>
                  <ol style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    {ex.steps.map((s, i) => <li key={i} style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{s}</li>)}
                  </ol>
                  {ex.note && <p style={{ fontSize: 11.5, color: C.rootText, margin: "8px 0 0" }}>{ex.note}</p>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="kl-eyebrow" style={{ marginBottom: 6 }}>When you're stuck</div>
              {FINISHING.map(([t, d]) => (
                <div key={t} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.line}`, alignItems: "baseline" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 14.5, color: C.ink, whiteSpace: "nowrap" }}>{t}</span>
                  <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---- the quiet corner: plumbing to the DAW ---- */}
      <div className="flex items-center" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={onImport} style={quiet} title="paste a chord sheet or tab"><ClipboardPaste size={13} /> import chords</button>
        <button onClick={exportMidi} style={quiet}><Download size={13} /> export .mid</button>
        {midiSupported ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Cable size={13} color={midiOutId ? C.toneText : C.faint} />
            <select value={midiOutId} onFocus={onRefreshMidi} onChange={(e) => onPickMidiOut(e.target.value)} style={sel} aria-label="MIDI output"
              title="send chords live to a DAW/VST">
              <option value="">MIDI out: off</option>
              {midiOutputs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: C.faint }}>MIDI out needs Chrome/Edge</span>
        )}
      </div>
    </div>
  );
}

const sel = {
  background: "var(--kl-sunken)", color: "var(--kl-ink)", border: "1px solid var(--kl-hair)",
  borderRadius: 8, padding: "6px 9px", fontSize: 12.5, cursor: "pointer", fontFamily: "var(--kl-sans)",
};
const quiet = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "transparent",
  color: "var(--kl-muted)", border: 0, padding: "4px 2px", fontSize: 12.5, cursor: "pointer",
};
