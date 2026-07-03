import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX,
  RotateCcw, Upload, Minus, Plus, Loader2, Piano as PianoIcon, Undo2, Lightbulb,
  Library as LibraryIcon, ScrollText, Compass, GraduationCap, PenLine, Target,
} from "lucide-react";
import {
  SHARP_NAMES, parseSheet, transposeChord, chordSymbol, displaySymbol,
  nashville, romanNumeral, detectKey, CIRCLE_OF_FIFTHS, sameChordSound, detectCapo,
} from "./lib/theory.js";
import { rootPositionFull, smoothUpper, addBass, clampVoicing } from "./lib/voicing.js";
import { analyzeSheet } from "./lib/llm.js";
import { respell, spellPc } from "./lib/spelling.js";
import { wheelMoves } from "./lib/voice.js";
import { isMidiSupported, requestMidi, listOutputs, sendChordToOutput, allNotesOff } from "./webmidi.js";
import { useAudioEngine } from "./audio/useAudioEngine.js";
import { C, MONO, DISPLAY } from "./ui/theme.js";
import { EngLabel, Readout, BenchButton } from "./ui/Bench.jsx";
import { loadSong, SOURCE_LABEL } from "./corpus.js";
import Keyboard from "./components/Keyboard.jsx";
import NumbersRail from "./components/NumbersRail.jsx";
import ScaleBuilder from "./components/ScaleBuilder.jsx";
import DegreeFinder from "./components/DegreeFinder.jsx";
import ChordLab from "./components/ChordLab.jsx";
import KeyWheel from "./components/KeyWheel.jsx";
import CapoTuning from "./components/CapoTuning.jsx";
import SongTools from "./components/SongTools.jsx";
import ImportModal from "./components/ImportModal.jsx";
import ChartView from "./components/ChartView.jsx";
import Library from "./components/Library.jsx";
import Practice from "./components/Practice.jsx";
import TabKeys from "./components/TabKeys.jsx";
import PlayAlong from "./components/PlayAlong.jsx";
import { benchBook } from "./storage.js";

const DEFAULT_SHEET = `[Intro]
E       A       E

[Verse 1]
E                    G#m7
So long, my only friend
C#m7                 B
I guess we gave it a try
A                         E
And then I guess we tried again
F#              F#   G#m7/F#   F#
I don't remember why

[Chorus]
A      E/G#      F#m              G#m7
How could you, baby?
A      E/G#      F#m                    E
Well, how could you, baby?`;

const NAV = [
  { id: "library", label: "Library", icon: LibraryIcon },
  { id: "song", label: "Song", icon: ScrollText },
  { id: "piano", label: "Piano", icon: PianoIcon },
  { id: "theory", label: "Theory", icon: Compass },
  { id: "learn", label: "Learn", icon: GraduationCap },
  { id: "write", label: "Write", icon: PenLine },
  { id: "practice", label: "Practice", icon: Target },
];

