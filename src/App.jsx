import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as Tone from "tone";
import {
  Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX,
  RotateCcw, Upload, Sparkles, Minus, Plus, Loader2, Piano, Undo2,
} from "lucide-react";
import {
  SHARP_NAMES, parseSheet, transposeChord, chordSymbol, displaySymbol,
  nashville, romanNumeral, detectKey, harmonicFunction,
} from "./lib/theory.js";
import { rootPositionFull, smoothUpper, addBass, clampVoicing } from "./lib/voicing.js";
import { analyzeSheet } from "./lib/llm.js";
import { respell, spellPc } from "./lib/spelling.js";
import { isMidiSupported, requestMidi, listOutputs, sendChordToOutput, allNotesOff } from "./webmidi.js";
import { C, FUNCTION_COLOR, FUNCTION_LABEL, MONO, DISPLAY } from "./ui/theme.js";
import { Faceplate, Deck, EngLabel, Readout, BenchButton, Vu, RoomTabs } from "./ui/Bench.jsx";
import Keyboard from "./components/Keyboard.jsx";
import NumbersRail from "./components/NumbersRail.jsx";
import ScaleBuilder from "./components/ScaleBuilder.jsx";
import DegreeFinder from "./components/DegreeFinder.jsx";
import ChordLab from "./components/ChordLab.jsx";
import KeyWheel from "./components/KeyWheel.jsx";
import CapoAdvisor from "./components/CapoAdvisor.jsx";
import SongTools from "./components/SongTools.jsx";
import ImportModal from "./components/ImportModal.jsx";

/* ================================================================== *
 * ASSETS
 * ================================================================== */

// Salamander Grand Piano (CC-by) sample map for Tone.Sampler.
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
(played by the right hand on piano)
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
E                    G#m7
But nothing's as hard to do
C#m7                      B
As just saying goodbye
A                              E
And when love is in the way, you gotta say
C#m       D           E
I guess love ain't always right

[Pre-Chorus]
F#m                       G#m7
And I find out you'd gone and met a new man
A                          B
And told him he's the love of your life

[Chorus]
A      E/G#      F#m              F#m   G#m7
How could you, baby? (could you, baby)
A      E/G#      F#m              F#m   G#m7
How could you, baby? (could you, baby)
A      E/G#      F#m                    E
Well, how could you, baby? (could you, baby)

