import { useEffect, useState } from "react";
import { Cable, ClipboardPaste, Download, Feather, Minimize2, RotateCcw, Save, Shuffle, Timer, Trash2, Wand2 } from "lucide-react";
import { createDraft, adaptLegacySketch } from "../lib/composition.js";
import { generateProgression, GEN_STYLES } from "../lib/generate.js";
import { chordSymbol, SHARP_NAMES } from "../lib/theory.js";
import { midiBlob } from "../lib/midi.js";
import { EXERCISES } from "../lib/onesong.js";
import { draftBook, onesongBook } from "../storage.js";
import ProgressionComposer from "./ProgressionComposer.jsx";
import HumHarmony from "./HumHarmony.jsx";
import PocketRecorder from "./PocketRecorder.jsx";

// Exported so the One Song room can light this clock and walk the player in.
export const TIMER_KEY = "keylit.write.timer.v1";
let writeId = 0;
const freshId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(++writeId).toString(36)}`;

// The One Song bench day lights for real work, and a tally failure must
// never interrupt the work itself.
const markBenchDay = (what) => { try { onesongBook.markDay(what); } catch { /* tally optional */ } };

function makeProgressionDraft(current, chords, name, nowStamp) {
  return createDraft({
    ...current,
    name: current?.name || name || "Untitled",
    key: current?.key,
    savedAt: current?.savedAt || 0,
    sections: [{
      id: freshId("section"),
      name: name || "Section",
      chords: chords.map((chord) => ({ id: freshId("chord"), symbol: typeof chord === "string" ? chord : chordSymbol(chord) })),
    }],
    lyrics: current?.lyrics || "",
    _stamp: nowStamp,
  });
}

export default function WriteDesk({
  draft,
  selection,
  spelling = "sharps",
  book = draftBook,
  activeKey = draft?.key || { tonic: 0, mode: "major" },
  voicings = [],
  tempoMs = 1500,
  revision = 0,
  canUndo = false,
  onEdit,
  onUndo,
  onSelect,
  onReplaceDraft,
  onImport,
  onPlay,
  onAudition,
  requestDeep,
  nowStamp = () => Date.now(),
  midiSupported,
  midiOutputs = [],
  midiOutId = "",
  onPickMidiOut,
  onRefreshMidi,
  initialFocus = false,
}) {
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(() => book.list());
  const [legacy, setLegacy] = useState(() => book.legacy?.() || []);
  const [style, setStyle] = useState("pop");
  const [sevenths, setSevenths] = useState(false);
  const [mins, setMins] = useState(10);
  const [endsAt, setEndsAtState] = useState(() => {
    try {
      const value = Number(localStorage.getItem(TIMER_KEY) || 0);
      return value > Date.now() ? value : null;
    } catch { return null; }
  });
  const [left, setLeft] = useState(() => endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : 0);
  const [verbs, setVerbs] = useState("");
  const [nouns, setNouns] = useState("");
  const [pairs, setPairs] = useState([]);
  const [focus, setFocus] = useState(initialFocus);

  const setEndsAt = (value) => {
    setEndsAtState(value);
    try { value ? localStorage.setItem(TIMER_KEY, String(value)) : localStorage.removeItem(TIMER_KEY); } catch { /* optional */ }
  };

  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = () => {
      const seconds = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(seconds);
      if (!seconds) {
        setEndsAt(null);
        [76, 83, 88].forEach((midi, index) => setTimeout(() => onPlay?.([midi], 0.45), index * 240));
      }
    };
    const timer = setInterval(tick, 250);
    tick();
    return () => clearInterval(timer);
  }, [endsAt, onPlay]);

  const selectedSectionId = selection?.sectionId || draft.sections[0]?.id;
  const selectedSection = draft.sections.find((section) => section.id === selectedSectionId) || draft.sections[0];
  const clock = endsAt ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : null;
  const startTimer = () => { markBenchDay("timer"); onPlay?.([], 0); setLeft(mins * 60); setEndsAt(Date.now() + mins * 60000); };
  // Nothing written yet — used to lead with the invitation instead of a blank grid.
  const blank = !draft.lyrics?.trim() && draft.sections.every((s) => !s.chords.length);

  const spark = () => {
    const seed = generateProgression({ tonic: draft.key.tonic, mode: draft.key.mode, style, seventhsBias: sevenths });
    onReplaceDraft?.(makeProgressionDraft(draft, seed.chords, seed.name, nowStamp()), { historyMode: "push" });
    setNotice(`${seed.name} is on the desk. Keep it, bend it, or throw it away.`);
  };

  const newSketch = () => {
    const next = createDraft({
      id: `draft-${globalThis.crypto?.randomUUID?.() || freshId("new")}`,
      name: "Untitled",
      key: draft.key,
      sections: [{ id: freshId("section"), name: "Verse", chords: [] }],
      lyrics: "",
    });
    onReplaceDraft?.(next, { historyMode: "push" });
    setNotice("New sketch. Undo restores the writing you just left; kept sketches stay saved.");
  };

  const saveDraft = () => {
    const next = { ...draft, savedAt: nowStamp() };
    try { book.save(next); }
    catch (error) { setNotice(`${error?.message || "Storage refused the save"}. The sketch was not kept. Download draft JSON before closing; library backups do not include Write drafts or memos. Do not clear app data.`); return; }
    markBenchDay("kept");
    setSaved(book.list());
    setNotice(`Kept “${next.name}” with its exact sections, repeats, and words.`);
  };

  const openDraft = (id) => {
    const next = book.get(id);
    if (!next) return;
    onReplaceDraft?.(next, { historyMode: "reset" });
    setNotice(`Opened “${next.name}”.`);
  };

  const openLegacy = (item) => {
    const next = adaptLegacySketch(item);
    onReplaceDraft?.(next, { historyMode: "reset" });
    setNotice(`Recovered “${next.name}” without deleting the old sketch.`);
  };

  const removeDraft = (id) => {
    try { book.remove(id); } catch (error) { setNotice(error.message || "Could not delete the sketch; stored data was preserved."); return; }
    setSaved(book.list());
  };

  const downloadDraft = () => {
    const blob = new Blob([JSON.stringify({ version: 2, drafts: [draft] }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "keylit-write-draft.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Downloaded this draft as JSON, including sections and words. Keep this recovery file; Library import does not restore Write drafts.");
  };

  const exportMidi = () => {
    const useful = voicings.filter((voicing) => Array.isArray(voicing) && voicing.length);
    if (!useful.length) { setNotice("Add a chord before exporting MIDI."); return; }
    const beatsPerChord = 2;
    const tempoBpm = Math.max(40, Math.min(220, Math.round((60000 / tempoMs) * beatsPerChord)));
    const url = URL.createObjectURL(midiBlob(useful, { tempoBpm, beatsPerChord }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.name.replace(/[^a-z0-9]+/gi, "-") || "keylit-draft"}.mid`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Exported the exact visible progression as MIDI.");
  };

  const dealPairs = () => {
    const leftWords = verbs.split(/\n+/).map((word) => word.trim()).filter(Boolean);
    const rightWords = nouns.split(/\n+/).map((word) => word.trim()).filter(Boolean);
    const count = Math.min(5, leftWords.length, rightWords.length);
    setPairs(Array.from({ length: count }, (_, index) => `${leftWords[index]} the ${rightWords[(index + 1) % rightWords.length]}`));
  };

  const commitHum = ({ symbols, placement }) => {
    if (!symbols?.length) return;
    const sections = draft.sections.map((section) => {
      if (section.id !== selectedSection.id) return section;
      const added = symbols.map((symbol) => ({ id: freshId("chord"), symbol }));
      return { ...section, chords: placement === "replace" ? added : [...section.chords, ...added] };
    });
    onReplaceDraft?.(createDraft({ ...draft, sections }), { historyMode: "push" });
  };

  // Focus mode — Tweedy distilled: the desk gets out of the way and leaves the
  // countdown and the words. Everything else waits until the ring.
  if (focus) {
    return (
      <div className="write-desk write-focus">
        <div className="write-focus-bar">
          {endsAt
            ? <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b>
            : <span className="kl-meta">no clock — just the words</span>}
          <button className="bench-btn" onClick={() => setFocus(false)}><Minimize2 size={13} /> Back to the desk</button>
        </div>
        <textarea className="write-focus-pad" autoFocus aria-label="Lyric pad"
          value={draft.lyrics} onChange={(event) => onEdit?.({ type: "draft/lyrics", lyrics: event.target.value })}
          placeholder="Lines, fragments, overheard things. Nothing here has to be good yet." />
      </div>
    );
  }

  return (
    <div className="write-desk">
      {/* the ritual strip: one slim line — the clock on the left, the escape
          hatch on the right. It starts the session; it doesn't headline it. */}
      <div className="write-timer">
        <Timer size={15} />
        <strong>One song timer</strong>
        <span className="write-timer-sub">whatever exists when it rings counts</span>
        {endsAt ? (
          <><b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b><button className="bench-btn" onClick={() => setEndsAt(null)}>Stop</button></>
        ) : (
          <><div className="kl-seg">{[5, 10, 15].map((value) => <button key={value} aria-pressed={mins === value} onClick={() => setMins(value)}>{value}m</button>)}</div><button className="bench-btn primary" onClick={startTimer}>Write one song</button></>
        )}
        <button className="bench-btn write-focus-btn" title="hide everything but the words" onClick={() => setFocus(true)}>
          <Feather size={13} /> Focus
        </button>
      </div>

      <div className="write-draft-bar">
        <label>Draft name<input value={draft.name} onChange={(event) => onEdit?.({ type: "draft/name", name: event.target.value })} /></label>
        <label>Key<select value={draft.key.tonic} onChange={(event) => onEdit?.({ type: "draft/key", key: { ...draft.key, tonic: Number(event.target.value) } })}>{SHARP_NAMES.map((name, tonic) => <option key={name} value={tonic}>{name}</option>)}</select></label>
        <label>Mode<select value={draft.key.mode} onChange={(event) => onEdit?.({ type: "draft/key", key: { ...draft.key, mode: event.target.value } })}><option value="major">major</option><option value="minor">minor</option></select></label>
        <button className="bench-btn" onClick={newSketch} disabled={!onReplaceDraft}>New sketch</button>
        <button className="bench-btn" onClick={saveDraft}><Save size={13} /> Keep sketch</button>
        <button className="bench-btn" onClick={downloadDraft}>Download draft JSON</button>
        <span role="status">{notice}</span>
      </div>

      <ProgressionComposer
        draft={draft}
        selection={selection}
        spelling={spelling}
        documentId={draft.id}
        revision={revision}
        canUndo={canUndo}
        onEdit={onEdit}
        onUndo={onUndo}
        onSelect={onSelect}
        onAudition={onAudition}
        requestDeep={requestDeep}
      />

      {/* a quiet toolbar under the composer, not a rival headline — the desk
          has one voice and these are its footnotes. */}
      <div className="write-seed-bar">
        <span className="write-seed-label">starting point</span>
        <select aria-label="Spark style" value={style} onChange={(event) => setStyle(event.target.value)}>{GEN_STYLES.map((name) => <option key={name}>{name}</option>)}</select>
        <label><input type="checkbox" checked={sevenths} onChange={(event) => setSevenths(event.target.checked)} /> 7ths</label>
        <button className="bench-btn" onClick={spark}><Wand2 size={13} /> Spark</button>
        <button className="bench-btn" onClick={() => onEdit?.({ type: "section/reverse", sectionId: selectedSection.id })}><RotateCcw size={13} /> Reverse the section</button>
      </div>

      <details className="write-drawer" open>
        <summary>Words · lines, fragments, and Tweedy-style constraint tools</summary>
        <div className="write-drawer-body write-words-grid">
          <textarea aria-label="Lyric pad" value={draft.lyrics} onChange={(event) => onEdit?.({ type: "draft/lyrics", lyrics: event.target.value })} placeholder="Lines, fragments, overheard things. Nothing here has to be good yet." />
          <div className="write-word-tools">
            <textarea aria-label="Verbs" value={verbs} onChange={(event) => setVerbs(event.target.value)} placeholder="verbs · one per line" />
            <textarea aria-label="Nouns" value={nouns} onChange={(event) => setNouns(event.target.value)} placeholder="visible nouns · one per line" />
            <button className="bench-btn" onClick={dealPairs}><Shuffle size={13} /> Deal wrong pairs</button>
            {pairs.map((pair) => <button key={pair} onClick={() => onEdit?.({ type: "draft/lyrics", lyrics: `${draft.lyrics}${draft.lyrics ? "\n" : ""}${pair}` })}>{pair}</button>)}
          </div>
        </div>
      </details>

      <details className="write-drawer">
        <summary>Melody · record a thought or hum a line into chords</summary>
        <div className="write-drawer-body"><PocketRecorder /><HumHarmony activeKey={activeKey} onAudition={onAudition} onCommitChords={commitHum} /></div>
      </details>

      <details className="write-drawer">
        <summary>Exercises · useful ways to get unstuck</summary>
        <div className="write-drawer-body write-exercises">{EXERCISES.map(([name, text]) => <article key={name}><strong>{name}</strong><p>{text}</p></article>)}</div>
      </details>

      <details className="write-drawer">
        <summary>Saved drafts · reopen without changing Song or Theory</summary>
        <div className="write-drawer-body write-saved">
          {saved.map((item) => <span key={item.id}><button onClick={() => openDraft(item.id)}>{item.name}</button><button aria-label={`Delete ${item.name}`} onClick={() => removeDraft(item.id)}><Trash2 size={12} /></button></span>)}
          {legacy.filter((item) => !saved.some((draftItem) => draftItem.id === item.id)).map((item) => <button key={item.id} onClick={() => openLegacy(item)}>Recover legacy · {item.name}</button>)}
          {!saved.length && !legacy.length && <small>No saved drafts yet.</small>}
        </div>
      </details>

      <details className="write-drawer">
        <summary>DAW and import</summary>
        <div className="write-drawer-body write-daw">
          <button className="bench-btn" onClick={onImport}><ClipboardPaste size={13} /> Send imported chords to Write</button>
          <button className="bench-btn" onClick={exportMidi}><Download size={13} /> Export .mid</button>
          {midiSupported ? <label><Cable size={13} /> MIDI out<select value={midiOutId} onFocus={onRefreshMidi} onChange={(event) => onPickMidiOut?.(event.target.value)}><option value="">off</option>{midiOutputs.map((output) => <option key={output.id} value={output.id}>{output.name}</option>)}</select></label> : <small>MIDI out needs Chrome or Edge.</small>}
        </div>
      </details>
    </div>
  );
}