export default function App() {
  const [sheet, setSheet] = useState(DEFAULT_SHEET);
  const [loaded, setLoaded] = useState(null); // corpus song metadata, or null for a custom chart
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [tempo, setTempo] = useState(1500);
  const [mode, setMode] = useState("shape");
  const [transpose, setTranspose] = useState(0);
  const [keyOverride, setKeyOverride] = useState(null);
  const { engine: audio, engineState } = useAudioEngine();
  const [ai, setAi] = useState({ open: false, loading: false, data: null, error: null, raw: null });
  const [labProg, setLabProg] = useState(null);
  const [labHistory, setLabHistory] = useState([]);
  const [section, setSection] = useState("library");
  const [practiceTab, setPracticeTab] = useState("drills");
  const [theoryTab, setTheoryTab] = useState("circle");
  const [lessonHL, setLessonHL] = useState(null);

  const armedRef = useRef(false);
  const stripRef = useRef(null);
  const audioVoicingRef = useRef([]);
  const sheetRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState([]);
  const [midiOutId, setMidiOutId] = useState("");
  const midiOutRef = useRef(null);

  const pickMidiOut = useCallback(async (id) => {
    if (!id) { midiOutRef.current = null; setMidiOutId(""); return; }
    try {
      const access = await requestMidi();
      const outs = listOutputs(access);
      setMidiOutputs(outs);
      const chosen = outs.find((o) => o.id === id) || outs[0];
      midiOutRef.current = chosen ? chosen.port : null;
      setMidiOutId(chosen ? chosen.id : "");
    } catch (e) { midiOutRef.current = null; setMidiOutId(""); }
  }, []);

  const refreshMidiOutputs = useCallback(async () => {
    try { setMidiOutputs(listOutputs(await requestMidi())); } catch (e) { /* denied/unsupported */ }
  }, []);

  const loadSheet = (s) => {
    setSheet(s); setCurrentIdx(0); setIsPlaying(false); setTranspose(0); setKeyOverride(null);
  };

  const openSong = useCallback(async (entry) => {
    const song = await loadSong(entry);
    if (!song) return;
    setLoaded({ title: song.title, artist: song.artist, source: song.source, sourceUrl: song.sourceUrl, tuning: song.tuning, tuningRaw: song.tuningRaw, capo: song.capo, key: song.key, format: song.format });
    loadSheet(song.body || "");
    setSection("song");
  }, []);

  const { progression: baseProg } = useMemo(() => parseSheet(sheet), [sheet]);
  const sourceProg = labProg || baseProg;

  useEffect(() => { setLabProg(null); setLabHistory([]); }, [sheet]);

  // The capo is real: a chart in C shapes with capo 5 SOUNDS in F. But the
  // paper is the guitarist's document — so the READING surfaces (chart,
  // rail, key picker) stay as written, while the PLAYING surfaces (piano
  // lights, playback, tab→piano) speak sounding pitch. "Change the key from
  // there" = the transpose/key controls move the written document itself.
  const capoShift = useMemo(() => {
    const meta = Number(loaded?.capo);
    if (Number.isFinite(meta) && meta > 0) return Math.min(11, Math.round(meta));
    return detectCapo(sheet);
  }, [loaded, sheet]);
  const pitchShift = transpose + capoShift;

  const computeView = (shift) => {
    const raw = sourceProg.map((ch) => transposeChord(ch, shift));
    const detected = detectKey(raw);
    const keyCtx = keyOverride
      ? { tonic: (keyOverride.tonic + (shift - transpose)) % 12, mode: keyOverride.mode }
      : { tonic: detected.tonic, mode: detected.mode };
    const prog = raw.map((ch) => respell(ch, keyCtx));
    const uniqMap = new Map();
    for (const ch of prog) { const k = chordSymbol(ch); if (!uniqMap.has(k)) uniqMap.set(k, ch); }
    const unique = [...uniqMap.values()];
    const rootFull = prog.map(rootPositionFull);
    const smoothFull = [];
    let prevUp = null;
    for (const ch of prog) {
      const up = smoothUpper(ch, prevUp);
      smoothFull.push(clampVoicing(addBass(up, ch)));
      prevUp = up;
    }
    return { prog, unique, rootFull, smoothFull, detected };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => computeView(transpose), [sourceProg, transpose, keyOverride]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sounding = useMemo(
    () => (capoShift ? computeView(pitchShift) : null),
    [sourceProg, pitchShift, keyOverride, capoShift]
  );
  const soundingView = sounding || view;

  useEffect(() => {
    setCurrentIdx((i) => (view.prog.length ? Math.min(i, view.prog.length - 1) : 0));
  }, [view.prog.length]);

  const current = view.prog[currentIdx] || null;
  const soundingCurrent = soundingView.prog[currentIdx] || null;
  const activeKey = keyOverride || { tonic: view.detected.tonic, mode: view.detected.mode };
  const soundingKey = { tonic: soundingView.detected.tonic, mode: soundingView.detected.mode };
  // The piano PLAYS sounding pitch (shapes + capo + transpose).
  const audioVoicings = mode === "smooth" ? soundingView.smoothFull : soundingView.rootFull;
  audioVoicingRef.current = audioVoicings;

  const highlight = useMemo(() => {
    const ch = soundingCurrent;
    if (!ch) return { kind: "none" };
    if (mode === "shape") {
      const pcs = new Set(ch.intervals.map((i) => (ch.rootSemitone + i) % 12));
      if (ch.bassSemitone !== null) pcs.add(ch.bassSemitone);
      return { kind: "pcs", pcs, root: ch.rootSemitone % 12, bass: ch.bassSemitone };
    }
    const notes = (mode === "smooth" ? soundingView.smoothFull : soundingView.rootFull)[currentIdx] || [];
    return { kind: "midi", set: new Set(notes), root: ch.rootSemitone % 12, bass: ch.bassSemitone, notes };
  }, [soundingCurrent, mode, soundingView, currentIdx]);

  /* ---------- audio (engine lives in src/audio/engine.js) ---------- */
  const playVoiced = useCallback((midis, dur = 1.4) => {
    if (!midis || !midis.length) return;
    if (midiOutRef.current) {
      try { sendChordToOutput(midiOutRef.current, midis, { durationMs: Math.round(dur * 1000) }); } catch (e) { /* noop */ }
    }
    if (soundOn) audio.play(midis, dur);
  }, [soundOn, audio]);

  const ensureAndPlay = useCallback(async (midis, dur) => { await audio.init(); playVoiced(midis, dur); }, [audio, playVoiced]);

  useEffect(() => {
    if (armedRef.current) ensureAndPlay(audioVoicingRef.current[currentIdx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, mode, pitchShift]);

  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIdx]);

  useEffect(() => {
    if (!isPlaying || view.prog.length === 0) return;
    const id = setInterval(() => {
      setCurrentIdx((i) => { if (i + 1 >= view.prog.length) { setIsPlaying(false); return i; } return i + 1; });
    }, tempo);
    return () => clearInterval(id);
  }, [isPlaying, view.prog.length, tempo]);

  useEffect(() => () => {
    try { allNotesOff(midiOutRef.current); } catch (e) { /* noop */ }
  }, []);

  useEffect(() => { if (!isPlaying) { try { allNotesOff(midiOutRef.current); } catch (e) {} } }, [isPlaying]);
  useEffect(() => { if (section !== "learn") setLessonHL(null); }, [section]);

  /* ---------- handlers ---------- */
  const arm = () => { armedRef.current = true; audio.init(); };
  const selectIdx = (i) => { arm(); setIsPlaying(false); setCurrentIdx(i); };
  const selectUnique = (ch, progList = view.prog) => {
    arm(); setIsPlaying(false);
    // Match by SOUND, not by symbol string — respelling (A# vs B♭) must not break it.
    const i = progList.findIndex((c) => sameChordSound(c, ch));
    if (i >= 0) setCurrentIdx(i); else ensureAndPlay(rootPositionFull(ch));
  };
  const step = (d) => { arm(); setIsPlaying(false); setCurrentIdx((i) => Math.max(0, Math.min(view.prog.length - 1, i + d))); };
  const togglePlay = () => { arm(); if (!isPlaying && currentIdx >= view.prog.length - 1) setCurrentIdx(0); setIsPlaying((p) => !p); };
  const playSingleKey = (midi) => { arm(); ensureAndPlay([midi], 1.0); setFlash(new Set([midi])); setTimeout(() => setFlash(new Set()), 260); };

  const auditionChords = useCallback((chords) => {
    arm();
    const seq = Array.isArray(chords) ? chords : [chords];
    seq.forEach((ch, i) => { const midis = rootPositionFull(ch); setTimeout(() => ensureAndPlay(midis, seq.length > 1 ? 0.7 : 1.2), i * 360); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureAndPlay]);

  const applyLab = (s) => {
    const idx = currentIdx;
    const sectionTag = sourceProg[idx]?.section || "";
    const canon = s.chords.map((ch) => ({ ...transposeChord(ch, -transpose), section: sectionTag }));
    const next = sourceProg.slice();
    if (s.kind === "replace") next.splice(idx, 1, ...canon);
    else if (s.kind === "insertBefore") next.splice(idx, 0, ...canon);
    else next.splice(idx + 1, 0, ...canon);
    setLabHistory((h) => [...h, sourceProg]);
    setLabProg(next);
    if (s.kind === "insertBefore") setCurrentIdx(idx + canon.length);
  };
  const undoLab = () => {
    setLabHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setLabProg(prev === baseProg ? null : prev);
      setCurrentIdx((i) => Math.min(i, prev.length - 1));
      return h.slice(0, -1);
    });
  };
  const resetLab = () => { setLabProg(null); setLabHistory([]); };

  const loadProgression = (chords) => {
    arm(); setTranspose(0); setKeyOverride(null);
    setLabHistory([]); setLabProg(chords); setCurrentIdx(0); setIsPlaying(false);
  };

  const readFile = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => { setLoaded(null); setSheet(String(e.target.result || "")); setCurrentIdx(0); setIsPlaying(false); setTranspose(0); setKeyOverride(null); };
    r.readAsText(file);
  };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); };

  const runAI = async () => {
    setAi((s) => ({ ...s, open: true, loading: true, error: null, data: null, raw: null }));
    const res = await analyzeSheet(sheet);
    if (res.ok) setAi((s) => ({ ...s, loading: false, data: res.data }));
    else setAi((s) => ({ ...s, loading: false, error: res.error }));
  };

  /* ---------- keyboard role ---------- */
  const keyRole = (midi) => {
    if (highlight.kind === "pcs") {
      const cls = ((midi % 12) + 12) % 12;
      if (!highlight.pcs.has(cls)) return null;
      if (highlight.bass !== null && cls === highlight.bass) return "bass";
      if (cls === highlight.root) return "root";
      return "tone";
    }
    if (highlight.kind === "midi") {
      if (!highlight.set.has(midi)) return null;
      const cls = ((midi % 12) + 12) % 12;
      if (highlight.bass !== null && cls === highlight.bass) return "bass";
      if (cls === highlight.root) return "root";
      return "tone";
    }
    return null;
  };
  const keyName = `${spellPc(activeKey.tonic, activeKey)} ${activeKey.mode}`;
  const soundingKeyName = `${spellPc(soundingKey.tonic, soundingKey)} ${soundingKey.mode}`;
  // e.g. "D major · capo 5 sounds in F major" — the paper vs the air.
  const keyNameFull = capoShift ? `${keyName} · capo ${capoShift} sounds in ${soundingKeyName}` : keyName;
  const roleForKeyboard = (midi) => {
    if (section === "learn" && lessonHL) {
      const e = lessonHL.get(((midi % 12) + 12) % 12);
      return e ? { role: e.role, label: e.label, ghost: e.ghost } : null;
    }
    const role = keyRole(midi);
    return role ? { role } : null;
  };

  const tutor = {
    activeKey,
    setKey: (tonic, m) => setKeyOverride({ tonic, mode: m }),
    light: (entries) => {
      if (!entries) { setLessonHL(null); return; }
      const map = new Map();
      for (const e of entries) map.set(((e.pc % 12) + 12) % 12, { role: e.role, label: e.label, ghost: e.ghost });
      setLessonHL(map);
    },
    playChord: (ch) => { arm(); ensureAndPlay(rootPositionFull(ch), 1.2); },
    playNotes: (midis, dur) => { arm(); ensureAndPlay(midis, dur); },
    playPc: (pc) => { arm(); ensureAndPlay([60 + (((pc % 12) + 12) % 12)], 1.0); },
  };

  /* ---------- play-along + bench book plumbing ---------- */
  const songKey = useMemo(() => {
    const raw = loaded ? `${loaded.artist || ""} ${loaded.title || ""}` : "untitled chart";
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-chart";
  }, [loaded]);
  const labelForSounding = useCallback((ch) => displaySymbol(ch, pitchShift), [pitchShift]);
  const logPractice = useCallback((entry) => {
    try { benchBook.logPractice({ ...entry, at: Date.now() }); } catch (e) { /* storage full/blocked */ }
  }, []);

  const onChipIntent = (intent) => {
    if (intent === "relative") {
      const major = activeKey.mode === "major";
      setKeyOverride({ tonic: (activeKey.tonic + (major ? 9 : 3)) % 12, mode: major ? "minor" : "major" });
      setSection("learn");
    } else setSection("learn");
  };

  /* ---------- shared bits ---------- */
  // Picking a new tonic CHANGES THE KEY: it transposes the whole song there
  // (chart, numbers, piano, tab all follow). The mode select is a lens — it
  // renumbers/respells without moving pitches.
  const changeKeyTonic = (target) => {
    let delta = (target - activeKey.tonic + 12) % 12;
    if (delta > 6) delta -= 12;
    if (delta) {
      arm();
      setTranspose((t) => {
        let n = t + delta;
        if (n > 11) n -= 12;
        if (n < -11) n += 12;
        return n;
      });
    }
    if (keyOverride) setKeyOverride({ tonic: target, mode: keyOverride.mode });
  };
  const keyPicker = (
    <Readout style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <EngLabel>key</EngLabel>
      <select value={activeKey.tonic} onChange={(e) => changeKeyTonic(Number(e.target.value))} style={selStyle} aria-label="key"
        title="Change the song's key — the chart, numbers, piano and tab all move with it">
        {SHARP_NAMES.map((n, i) => <option key={i} value={i}>{spellPc(i, activeKey)}</option>)}
      </select>
      <select value={activeKey.mode} onChange={(e) => setKeyOverride({ tonic: activeKey.tonic, mode: e.target.value })} style={selStyle} aria-label="mode"
        title="Read the same chords through the major or minor lens — nothing moves">
        <option value="major">major</option>
        <option value="minor">minor</option>
      </select>
      {(keyOverride || transpose !== 0) ? (
        <button onClick={() => { setKeyOverride(null); setTranspose(0); }} style={{ ...miniBtn, width: "auto", padding: "0 8px", fontSize: 11 }}
          title="Back to the song's own key">auto</button>
      ) : (<span style={{ fontSize: 11, color: C.faint }}>auto</span>)}
    </Readout>
  );

  const transposeCtl = (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 8px", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="kl-eyebrow">Transpose</span>
      <button onClick={() => setTranspose((t) => Math.max(-11, t - 1))} style={miniBtn} aria-label="Transpose down"><Minus size={14} /></button>
      <span style={{ fontFamily: MONO, fontSize: 14, minWidth: 34, textAlign: "center", color: transpose ? C.toneText : C.muted }}>{transpose > 0 ? "+" : ""}{transpose}</span>
      <button onClick={() => setTranspose((t) => Math.min(11, t + 1))} style={miniBtn} aria-label="Transpose up"><Plus size={14} /></button>
    </div>
  );

  const transport = (
    <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
      <IconButton onClick={() => step(-1)} disabled={!view.prog.length} label="Previous chord"><ChevronLeft size={18} /></IconButton>
      <BenchButton primary={!isPlaying} onClick={togglePlay} disabled={!view.prog.length} style={{ minWidth: 150 }}>
        {isPlaying ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play through</>}
      </BenchButton>
      <IconButton onClick={() => step(1)} disabled={!view.prog.length} label="Next chord"><ChevronRight size={18} /></IconButton>
      <div style={{ width: 1, height: 26, background: C.line, margin: "0 4px" }} />
      <IconButton onClick={() => setSoundOn((s) => !s)} label={soundOn ? "Mute" : "Unmute"} active={soundOn}>
        {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </IconButton>
      <div className="flex items-center" style={{ gap: 8 }}>
        <span style={{ fontSize: 11, color: C.faint }}>slow</span>
        <input type="range" min={600} max={2400} step={100} value={2400 - (tempo - 600)}
          onChange={(e) => setTempo(2400 - (Number(e.target.value) - 600))} style={{ width: 90, accentColor: C.toneUi }} aria-label="playback speed" />
        <span style={{ fontSize: 11, color: C.faint }}>fast</span>
      </div>
    </div>
  );

  // Tab → piano is tuning-, capo- and key-aware: the loaded song's metadata
  // feeds the parser, and transpose moves the lit keys with the rest of the app.
  // (The parser applies capo to fret numbers itself, so shift stays user-only.)
  const tabKeysPanel = (
    <TabKeys sheet={sheet} tuning={loaded?.tuning} tuningRaw={loaded?.tuningRaw}
      capo={capoShift} shift={transpose}
      onPlay={(midis) => { arm(); ensureAndPlay(midis, 1.2); }} />
  );

  const numbersRailPanel = view.prog.length > 0 && (
    <section style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="kl-eyebrow">Progression · {keyName}</span>
        <span className="kl-eyebrow" style={{ color: C.faint }}>the numbers stay · the key moves</span>
      </div>
      <div ref={stripRef}>
        <NumbersRail prog={view.prog} activeKey={activeKey} currentIdx={currentIdx} transpose={transpose} onSelect={selectIdx} />
      </div>
    </section>
  );

  const aiPanel = ai.open && (
    <section style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="kl-eyebrow" style={{ marginBottom: 8 }}>Harmonic read</div>
      {ai.loading && <div style={{ color: C.muted, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="kl-spin" /> Reading the harmony…</div>}
      {ai.error && <div style={{ color: C.bassText, fontSize: 14 }}>{ai.error}</div>}
      {ai.data && (
        <div>
          <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.toneText }}>{ai.data.key}</span>
            {ai.data.confidence && <span style={{ fontSize: 11, color: C.faint }}>({ai.data.confidence} confidence)</span>}
          </div>
          {ai.data.summary && <p style={{ color: C.ink, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{ai.data.summary}</p>}
          {Array.isArray(ai.data.tips) && ai.data.tips.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, color: C.muted, fontSize: 13, marginTop: 4 }}><span style={{ color: C.rootText }}>•</span><span>{t}</span></div>
          ))}
        </div>
      )}
    </section>
  );

  const chartInput = (
    <section style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="kl-eyebrow">Paste a chart</span>
        <div className="flex items-center" style={{ gap: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer" }}>
            <Upload size={14} /> .txt
            <input type="file" accept=".txt,.text,text/plain" onChange={(e) => readFile(e.target.files?.[0])} style={{ display: "none" }} />
          </label>
          <button onClick={() => { setLoaded(null); loadSheet(DEFAULT_SHEET); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}>
            <RotateCcw size={14} /> example
          </button>
        </div>
      </div>
      <textarea ref={sheetRef} value={sheet} onChange={(e) => { setLoaded(null); setSheet(e.target.value); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
        spellCheck={false}
        style={{ width: "100%", minHeight: 180, resize: "vertical", background: dragOver ? C.panel2 : C.panel, color: C.ink, border: `1px solid ${dragOver ? C.toneUi : C.line}`, borderRadius: 12, padding: "14px 16px", fontFamily: MONO, fontSize: 13, lineHeight: 1.55, outline: "none" }}
        aria-label="chord sheet input" />
      <p style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>
        Paste from Ultimate-Guitar (<code>[ch]</code> tags), ChordPro (<code>[C]lyric</code>), plain chords-over-lyrics, or 6-line ASCII tab. Click any chord to hear it.
      </p>
    </section>
  );

  /* ---------- circle-of-fifths key facts ---------- */
  const keyFacts = useMemo(() => {
    // Key signature follows the RELATIVE MAJOR: A minor shares C major's (none).
    const majorTonic = activeKey.mode === "major" ? activeKey.tonic : (activeKey.tonic + 3) % 12;
    const idx = CIRCLE_OF_FIFTHS.indexOf(majorTonic);
    const acc = idx === 0 ? "no sharps or flats"
      : idx <= 6 ? `${idx} sharp${idx > 1 ? "s" : ""}`
      : `${12 - idx} flat${12 - idx > 1 ? "s" : ""}`;
    const relTonic = activeKey.mode === "major" ? (activeKey.tonic + 9) % 12 : (activeKey.tonic + 3) % 12;
    const relMode = activeKey.mode === "major" ? "minor" : "major";
    return { acc, rel: `${spellPc(relTonic, { tonic: relTonic, mode: relMode })} ${relMode}` };
  }, [activeKey]);

  return (
    <div className="kl-app">
      {/* ---- SIDEBAR ---- */}
      <aside className="kl-sidebar">
        <div className="kl-brand">
          <div className="mark">Keylit</div>
          <div className="kicker">the songbook that thinks in numbers</div>
        </div>
        <nav className="kl-nav" aria-label="Sections">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.id} className="kl-nav-item" aria-current={section === n.id} onClick={() => setSection(n.id)}>
                <span className="ico"><Icon size={17} /></span>{n.label}
              </button>
            );
          })}
        </nav>
        <div className="kl-side-foot">
          <EnginePill engine={engineState.engine} loading={engineState.loading} />
        </div>
      </aside>

      {/* ---- MAIN ---- */}
      <main className="kl-main">
        <div className="kl-topbar">
          <div className="kl-crumb">
            {(section === "song" || section === "piano") && loaded ? (
              <><span>Library</span><span className="sep">/</span><span>{loaded.artist}</span><span className="sep">/</span><span className="cur">{loaded.title}</span></>
            ) : (
              <span className="cur">{NAV.find((n) => n.id === section)?.label}</span>
            )}
          </div>
          <div style={{ marginLeft: "auto" }} className="flex items-center">
            <span className="kl-meta">Key of {keyNameFull}</span>
          </div>
        </div>

        <div className={`kl-content${section === "library" || section === "song" ? "" : " wide"}`}>
          {section === "library" && (
            <Library onOpen={openSong}
              onPaste={() => { setSection("song"); setImportOpen(true); }}
              onDemo={() => { setLoaded(null); loadSheet(DEFAULT_SHEET); setSection("song"); }} />
          )}

          {section === "song" && (
            <div className="kl-section">
              <SongHeader loaded={loaded} keyName={keyNameFull} />
              <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", margin: "14px 0 4px" }}>
                {transposeCtl}
                {capoShift > 0 && (
                  <Readout style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                    title={`The chart reads as written; with the capo it SOUNDS in ${soundingKeyName}. The Piano room and playback use the sounding pitch.`}>
                    <EngLabel>capo {capoShift}</EngLabel>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: C.rootText }}>sounds in {soundingKeyName}</span>
                  </Readout>
                )}
                {keyPicker}
                <BenchButton onClick={runAI} disabled={!view.prog.length || ai.loading} style={{ marginLeft: "auto" }}>
                  {ai.loading ? <Loader2 size={15} className="kl-spin" /> : <Lightbulb size={15} />} Read the harmony
                </BenchButton>
              </div>
              {numbersRailPanel}
              {aiPanel}
              {tabKeysPanel}
              <section style={{ marginTop: 18 }}>
                <ChartView text={sheet} activeKey={activeKey} transpose={transpose}
                  activeChord={current}
                  onChordClick={(ch) => { arm(); selectUnique(ch); }} />
              </section>
              {chartInput}
            </div>
          )}

          {section === "piano" && (
            <div className="kl-section">
              <div className="kl-eyebrow">The instrument</div>
              <h1 className="kl-title" style={{ marginTop: 4 }}>Piano</h1>
              <p className="kl-prose" style={{ maxWidth: 560, marginTop: 6, marginBottom: 16 }}>
                {loaded ? <>The chords of <em>{loaded.title}</em>, lit on the keys.</> : <>The chords of your chart, lit on the keys — the proper notes for each shape.</>}
              </p>
              <div className="deck" style={{ padding: "16px 16px 14px" }}>
                <div className="flex items-center justify-between" style={{ gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                  <div style={{ minWidth: 200 }}>
                    {soundingCurrent ? (
                      <div className="flex items-center" style={{ gap: 16 }}>
                        <div key={currentIdx + chordSymbol(soundingCurrent)} className="kl-pop" style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, lineHeight: 1, color: "#f3ede2" }}>{displaySymbol(soundingCurrent, pitchShift)}</div>
                        <div>
                          <div className="flex items-center" style={{ gap: 8 }}>
                            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.rootGlow }}>{nashville(soundingCurrent, soundingKey.tonic)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 13, color: "#b8b0a4" }}>{romanNumeral(soundingCurrent, soundingKey.tonic)}</span>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8b8378", marginTop: 6 }}>
                            {soundingCurrent.section || "now playing"} · {currentIdx + 1}/{view.prog.length}
                            {capoShift > 0 && current && <> · written {displaySymbol(current, transpose)} (capo {capoShift})</>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "#8b8378", fontFamily: MONO }}>
                        <div>Nothing loaded yet.</div>
                        <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
                          <BenchButton onClick={() => setSection("library")}>Pick from the Library</BenchButton>
                          <BenchButton onClick={() => setImportOpen(true)}>Paste a chart or tab</BenchButton>
                        </div>
                      </div>
                    )}
                  </div>
                  <Segmented label="Keys" value={mode} onChange={(v) => { arm(); setMode(v); }}
                    options={[{ v: "shape", t: "Shape" }, { v: "voicing", t: "Voicing" }, { v: "smooth", t: "Smooth" }]} dark />
                </div>
                <div className="key-felt" style={{ padding: "14px 12px 10px" }}>
                  <Keyboard roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash} ariaLabel="piano keyboard — the current chord is lit" />
                </div>
                <div style={{ marginTop: 14 }}>{transport}</div>
              </div>
              {soundingView.unique.length > 0 && (
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {soundingView.unique.map((ch, i) => {
                    const active = soundingCurrent && chordSymbol(soundingCurrent) === chordSymbol(ch);
                    return (
                      <button key={i} onClick={() => selectUnique(ch, soundingView.prog)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "7px 12px", borderRadius: 9, cursor: "pointer", background: active ? C.panel2 : C.panel, border: `1px solid ${active ? C.toneUi : C.line}` }}>
                        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.ink }}>{displaySymbol(ch, pitchShift)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{nashville(ch, soundingKey.tonic)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p style={{ color: C.faint, fontSize: 12, marginTop: 14, maxWidth: 620 }}>
                <b style={{ color: C.muted }}>Shape</b> lights every note in the chord. <b style={{ color: C.muted }}>Voicing</b> shows one close hand position. <b style={{ color: C.muted }}>Smooth</b> voice-leads from the chord before it.
              </p>
              {tabKeysPanel}
            </div>
          )}

          {section === "theory" && (
            <div className="kl-section">
              <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
                <div><div className="kl-eyebrow">The map</div><h1 className="kl-title" style={{ marginTop: 4 }}>Theory</h1></div>
                <div className="kl-seg" role="tablist" aria-label="Theory view">
                  <button role="tab" aria-selected={theoryTab === "circle"} onClick={() => setTheoryTab("circle")}>Circle of Fifths</button>
                  <button role="tab" aria-selected={theoryTab === "capo"} onClick={() => setTheoryTab("capo")}>Capo &amp; Tunings</button>
                </div>
              </div>
              {theoryTab === "circle" ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, marginTop: 18, alignItems: "start" }} className="bench-cols">
                  <div>
                    <KeyWheel prog={view.prog} activeKey={activeKey} currentIdx={currentIdx}
                      onPickTonic={(pc, m) => setKeyOverride({ tonic: pc, mode: m || activeKey.mode })}
                      onAudition={auditionChords} />
                    <p style={{ color: C.faint, fontSize: 12, textAlign: "center", marginTop: 10 }}>
                      Your key rides at the top; the wedge holds the chords that always fit. Click any key to <b style={{ color: C.muted }}>hear it</b> and make it home — the wheel turns, your song's chords stay lit.
                    </p>
                  </div>
                  <div>
                    <div className="kl-eyebrow">Key of {keyName} · {keyFacts.acc}</div>
                    {Object.entries(wheelMoves(activeKey)).map(([k, mv]) => (
                      <div key={k} style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
                        <div className="flex items-center justify-between" style={{ gap: 8 }}>
                          <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 17, color: C.ink }}>{mv.title}</span>
                          {mv.chords ? (
                            <button className="bench-btn" style={{ padding: "4px 11px", fontSize: 12 }}
                              onClick={() => auditionChords(mv.chords)}>
                              <Play size={12} /> hear it
                            </button>
                          ) : (
                            <button className="bench-btn" style={{ padding: "4px 11px", fontSize: 12 }}
                              onClick={() => { arm(); setKeyOverride({ tonic: mv.pivotTonic, mode: mv.pivotMode }); }}>
                              go there
                            </button>
                          )}
                        </div>
                        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>{mv.line}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 18 }}>
                  <CapoTuning prog={view.prog} />
                </div>
              )}
            </div>
          )}

          {section === "learn" && (
            <div className="kl-section">
              <div className="kl-eyebrow">The tutor</div>
              <h1 className="kl-title" style={{ marginTop: 4, marginBottom: 16 }}>Learn</h1>
              <div className="deck" style={{ padding: "14px 12px", marginBottom: 18 }}>
                <div className="key-felt" style={{ padding: "12px 10px 8px" }}>
                  <Keyboard roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash} ariaLabel="piano keyboard — the lesson is lit" />
                </div>
              </div>
              <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}>
                <ScaleBuilder tutor={tutor} onIntent={onChipIntent} />
                <DegreeFinder tutor={tutor} onIntent={onChipIntent} />
              </div>
            </div>
          )}

          {section === "write" && (
            <div className="kl-section">
              <div className="kl-eyebrow">The desk</div>
              <h1 className="kl-title" style={{ marginTop: 4, marginBottom: 14 }}>Write</h1>
              <SongTools
                activeKey={activeKey} sheet={sheet} voicings={audioVoicings} tempoMs={tempo}
                onImport={() => setImportOpen(true)} onLoadProgression={loadProgression} onLoadSheet={(s) => { setLoaded(null); loadSheet(s); }}
                nowStamp={() => Date.now()} midiSupported={isMidiSupported()} midiOutputs={midiOutputs} midiOutId={midiOutId}
                onPickMidiOut={pickMidiOut} onRefreshMidi={refreshMidiOutputs} />
              {numbersRailPanel}
              <div style={{ marginTop: 18 }}>
                <ChordLab prog={view.prog} activeKey={activeKey} selectedIdx={currentIdx} onSelectIdx={selectIdx} onAudition={auditionChords} onApply={applyLab} />
              </div>
              {(labProg || labHistory.length > 0) && (
                <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
                  <BenchButton onClick={undoLab} disabled={!labHistory.length}><Undo2 size={14} /> Undo edit</BenchButton>
                  <button onClick={resetLab} style={{ background: "transparent", color: C.muted, border: "none", fontSize: 12.5, cursor: "pointer" }}>revert to sheet</button>
                  <span style={{ fontSize: 11.5, color: C.faint }}>edits live here, not in your chord sheet</span>
                </div>
              )}
            </div>
          )}

          {section === "practice" && (
            <div className="kl-section">
              <div className="kl-seg" role="tablist" aria-label="Practice area" style={{ marginBottom: 6 }}>
                <button role="tab" aria-selected={practiceTab === "drills"} onClick={() => setPracticeTab("drills")}>Drills</button>
                <button role="tab" aria-selected={practiceTab === "song"} onClick={() => setPracticeTab("song")}>Play the song</button>
              </div>
              {practiceTab === "drills" && (
                <Practice onPlay={(midis) => { arm(); midis.forEach((m, i) => setTimeout(() => ensureAndPlay([m], 0.9), i * 460)); }} />
              )}
              {practiceTab === "song" && (
                <PlayAlong
                  title={loaded?.title || (sheet.trim() ? "Your chart" : null)}
                  artist={loaded?.artist || null}
                  songKey={songKey}
                  prog={soundingView.prog}
                  rootVoicings={soundingView.rootFull}
                  smoothVoicings={soundingView.smoothFull}
                  sheet={sheet} tuning={loaded?.tuning} tuningRaw={loaded?.tuningRaw}
                  capo={capoShift} shift={transpose}
                  labelFor={labelForSounding}
                  onPlay={(midis, dur) => { arm(); ensureAndPlay(midis, dur); }}
                  onScore={logPractice}
                  onPickSong={() => setSection("library")}
                />
              )}
            </div>
          )}
        </div>
      </main>

      <ImportModal open={importOpen} onLoad={(s) => { setLoaded(null); loadSheet(s); }} onClose={() => setImportOpen(false)} />
      <style>{`.spin{animation:kl-spin 1s linear infinite}`}</style>
    </div>
  );
}

