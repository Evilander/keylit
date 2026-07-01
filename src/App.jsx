import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as Tone from "tone";
import {
  Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX,
  RotateCcw, Upload, Minus, Plus, Loader2, Piano as PianoIcon, Undo2, Lightbulb,
  Library as LibraryIcon, ScrollText, Compass, GraduationCap, PenLine, Target,
} from "lucide-react";
import {
  SHARP_NAMES, parseSheet, transposeChord, chordSymbol, displaySymbol,
  nashville, romanNumeral, detectKey, CIRCLE_OF_FIFTHS,
} from "./lib/theory.js";
import { rootPositionFull, smoothUpper, addBass, clampVoicing } from "./lib/voicing.js";
import { analyzeSheet } from "./lib/llm.js";
import { respell, spellPc } from "./lib/spelling.js";
import { isMidiSupported, requestMidi, listOutputs, sendChordToOutput, allNotesOff } from "./webmidi.js";
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

const SALAMANDER = {
  A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
  A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
  A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
  A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
  A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
  A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
  A6: "A6.mp3", C7: "C7.mp3",
};
const SALAMANDER_BASE = "https://tonejs.github.io/audio/salamander/";

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
  const [engine, setEngine] = useState("off");
  const [sampleLoading, setSampleLoading] = useState(false);
  const [ai, setAi] = useState({ open: false, loading: false, data: null, error: null, raw: null });
  const [labProg, setLabProg] = useState(null);
  const [labHistory, setLabHistory] = useState([]);
  const [capo, setCapo] = useState(0);
  const [section, setSection] = useState("library");
  const [theoryTab, setTheoryTab] = useState("circle");
  const [lessonHL, setLessonHL] = useState(null);

  const audioInit = useRef(false);
  const engineRef = useRef(null);
  const synthRef = useRef(null);
  const samplerRef = useRef(null);
  const reverbRef = useRef(null);
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
    setLoaded({ title: song.title, artist: song.artist, source: song.source, sourceUrl: song.sourceUrl, tuning: song.tuning, capo: song.capo, key: song.key, format: song.format });
    loadSheet(song.body || "");
    setSection("song");
  }, []);

  const { progression: baseProg } = useMemo(() => parseSheet(sheet), [sheet]);
  const sourceProg = labProg || baseProg;

  useEffect(() => { setLabProg(null); setLabHistory([]); setCapo(0); }, [sheet]);

  const view = useMemo(() => {
    const raw = sourceProg.map((ch) => transposeChord(ch, transpose));
    const detected = detectKey(raw);
    const keyCtx = keyOverride || { tonic: detected.tonic, mode: detected.mode };
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
  }, [sourceProg, transpose, keyOverride]);

  useEffect(() => {
    setCurrentIdx((i) => (view.prog.length ? Math.min(i, view.prog.length - 1) : 0));
  }, [view.prog.length]);

  const current = view.prog[currentIdx] || null;
  const activeKey = keyOverride || { tonic: view.detected.tonic, mode: view.detected.mode };
  const audioVoicings = mode === "smooth" ? view.smoothFull : view.rootFull;
  audioVoicingRef.current = audioVoicings;

  const highlight = useMemo(() => {
    if (!current) return { kind: "none" };
    if (mode === "shape") {
      const pcs = new Set(current.intervals.map((i) => (current.rootSemitone + i) % 12));
      if (current.bassSemitone !== null) pcs.add(current.bassSemitone);
      return { kind: "pcs", pcs, root: current.rootSemitone % 12, bass: current.bassSemitone };
    }
    const notes = (mode === "smooth" ? view.smoothFull : view.rootFull)[currentIdx] || [];
    return { kind: "midi", set: new Set(notes), root: current.rootSemitone % 12, bass: current.bassSemitone, notes };
  }, [current, mode, view, currentIdx]);

  /* ---------- audio ---------- */
  const buildInstrument = () => {
    const reverb = new Tone.Reverb({ decay: 2.4, wet: 0.22 }).toDestination();
    reverbRef.current = reverb;
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.006, decay: 0.9, sustain: 0.12, release: 1.3 },
    });
    synth.volume.value = -7;
    synth.connect(reverb);
    synthRef.current = synth;
    engineRef.current = synth;
    setEngine("synth");
    setSampleLoading(true);
    try {
      const sampler = new Tone.Sampler({
        urls: SALAMANDER, baseUrl: SALAMANDER_BASE, release: 1,
        onload: () => { samplerRef.current = sampler; engineRef.current = sampler; setEngine("piano"); setSampleLoading(false); },
      });
      sampler.connect(reverb);
      setTimeout(() => { if (engineRef.current !== sampler) setSampleLoading(false); }, 12000);
    } catch (e) { setSampleLoading(false); }
  };

  const initAudioOnce = async () => {
    if (audioInit.current) return;
    audioInit.current = true;
    try { await Tone.start(); } catch (e) { /* noop */ }
    buildInstrument();
  };

  const playVoiced = useCallback((midis, dur = 1.4) => {
    if (!midis || !midis.length) return;
    if (midiOutRef.current) {
      try { sendChordToOutput(midiOutRef.current, midis, { durationMs: Math.round(dur * 1000) }); } catch (e) { /* noop */ }
    }
    if (!soundOn) return;
    const inst = engineRef.current;
    if (!inst) return;
    const t0 = Tone.now();
    midis.forEach((m, i) => {
      const n = Tone.Frequency(m, "midi").toNote();
      try { inst.triggerAttackRelease(n, dur, t0 + i * 0.013); } catch (e) { /* sampler not ready */ }
    });
  }, [soundOn]);

  const ensureAndPlay = useCallback(async (midis, dur) => { await initAudioOnce(); playVoiced(midis, dur); }, [playVoiced]);

  useEffect(() => {
    if (armedRef.current) ensureAndPlay(audioVoicingRef.current[currentIdx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, mode, transpose]);

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
    try { synthRef.current?.dispose(); samplerRef.current?.dispose(); reverbRef.current?.dispose(); } catch (e) {}
    try { allNotesOff(midiOutRef.current); } catch (e) {}
  }, []);

  useEffect(() => { if (!isPlaying) { try { allNotesOff(midiOutRef.current); } catch (e) {} } }, [isPlaying]);
  useEffect(() => { if (section !== "learn") setLessonHL(null); }, [section]);

  /* ---------- handlers ---------- */
  const arm = () => { armedRef.current = true; initAudioOnce(); };
  const selectIdx = (i) => { arm(); setIsPlaying(false); setCurrentIdx(i); };
  const selectUnique = (ch) => {
    arm(); setIsPlaying(false);
    const i = view.prog.findIndex((c) => chordSymbol(c) === chordSymbol(ch));
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
    arm(); setTranspose(0); setCapo(0); setKeyOverride(null);
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

  const onChipIntent = (intent) => {
    if (intent === "relative") {
      const major = activeKey.mode === "major";
      setKeyOverride({ tonic: (activeKey.tonic + (major ? 9 : 3)) % 12, mode: major ? "minor" : "major" });
      setSection("learn");
    } else setSection("learn");
  };

  /* ---------- shared bits ---------- */
  const keyPicker = (
    <Readout style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <EngLabel>key</EngLabel>
      <select value={activeKey.tonic} onChange={(e) => setKeyOverride({ tonic: Number(e.target.value), mode: activeKey.mode })} style={selStyle} aria-label="key">
        {SHARP_NAMES.map((n, i) => <option key={i} value={i}>{spellPc(i, activeKey)}</option>)}
      </select>
      <select value={activeKey.mode} onChange={(e) => setKeyOverride({ tonic: activeKey.tonic, mode: e.target.value })} style={selStyle} aria-label="mode">
        <option value="major">major</option>
        <option value="minor">minor</option>
      </select>
      {keyOverride ? (<button onClick={() => setKeyOverride(null)} style={{ ...miniBtn, width: "auto", padding: "0 8px", fontSize: 11 }}>auto</button>) : (<span style={{ fontSize: 11, color: C.faint }}>auto</span>)}
    </Readout>
  );

  const transposeCtl = (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 8px", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="kl-eyebrow">Transpose</span>
      <button onClick={() => setTranspose((t) => Math.max(-11, t - 1))} style={miniBtn} aria-label="Transpose down"><Minus size={14} /></button>
      <span style={{ fontFamily: MONO, fontSize: 14, minWidth: 34, textAlign: "center", color: transpose ? C.toneText : C.muted }}>{transpose > 0 ? "+" : ""}{transpose}</span>
      <button onClick={() => setTranspose((t) => Math.min(11, t + 1))} style={miniBtn} aria-label="Transpose up"><Plus size={14} /></button>
      {transpose !== 0 && (<button onClick={() => setTranspose(0)} style={{ ...miniBtn, width: "auto", padding: "0 8px", fontSize: 11 }}>reset</button>)}
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
          <EnginePill engine={engine} loading={sampleLoading} />
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
            <span className="kl-meta">Key of {keyName}</span>
          </div>
        </div>

        <div className={`kl-content${section === "library" || section === "song" ? "" : " wide"}`}>
          {section === "library" && <Library onOpen={openSong} />}

          {section === "song" && (
            <div className="kl-section">
              <SongHeader loaded={loaded} keyName={keyName} />
              <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", margin: "14px 0 4px" }}>
                {transposeCtl}
                {keyPicker}
                <BenchButton onClick={runAI} disabled={!view.prog.length || ai.loading} style={{ marginLeft: "auto" }}>
                  {ai.loading ? <Loader2 size={15} className="kl-spin" /> : <Lightbulb size={15} />} Read the harmony
                </BenchButton>
              </div>
              {numbersRailPanel}
              {aiPanel}
              <section style={{ marginTop: 18 }}>
                <ChartView text={sheet} activeKey={activeKey} transpose={transpose}
                  activeSymbol={current ? displaySymbol(current, 0) : null}
                  onChordClick={(ch) => { arm(); selectUnique(ch); }} />
              </section>
              <TabKeys sheet={sheet} onPlay={(midis) => { arm(); ensureAndPlay(midis, 1.2); }} />
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
                    {current ? (
                      <div className="flex items-center" style={{ gap: 16 }}>
                        <div key={currentIdx + chordSymbol(current)} className="kl-pop" style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, lineHeight: 1, color: "#f3ede2" }}>{displaySymbol(current, transpose)}</div>
                        <div>
                          <div className="flex items-center" style={{ gap: 8 }}>
                            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.rootGlow }}>{nashville(current, activeKey.tonic)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 13, color: "#b8b0a4" }}>{romanNumeral(current, activeKey.tonic)}</span>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8b8378", marginTop: 6 }}>{current.section || "now playing"} · {currentIdx + 1}/{view.prog.length}</div>
                        </div>
                      </div>
                    ) : <div style={{ color: "#8b8378", fontFamily: MONO }}>Load a song to light the keys.</div>}
                  </div>
                  <Segmented label="Keys" value={mode} onChange={(v) => { arm(); setMode(v); }}
                    options={[{ v: "shape", t: "Shape" }, { v: "voicing", t: "Voicing" }, { v: "smooth", t: "Smooth" }]} dark />
                </div>
                <div className="key-felt" style={{ padding: "14px 12px 10px" }}>
                  <Keyboard roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash} ariaLabel="piano keyboard — the current chord is lit" />
                </div>
                <div style={{ marginTop: 14 }}>{transport}</div>
              </div>
              {view.unique.length > 0 && (
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {view.unique.map((ch, i) => {
                    const active = current && chordSymbol(current) === chordSymbol(ch);
                    return (
                      <button key={i} onClick={() => selectUnique(ch)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "7px 12px", borderRadius: 9, cursor: "pointer", background: active ? C.panel2 : C.panel, border: `1px solid ${active ? C.toneUi : C.line}` }}>
                        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.ink }}>{displaySymbol(ch, transpose)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{nashville(ch, activeKey.tonic)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p style={{ color: C.faint, fontSize: 12, marginTop: 14, maxWidth: 620 }}>
                <b style={{ color: C.muted }}>Shape</b> lights every note in the chord. <b style={{ color: C.muted }}>Voicing</b> shows one close hand position. <b style={{ color: C.muted }}>Smooth</b> voice-leads from the chord before it.
              </p>
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
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 240px", gap: 24, marginTop: 18, alignItems: "start" }} className="bench-cols">
                  <div className="flex justify-center">
                    <KeyWheel prog={view.prog} activeKey={activeKey} currentIdx={currentIdx} onPickTonic={(pc, m) => setKeyOverride({ tonic: pc, mode: m || activeKey.mode })} />
                  </div>
                  <div>
                    <div className="kl-eyebrow">Key of {keyName}</div>
                    <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 22, color: C.ink, margin: "6px 0 14px" }}>{keyFacts.acc}</div>
                    <div className="kl-meta">relative {keyFacts.rel}</div>
                    <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginTop: 14 }}>
                      Each step clockwise adds a sharp (F C G D A E B); counter-clockwise adds a flat. Going up a fifth here is the same as going down a fourth on the neck. Click any key to re-center.
                    </p>
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

          {section === "practice" && <Practice onPlay={(midis) => { arm(); midis.forEach((m, i) => setTimeout(() => ensureAndPlay([m], 0.9), i * 460)); }} />}
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