[Verse 2]
E                    G#m7
Well, have you lost your memories?
C#m7                       B
Did you wash 'em down the drain?
A                          E
And did you have some help deciding
F#              F#   G#m7/F#   F#
To forget my name?
E                    G#m7
Cause nothing I can say to you
C#m7              B
Could ever ease this pain
A                              E`;

/* ================================================================== *
 * COMPONENT
 * ================================================================== */
export default function App() {
  const [sheet, setSheet] = useState(DEFAULT_SHEET);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [tempo, setTempo] = useState(1500);
  const [mode, setMode] = useState("shape"); // shape | voicing | smooth
  const [transpose, setTranspose] = useState(0);
  const [keyOverride, setKeyOverride] = useState(null);
  const [engine, setEngine] = useState("off"); // off | synth | piano
  const [sampleLoading, setSampleLoading] = useState(false);
  const [ai, setAi] = useState({ open: false, loading: false, data: null, error: null, raw: null });
  // Chord Lab keeps an editable overlay on the parsed progression (null = use the sheet as-is).
  const [labProg, setLabProg] = useState(null);
  const [labHistory, setLabHistory] = useState([]);
  const [capo, setCapo] = useState(0); // guitar capo fret for the shape advisor
  const [room, setRoom] = useState("learn"); // learn | write | play — the three rooms
  const [lessonHL, setLessonHL] = useState(null); // Map<pc, {role,label,ghost}> driving the shared keyboard in Learn

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
  // Web MIDI out — send chords to a DAW/VST via a (virtual) MIDI port.
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
    } catch (e) {
      midiOutRef.current = null; setMidiOutId("");
    }
  }, []);

  // Populate the output list on demand (called when the user opens the picker).
  const refreshMidiOutputs = useCallback(async () => {
    try { setMidiOutputs(listOutputs(await requestMidi())); } catch (e) { /* denied/unsupported */ }
  }, []);

  const loadSheet = (s) => {
    setSheet(s); setCurrentIdx(0); setIsPlaying(false); setTranspose(0); setKeyOverride(null);
  };

  const { progression: baseProg } = useMemo(() => parseSheet(sheet), [sheet]);

  // The Chord Lab overlay (if any) replaces the parsed progression as the source of truth.
  const sourceProg = labProg || baseProg;

  // Editing the sheet text makes it the truth again — drop any lab overlay.
  useEffect(() => { setLabProg(null); setLabHistory([]); setCapo(0); }, [sheet]);

  const view = useMemo(() => {
    const raw = sourceProg.map((ch) => transposeChord(ch, transpose));
    const detected = detectKey(raw);
    // Spell every name for the active key (flats in flat keys, sharps in sharp
    // keys). Pitch classes are untouched — only labels change.
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
        urls: SALAMANDER,
        baseUrl: SALAMANDER_BASE,
        release: 1,
        onload: () => {
          samplerRef.current = sampler;
          engineRef.current = sampler;
          setEngine("piano");
          setSampleLoading(false);
        },
      });
      sampler.connect(reverb);
      setTimeout(() => { if (engineRef.current !== sampler) setSampleLoading(false); }, 12000);
    } catch (e) {
      setSampleLoading(false);
    }
  };

  const initAudioOnce = async () => {
    if (audioInit.current) return;
    audioInit.current = true;
    try { await Tone.start(); } catch (e) { /* noop */ }
    buildInstrument();
  };

  const playVoiced = useCallback((midis, dur = 1.4) => {
    if (!midis || !midis.length) return;
    // Send to the external MIDI port regardless of the internal mute, so you can
    // monitor only your DAW/VST if you want.
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

  const ensureAndPlay = useCallback(async (midis, dur) => {
    await initAudioOnce();
    playVoiced(midis, dur);
  }, [playVoiced]);

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
      setCurrentIdx((i) => {
        if (i + 1 >= view.prog.length) { setIsPlaying(false); return i; }
        return i + 1;
      });
    }, tempo);
    return () => clearInterval(id);
  }, [isPlaying, view.prog.length, tempo]);

  useEffect(() => () => {
    try { synthRef.current?.dispose(); samplerRef.current?.dispose(); reverbRef.current?.dispose(); } catch (e) {}
    try { allNotesOff(midiOutRef.current); } catch (e) {}
  }, []);

  // Silence any hung external MIDI notes when playback stops.
  useEffect(() => { if (!isPlaying) { try { allNotesOff(midiOutRef.current); } catch (e) {} } }, [isPlaying]);

  // The lesson highlight only applies in the Learn room — drop it elsewhere so
  // the keyboard returns to showing the current chord.
  useEffect(() => { if (room !== "learn") setLessonHL(null); }, [room]);

  /* ---------- handlers ---------- */
  const arm = () => { armedRef.current = true; initAudioOnce(); };
  const selectIdx = (i) => { arm(); setIsPlaying(false); setCurrentIdx(i); };
  const selectUnique = (ch) => {
    arm(); setIsPlaying(false);
    const i = view.prog.findIndex((c) => chordSymbol(c) === chordSymbol(ch));
    if (i >= 0) setCurrentIdx(i);
    else ensureAndPlay(rootPositionFull(ch));
  };
  const step = (d) => { arm(); setIsPlaying(false); setCurrentIdx((i) => Math.max(0, Math.min(view.prog.length - 1, i + d))); };
  const togglePlay = () => {
    arm();
    if (!isPlaying && currentIdx >= view.prog.length - 1) setCurrentIdx(0);
    setIsPlaying((p) => !p);
  };
  const playSingleKey = (midi) => {
    arm();
    ensureAndPlay([midi], 1.0);
    setFlash(new Set([midi]));
    setTimeout(() => setFlash(new Set()), 260);
  };

  /* ---------- Chord Lab ---------- */
  // Play a sequence of parsed chords (in the transposed view space) one after another.
  const auditionChords = useCallback((chords) => {
    arm();
    const seq = Array.isArray(chords) ? chords : [chords];
    seq.forEach((ch, i) => {
      const midis = rootPositionFull(ch);
      setTimeout(() => ensureAndPlay(midis, seq.length > 1 ? 0.7 : 1.2), i * 360);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureAndPlay]);

  // Apply a Chord Lab suggestion to the current chord (currentIdx). Suggestion
  // chords are in transposed space; un-transpose them into the canonical overlay.
  const applyLab = (s) => {
    const idx = currentIdx;
    const section = sourceProg[idx]?.section || "";
    const canon = s.chords.map((ch) => ({ ...transposeChord(ch, -transpose), section }));
    const next = sourceProg.slice();
    if (s.kind === "replace") next.splice(idx, 1, ...canon);
    else if (s.kind === "insertBefore") next.splice(idx, 0, ...canon);
    else next.splice(idx + 1, 0, ...canon); // insertAfter
    setLabHistory((h) => [...h, sourceProg]);
    setLabProg(next);
    // Keep the keyboard on the chord the user was working with after an insert-before.
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

  // Load a generated progression as the working overlay (a fresh start).
  const loadProgression = (chords) => {
    arm();
    setTranspose(0);
    setCapo(0);
    setKeyOverride(null);
    setLabHistory([]);
    setLabProg(chords);
    setCurrentIdx(0);
    setIsPlaying(false);
  };

  const readFile = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => { setSheet(String(e.target.result || "")); setCurrentIdx(0); setIsPlaying(false); setTranspose(0); setKeyOverride(null); };
    r.readAsText(file);
  };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); };

  /* ---------- AI analysis (Claude as harmonic coordinator) ----------
   * Calls the AI proxy (api/analyze.js) which holds the Anthropic key.
   * Set VITE_AI_PROXY_URL to point at it. Degrades gracefully when absent.
   */
  const runAI = async () => {
    setAi((s) => ({ ...s, open: true, loading: true, error: null, data: null, raw: null }));
    const res = await analyzeSheet(sheet);
    if (res.ok) setAi((s) => ({ ...s, loading: false, data: res.data }));
    else setAi((s) => ({ ...s, loading: false, error: res.error }));
  };

  /* ---------- rendering helpers ---------- */
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

  // The shared keyboard's role source: a Learn-room lesson highlight wins;
  // otherwise it shows the current chord.
  const roleForKeyboard = (midi) => {
    if (room === "learn" && lessonHL) {
      const e = lessonHL.get(((midi % 12) + 12) % 12);
      return e ? { role: e.role, label: e.label, ghost: e.ghost } : null;
    }
    const role = keyRole(midi);
    return role ? { role } : null;
  };

  // The tutor API handed to the Learn-room widgets — drive the keyboard + audio.
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

  // Route a proactive "next rung" chip to an action.
  const onChipIntent = (intent) => {
    if (intent === "relative") {
      const major = activeKey.mode === "major";
      setKeyOverride({ tonic: (activeKey.tonic + (major ? 9 : 3)) % 12, mode: major ? "minor" : "major" });
      setRoom("learn");
    } else {
      // diatonic / degree-drill / numbers / scale / pedal all live in the Learn room
      setRoom("learn");
    }
  };

  /* ---------- room content ---------- */
  const aiPanel = ai.open && (
    <Faceplate label="claude's read" style={{ marginTop: 14 }}>
      {ai.loading && <div style={{ color: C.muted, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="kl-spin" /> Reading the harmony&hellip;</div>}
      {ai.error && <div style={{ color: C.bass, fontSize: 14 }}>{ai.error}{ai.raw && <div style={{ color: C.muted, fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }}>{ai.raw}</div>}</div>}
      {ai.data && (
        <div>
          <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.tone }}>{ai.data.key}</span>
            {ai.data.confidence && <span style={{ fontSize: 11, color: C.faint }}>({ai.data.confidence} confidence)</span>}
          </div>
          {ai.data.summary && <p style={{ color: C.ink, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{ai.data.summary}</p>}
          {Array.isArray(ai.data.tips) && ai.data.tips.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {ai.data.tips.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, color: C.muted, fontSize: 13, marginTop: 4 }}><span style={{ color: C.root }}>&bull;</span><span>{t}</span></div>
              ))}
            </div>
          )}
          {Array.isArray(ai.data.tricky) && ai.data.tricky.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ai.data.tricky.map((tc, i) => (
                <div key={i} style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", maxWidth: 320 }}>
                  <div style={{ fontFamily: MONO, fontWeight: 700, color: C.bass, fontSize: 13 }}>{tc.chord}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{tc.advice}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Faceplate>
  );

  const numbersRailPanel = view.prog.length > 0 && (
    <Faceplate label={`progression · ${keyName}`} style={{ marginTop: 14 }}
      right={<span className="engraved">the numbers stay · the key moves</span>}>
      <div ref={stripRef}>
        <NumbersRail prog={view.prog} activeKey={activeKey} currentIdx={currentIdx} transpose={transpose} onSelect={selectIdx} />
      </div>
    </Faceplate>
  );

  const chartInput = (
    <Faceplate label="load a chart" style={{ marginTop: 14 }} right={
      <div className="flex items-center" style={{ gap: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer" }}>
          <Upload size={14} /> .txt
          <input type="file" accept=".txt,.text,text/plain" onChange={(e) => readFile(e.target.files?.[0])} style={{ display: "none" }} />
        </label>
        <button onClick={() => { setSheet(DEFAULT_SHEET); setCurrentIdx(0); setIsPlaying(false); setTranspose(0); setKeyOverride(null); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}>
          <RotateCcw size={14} /> example
        </button>
      </div>
    }>
      <textarea ref={sheetRef} value={sheet} onChange={(e) => setSheet(e.target.value)}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
        spellCheck={false}
        style={{ width: "100%", minHeight: 200, resize: "vertical", background: dragOver ? C.panel2 : "#100d0b", color: C.ink, border: `1px solid ${dragOver ? C.tone : C.line}`, borderRadius: 12, padding: "14px 16px", fontFamily: MONO, fontSize: 13, lineHeight: 1.55, outline: "none", boxSizing: "border-box" }}
        aria-label="chord sheet input" />
      <p style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>
        Paste from Ultimate-Guitar (<code>[ch]</code> tags), ChordPro (<code>[C]lyric</code>), or any plain chords-over-lyrics chart. Slash chords, 7ths, sus, add9, 9/11/13, m7&#9837;5 all welcome. Click any key to hear it alone.
      </p>
    </Faceplate>
  );

  return (
    <div className="bench-root">
      <div className="bench-shell" style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 18px 56px" }}>
        {/* ---- MASTHEAD ---- */}
        <Faceplate screws style={{ padding: "16px 22px", marginBottom: 16 }}>
          <div className="flex items-center justify-between" style={{ gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="engraved" style={{ marginBottom: 5 }}>the piano that thinks in numbers</div>
              <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 36, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, color: C.ink }}>Keylit</h1>
            </div>
            <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap" }}>
              <EnginePill engine={engine} loading={sampleLoading} />
              <RoomTabs value={room} onChange={setRoom} tabs={[
                { id: "learn", label: "Learn", color: C.tone },
                { id: "write", label: "Write", color: C.root },
                { id: "play", label: "Play", color: C.bass },
              ]} />
            </div>
          </div>
        </Faceplate>

        {/* ---- THE DECK — the shared instrument ---- */}
        <Deck style={{ marginBottom: 16, padding: "16px 16px 14px" }}>
          <div className="flex items-center justify-between" style={{ gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ minWidth: 220 }}>
              {room !== "learn" && current ? (
                <div className="flex items-center" style={{ gap: 16 }}>
                  <div key={currentIdx + ":" + chordSymbol(current)} className="kl-pop">
                    <div style={{ fontFamily: MONO, fontSize: 44, fontWeight: 700, lineHeight: 1, color: C.ink, textShadow: `0 0 26px ${C.root}33` }}>{displaySymbol(current, transpose)}</div>
                  </div>
                  <div>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.root }}>{nashville(current, activeKey.tonic)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>{romanNumeral(current, activeKey.tonic)}</span>
                      <FunctionBadge fn={harmonicFunction(current, activeKey.tonic, activeKey.mode)} />
                    </div>
                    <div className="engraved" style={{ marginTop: 6 }}>{current.section || "now playing"} &middot; {currentIdx + 1}/{view.prog.length}</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="engraved" style={{ marginBottom: 5 }}>{room === "learn" ? "studying" : "key"}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1 }}>Key of {keyName}</div>
                </div>
              )}
            </div>

            <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap" }}>
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
              <FunctionVU prog={view.prog} activeKey={activeKey} />
            </div>
          </div>

          {/* the instrument */}
          <div className="key-felt" style={{ padding: "14px 12px 10px" }}>
            <Keyboard roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash} ariaLabel="piano keyboard — the current chord or lesson is lit" />
          </div>

          {/* transport */}
          <div className="flex items-center" style={{ gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
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
                onChange={(e) => setTempo(2400 - (Number(e.target.value) - 600))} style={{ width: 90, accentColor: C.tone }} aria-label="playback speed" />
              <span style={{ fontSize: 11, color: C.faint }}>fast</span>
            </div>
          </div>
        </Deck>

        <ImportModal open={importOpen} onLoad={loadSheet} onClose={() => setImportOpen(false)} />

        {/* song-level tools (not in the Learn room) */}
        {room !== "learn" && (
          <SongTools
            activeKey={activeKey}
            sheet={sheet}
            voicings={audioVoicings}
            tempoMs={tempo}
            onImport={() => setImportOpen(true)}
            onLoadProgression={loadProgression}
            onLoadSheet={loadSheet}
            nowStamp={() => Date.now()}
            midiSupported={isMidiSupported()}
            midiOutputs={midiOutputs}
            midiOutId={midiOutId}
            onPickMidiOut={pickMidiOut}
            onRefreshMidi={refreshMidiOutputs}
          />
        )}

        {/* ================= LEARN ROOM ================= */}
        {room === "learn" && (
          <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)", gap: 16, marginTop: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, alignContent: "start", minWidth: 0 }}>
              <ScaleBuilder tutor={tutor} onIntent={onChipIntent} />
              <DegreeFinder tutor={tutor} onIntent={onChipIntent} />
            </div>
            <div className="bench-side" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, alignContent: "start", minWidth: 0 }}>
              <Faceplate label={`real songs, in numbers · ${keyName}`}>
                {view.prog.length ? (
                  <NumbersRail prog={view.prog} activeKey={activeKey} currentIdx={currentIdx} transpose={transpose} onSelect={selectIdx} compact />
                ) : (
                  <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Load a song in the <b style={{ color: C.ink }}>Play</b> room and it shows up here in all three notations at once.</p>
                )}
              </Faceplate>
              <Faceplate label="the map · circle of fifths">
                <div className="flex justify-center">
                  <KeyWheel prog={view.prog} activeKey={activeKey} currentIdx={currentIdx}
                    onPickTonic={(pc) => setKeyOverride({ tonic: pc, mode: activeKey.mode })} />
                </div>
                <p style={{ color: C.faint, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                  Each step clockwise adds one sharp (F C G D A E B). Going up a 5th here is the same as going down a 4th on the neck.
                </p>
              </Faceplate>
            </div>
          </div>
        )}

        {/* ================= WRITE ROOM ================= */}
        {room === "write" && (
          <>
            {numbersRailPanel}
            <div style={{ marginTop: 14 }}>
              <ChordLab
                prog={view.prog}
                activeKey={activeKey}
                selectedIdx={currentIdx}
                onSelectIdx={selectIdx}
                onAudition={auditionChords}
                onApply={applyLab}
              />
            </div>
            {(labProg || labHistory.length > 0) && (
              <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                <BenchButton onClick={undoLab} disabled={!labHistory.length}><Undo2 size={14} /> Undo edit</BenchButton>
                <button onClick={resetLab} style={{ background: "transparent", color: C.muted, border: "none", fontSize: 12.5, cursor: "pointer" }}>
                  revert to sheet
                </button>
                <span style={{ fontSize: 11.5, color: C.faint }}>edits live here, not in your chord sheet</span>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <CapoAdvisor prog={view.prog} capo={capo} setCapo={setCapo} keyCtx={activeKey} />
            </div>
          </>
        )}

        {/* ================= PLAY ROOM ================= */}
        {room === "play" && (
          <>
            <div className="flex items-center" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              <Segmented label="Keys" value={mode} onChange={(v) => { arm(); setMode(v); }}
                options={[{ v: "shape", t: "Shape" }, { v: "voicing", t: "Voicing" }, { v: "smooth", t: "Smooth" }]} />
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 8px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.1em" }}>Transpose</span>
                <button onClick={() => setTranspose((t) => Math.max(-11, t - 1))} style={miniBtn} aria-label="Transpose down"><Minus size={14} /></button>
                <span style={{ fontFamily: MONO, fontSize: 14, minWidth: 34, textAlign: "center", color: transpose ? C.tone : C.muted }}>{transpose > 0 ? "+" : ""}{transpose}</span>
                <button onClick={() => setTranspose((t) => Math.min(11, t + 1))} style={miniBtn} aria-label="Transpose up"><Plus size={14} /></button>
                {transpose !== 0 && (<button onClick={() => setTranspose(0)} style={{ ...miniBtn, width: "auto", padding: "0 8px", fontSize: 11 }}>reset</button>)}
              </div>
              <BenchButton onClick={runAI} disabled={!view.prog.length || ai.loading} style={{ marginLeft: "auto" }}>
                {ai.loading ? <Loader2 size={15} className="kl-spin" /> : <Sparkles size={15} />} Analyze with Claude
              </BenchButton>
            </div>
            <p style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>
              <b style={{ color: C.muted }}>Shape</b> lights every key in the chord. <b style={{ color: C.muted }}>Voicing</b> shows one close hand position. <b style={{ color: C.muted }}>Smooth</b> voice-leads from the chord before it, so your hands barely move.
            </p>

            {numbersRailPanel}
            {aiPanel}

            {view.unique.length > 0 && (
              <Faceplate label={`chords in this song (${view.unique.length})`} style={{ marginTop: 14 }}>
                <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
                  {view.unique.map((ch, i) => {
                    const active = current && chordSymbol(current) === chordSymbol(ch);
                    return (
                      <button key={i} onClick={() => selectUnique(ch)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "7px 12px", borderRadius: 9, cursor: "pointer", background: active ? C.panel2 : "transparent", border: `1px solid ${active ? C.tone : C.line}` }}>
                        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.ink }}>{displaySymbol(ch, transpose)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{nashville(ch, activeKey.tonic)}</span>
                      </button>
                    );
                  })}
                </div>
              </Faceplate>
            )}

            {chartInput}
          </>
        )}
      </div>

      <style>{`
        .spin{animation:kl-spin 1s linear infinite}
      `}</style>
    </div>
  );
}

/* ================================================================== *
 * SMALL PIECES
 * ================================================================== */
function FunctionBadge({ fn }) {
  const color = FUNCTION_COLOR[fn] || C.faint;
  return (
    <span title={`${FUNCTION_LABEL[fn]} function`}
      style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
        color, border: `1px solid ${color}66`, borderRadius: 6, padding: "1px 6px", textTransform: "uppercase" }}>
      {fn === "?" ? "chr" : fn}
    </span>
  );
}

// Tonic / Subdominant / Dominant "presence" meters for the loaded progression.
function FunctionVU({ prog, activeKey }) {
  const counts = { T: 0, S: 0, D: 0 };
  for (const ch of prog) {
    const f = harmonicFunction(ch, activeKey.tonic, activeKey.mode);
    if (counts[f] !== undefined) counts[f] += 1;
  }
  const max = Math.max(1, counts.T, counts.S, counts.D);
  const items = [["T", C.tone, counts.T], ["S", C.root, counts.S], ["D", C.bass, counts.D]];
  return (
    <div className="flex items-center" style={{ gap: 12 }} title="Tonic / Subdominant / Dominant balance">
      {items.map(([k, color, n]) => (
        <div key={k} className="flex items-center" style={{ gap: 5 }}>
          <Vu level={Math.round((n / max) * 5)} color={color} />
          <span style={{ fontFamily: MONO, fontSize: 10, color, fontWeight: 700 }}>{k}</span>
        </div>
      ))}
    </div>
  );
}

const miniBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 7, background: "#2a241e",
  color: "#ece6dd", border: "1px solid #3a322a", cursor: "pointer",
};
const selStyle = {
  background: "#2a241e", color: "#ece6dd", border: "1px solid #3a322a",
  borderRadius: 7, padding: "4px 6px", fontSize: 13, fontFamily: MONO, cursor: "pointer",
};

function EnginePill({ engine, loading }) {
  const label = engine === "piano" ? "Sampled grand piano"
    : engine === "synth" ? (loading ? "Synth · loading piano…" : "Synth")
    : "Audio ready on first note";
  const color = engine === "piano" ? C.tone : engine === "synth" ? C.root : C.faint;
  return (
    <div className="eng-pill">
      {loading ? <Loader2 size={14} className="kl-spin" /> : <Piano size={14} />}
      <span style={{ color }}>{label}</span>
    </div>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "5px 6px" }}>
      <span style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.1em", paddingLeft: 4 }}>{label}</span>
      <div style={{ display: "inline-flex", gap: 2 }}>
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button key={o.v} onClick={() => onChange(o.v)}
              style={{ padding: "5px 11px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: active ? C.tone : "transparent", color: active ? "#06201d" : C.muted }}>
              {o.t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IconButton({ children, onClick, disabled, label, active }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "#1d1916", color: active ? "#46cfc2" : "#ece6dd", border: "1px solid #322b24", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}