/* ================================================================== *
 * SMALL PIECES
 * ================================================================== */
function SongHeader({ loaded, keyName }) {
  if (!loaded) {
    return (
      <div>
        <div className="kl-eyebrow">Untitled chart · key of {keyName}</div>
        <h1 className="kl-title" style={{ marginTop: 4 }}>Your chart</h1>
      </div>
    );
  }
  const bits = [loaded.artist, `key of ${keyName}`];
  if (loaded.tuning && loaded.tuning !== "standard") bits.push(loaded.tuning);
  if (loaded.capo) bits.push(`capo ${loaded.capo}`);
  return (
    <div>
      <div className="kl-eyebrow">{bits.join(" · ")}</div>
      <h1 className="kl-title" style={{ marginTop: 4 }}>{loaded.title}</h1>
      {loaded.sourceUrl && (
        <a href={loaded.sourceUrl} target="_blank" rel="noreferrer" className="kl-meta" style={{ color: C.faint, textDecoration: "none", borderBottom: `1px solid ${C.line}` }}>
          {SOURCE_LABEL[loaded.source] || loaded.source}
        </a>
      )}
    </div>
  );
}

const miniBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 7, background: C.panel2,
  color: C.ink, border: `1px solid ${C.line}`, cursor: "pointer",
};
const selStyle = {
  background: C.panel, color: C.ink, border: `1px solid ${C.line}`,
  borderRadius: 7, padding: "4px 6px", fontSize: 13, fontFamily: MONO, cursor: "pointer",
};

function EnginePill({ engine, loading }) {
  const label = engine === "piano" ? "Sampled grand piano" : engine === "synth" ? (loading ? "Synth · loading piano…" : "Synth") : "Audio ready on first note";
  return (
    <div className="eng-pill">
      {loading ? <Loader2 size={14} className="kl-spin" /> : <PianoIcon size={14} />}
      <span>{label}</span>
    </div>
  );
}

function Segmented({ label, value, onChange, options, dark }) {
  return (
    <div className="kl-seg" role="tablist" aria-label={label} style={dark ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" } : undefined}>
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          style={dark && value !== o.v ? { color: "#b8b0a4" } : undefined}>{o.t}</button>
      ))}
    </div>
  );
}

function IconButton({ children, onClick, disabled, label, active }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: C.panel, color: active ? C.toneText : C.ink, border: `1px solid ${C.line}`, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}
