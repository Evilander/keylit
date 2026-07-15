import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX,
  RotateCcw, Upload, Minus, Plus, Loader2, Undo2, Lightbulb,
} from "lucide-react";
import {
  SHARP_NAMES, parseSheet, transposeChord, chordSymbol, displaySymbol,
  nashville, romanNumeral, detectKey, CIRCLE_OF_FIFTHS, sameChordSound, detectCapo,
  suggestCapo,
} from "./lib/theory.js";
import { rootPositionFull, smoothUpper, addBass, clampVoicing } from "./lib/voicing.js";
import { analyzeSheet } from "./lib/llm.js";
import { respell, spellChord, spellPc } from "./lib/spelling.js";
import { wheelMoves } from "./lib/voice.js";
import { progressionOfTheDay } from "./lib/potd.js";
import { isMidiSupported, requestMidi, listOutputs, sendChordToOutput, allNotesOff } from "./webmidi.js";
import { useAudioEngine } from "./audio/useAudioEngine.js";
import { C, MONO, DISPLAY, applyTheme, currentTheme } from "./ui/theme.js";
import { EngLabel, Readout, BenchButton, QuoteLine } from "./ui/Bench.jsx";
import { shuffledQuotes } from "./lib/quotes.js";
import { loadSong, SOURCE_LABEL } from "./corpus.js";
import Keyboard from "./components/Keyboard.jsx";
import NumbersRail from "./components/NumbersRail.jsx";
import ScaleBuilder from "./components/ScaleBuilder.jsx";
import DegreeFinder from "./components/DegreeFinder.jsx";
import MeterFeel from "./components/MeterFeel.jsx";
import PedalLab from "./components/PedalLab.jsx";
import ChordLab from "./components/ChordLab.jsx";
import KeyWheel from "./components/KeyWheel.jsx";
import CapoTuning from "./components/CapoTuning.jsx";
import SongTools from "./components/SongTools.jsx";
import ImportModal from "./components/ImportModal.jsx";
import AddToSetlist from "./components/AddToSetlist.jsx";
import ChartView from "./components/ChartView.jsx";
import SongGrips from "./components/SongGrips.jsx";
import Library from "./components/Library.jsx";
import Practice from "./components/Practice.jsx";
import TabKeys from "./components/TabKeys.jsx";
import PlayAlong from "./components/PlayAlong.jsx";
import BenchBook from "./components/BenchBook.jsx";
import ChordBook from "./components/ChordBook.jsx";
import Shed from "./components/Shed.jsx";
import Arranger from "./components/Arranger.jsx";
import { ShareChart, HandedBanner } from "./components/ShareChart.jsx";
import { benchBook, userSongbook } from "./storage.js";
import { slugSongKey } from "./lib/bench.js";
import { decodeShare } from "./lib/sharelink.js";
import { buildUserSong } from "./lib/usersong.js";
import { chartShiftForGuitar, STANDARD_TUNING, TUNINGS, uniformTuningOffset } from "./lib/tuning.js";
import GuitarSetup from "./components/GuitarSetup.jsx";

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
  { id: "library", label: "Library" },
  { id: "song", label: "Song" },
  { id: "piano", label: "Piano" },
  { id: "theory", label: "Theory" },
  { id: "learn", label: "Learn" },
  { id: "write", label: "Write" },
  { id: "practice", label: "Practice" },
  { id: "chords", label: "Chordbook" },
  { id: "shed", label: "The Shed" },
];

// One shuffle per login: every room draws a different borrowed line, and
// tomorrow's login deals a different hand. Index by room, never re-pick.
const QUOTE_DECK = shuffledQuotes();
const ROOM_QUOTE = { library: 0, learn: 1, theory: 2, write: 3, practice: 4, chords: 5 };
const roomQuote = (id) => QUOTE_DECK[ROOM_QUOTE[id] % QUOTE_DECK.length];

const GUITAR_TUNING_KEY = "keylit.guitar-tuning.v1";
const CHART_SPELLING_KEY = "keylit.chart-spelling.v2";
const LEGACY_SPELLING_KEY = "keylit.chart-spelling.v1";
const GUITAR_TUNINGS = new Set(["standard", "ebStandard", "dStandard"]);
const CHART_SPELLINGS = new Set(["guitar", "key", "flats", "sharps"]);

function savedChoice(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (allowed.has(value)) return value;
  } catch { /* storage is optional */ }
  return fallback;
}

// v1 auto-persisted its "guitar" default on first paint, so a stored "guitar"
// was never evidence of a choice. v2 defaults to sharps (the fretboard dialect:
// G#, C#7, D#); only a v1 value someone actually clicked away carries over.
function savedSpelling() {
  const v2 = savedChoice(CHART_SPELLING_KEY, CHART_SPELLINGS, null);
  if (v2) return v2;
  const v1 = savedChoice(LEGACY_SPELLING_KEY, CHART_SPELLINGS, null);
  return v1 && v1 !== "guitar" ? v1 : "sharps";
}

function persistChoice(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage is optional */ }
}

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
  // Light "Fretboard Press" or dark "After Hours" — applyTheme mutates the
  // live C palette + flips the CSS layer; this state change repaints the tree.
  const [theme, setTheme] = useState(() => applyTheme(currentTheme()));
  const toggleTheme = () => setTheme((t) => applyTheme(t === "dark" ? "light" : "dark"));
  // "Cover it capo'd": null = read the chart as written; a number = re-render
  // the chart as the shapes you'd finger with a capo there (sound unchanged).
  const [playCapo, setPlayCapo] = useState(null);
  // The physical guitar is a playing lens, not a song transpose. D standard
  // moves familiar shapes +2 while the piano and playback stay at concert pitch.
  const [guitarTuning, setGuitarTuning] = useState(() => savedChoice(GUITAR_TUNING_KEY, GUITAR_TUNINGS, "standard"));
  const [chartSpelling, setChartSpelling] = useState(savedSpelling);
  // Opened from a setlist: { name, rows, idx } drives the gig strip (prev/next).
  const [setlistCtx, setSetlistCtx] = useState(null);

  const armedRef = useRef(false);
  const stripRef = useRef(null);
  const audioVoicingRef = useRef([]);
  const sheetRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);
  const [handed, setHanded] = useState(null);
  const [handedKept, setHandedKept] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState([]);
  const [midiOutId, setMidiOutId] = useState("");
  const midiOutRef = useRef(null);

  useEffect(() => persistChoice(GUITAR_TUNING_KEY, guitarTuning), [guitarTuning]);
  useEffect(() => persistChoice(CHART_SPELLING_KEY, chartSpelling), [chartSpelling]);

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
    setSheet(s); setCurrentIdx(0); setIsPlaying(false); setTranspose(0); setKeyOverride(null); setPlayCapo(null);
  };

  const openSong = useCallback(async (entry, ctx = null) => {
    const song = await loadSong(entry);
    if (!song) return;
    // Keep the id: setlist records need source+id to stay resolvable later.
    setLoaded({ id: song.id ?? entry.id, title: song.title, artist: song.artist, source: song.source, sourceUrl: song.sourceUrl, tuning: song.tuning, tuningRaw: song.tuningRaw, capo: song.capo, key: song.key, format: song.format });
    loadSheet(song.body || "");
    setSetlistCtx(ctx); // opened outside a setlist clears the gig strip
    setSection("song");
  }, []);

  // A chart handed over in the URL fragment (#s=…) — it never touched a server.
  useEffect(() => {
    const data = decodeShare(window.location.hash);
    if (!data) return;
    setLoaded({ title: data.title || "Untitled chart", artist: data.artist || null, source: "shared", tuning: data.tuning, tuningRaw: data.tuning, capo: data.capo, key: data.key });
    loadSheet(data.body);
    setHanded(data);
    setSection("song");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keepHanded = () => {
    if (!handed) return;
    const built = buildUserSong({
      artist: handed.artist || "", title: handed.title || "Untitled",
      album: "", key: handed.key || "", capo: handed.capo != null ? String(handed.capo) : "",
      tuning: handed.tuning || "", body: handed.body,
    }, Date.now());
    if (built.error) return;
    userSongbook.save(built.song, built.row);
    setHandedKept(true);
  };

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

  const computeView = (shift, spelling = "key") => {
    const raw = sourceProg.map((ch) => transposeChord(ch, shift));
    const detected = detectKey(raw);
    const keyCtx = keyOverride
      ? { tonic: ((keyOverride.tonic + (shift - transpose)) % 12 + 12) % 12, mode: keyOverride.mode, spelling }
      : { tonic: detected.tonic, mode: detected.mode, spelling };
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
    return { prog, unique, rootFull, smoothFull, detected, keyCtx };
  };
  // Every reading/playing surface speaks the user's chord-name dialect
  // (sharps by default); the Theory & Learn rooms keep proper key spelling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => computeView(transpose, chartSpelling), [sourceProg, transpose, keyOverride, chartSpelling]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sounding = useMemo(
    () => (capoShift ? computeView(pitchShift, chartSpelling) : null),
    [sourceProg, pitchShift, keyOverride, capoShift, chartSpelling]
  );
  const soundingView = sounding || view;

  useEffect(() => {
    setCurrentIdx((i) => (view.prog.length ? Math.min(i, view.prog.length - 1) : 0));
  }, [view.prog.length]);

  // Reading is a guitar-shape lens over concert pitch. A capo raises shapes;
  // a uniformly detuned guitar lowers them. Solve the inverse so the chart can
  // move while the piano/audio stay exactly where the song sounds.
  const effectiveCapo = playCapo ?? capoShift;
  const readingShift = chartShiftForGuitar({
    transpose,
    sourceCapo: capoShift,
    capo: effectiveCapo,
    tuning: guitarTuning,
  }) ?? transpose;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const readingView = useMemo(
    () => (readingShift === transpose ? view : computeView(readingShift, chartSpelling)),
    [view, readingShift, chartSpelling, sourceProg, keyOverride, transpose]
  );
  const readingKey = readingView.keyCtx;
  // Where the capo makes the shapes easiest, judged on the SOUNDING chords.
  const capoBest = useMemo(() => {
    if (!soundingView.prog.length) return null;
    const best = suggestCapo(soundingView.prog)[0];
    return best ? best.fret : null;
  }, [soundingView]);

  const current = view.prog[currentIdx] || null;
  const shapeCurrent = readingView.prog[currentIdx] || null;
  const soundingCurrent = soundingView.prog[currentIdx] || null;
  const activeKey = keyOverride || { tonic: view.detected.tonic, mode: view.detected.mode };
  const soundingKey = { tonic: soundingView.detected.tonic, mode: soundingView.detected.mode };
  // activeKey + the chord-name dialect: for surfaces that DISPLAY chord symbols
  // (ChordLab). Key names and the tutor keep plain, key-aware spelling.
  const namedKey = useMemo(() => ({ ...activeKey, spelling: chartSpelling }),
    [activeKey.tonic, activeKey.mode, chartSpelling]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // While the Arranger drives the lights, the pad walker keeps quiet.
  const arrangingRef = useRef(false);
  useEffect(() => {
    if (armedRef.current && !arrangingRef.current) ensureAndPlay(audioVoicingRef.current[currentIdx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, mode, pitchShift]);

  // The day's deal for the Library card — date-seeded, so it's the same hand
  // all day and a new one tomorrow. Spelled in the user's chord-name dialect.
  const potd = useMemo(
    () => progressionOfTheDay(new Date().toISOString().slice(0, 10), { spelling: chartSpelling }),
    [chartSpelling]
  );

  const arrangementRef = useRef(null);
  // One stage, one act: whoever starts timed playback displaces whoever held
  // it. The displaced owner's `onCancel` fires so its UI resets (an Arranger
  // stuck on "Stop", a tap run that will never score) instead of going stale.
  const stopArrangement = useCallback(() => {
    const prev = arrangementRef.current;
    arrangementRef.current = null;
    arrangingRef.current = false;
    if (prev) { prev.stop(); prev.onCancel?.(); }
  }, []);
  const startArrangement = useCallback(async (payload, opts = {}) => {
    armedRef.current = true;
    await audio.init();
    setIsPlaying(false);
    stopArrangement();
    arrangingRef.current = true;
    let wrapped;
    const h = audio.playEvents(payload, {
      ...opts,
      onDone: () => {
        arrangingRef.current = false;
        // A finished run vacates the stage — otherwise the next surface to
        // start would fire this owner's onCancel and wipe its finished UI
        // (a Meter Feel score, for one).
        if (arrangementRef.current === wrapped) arrangementRef.current = null;
        opts.onDone?.();
      },
    });
    // Keep the handle's clock fields (startTime / secondsPerBeat) — the Meter
    // Feel Trainer scores taps against the same clock the drummer plays on.
    wrapped = {
      ...h,
      onCancel: opts.onCancel,
      stop: () => {
        h.stop();
        arrangingRef.current = false;
        // A self-stop is not a takeover — clear the slot without onCancel.
        if (arrangementRef.current === wrapped) arrangementRef.current = null;
      },
    };
    arrangementRef.current = wrapped;
    return wrapped;
  }, [audio, stopArrangement]);

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

  // Browser-grade back: every room change is a history entry, so the mouse's
  // back button (and the ← in the topbar) walks the trail instead of needing
  // the side panel. popstate restores without re-pushing.
  const popNavRef = useRef(false);
  useEffect(() => {
    if (popNavRef.current) { popNavRef.current = false; return; }
    if (window.history.state?.klSection === section) return;
    try { window.history.pushState({ klSection: section }, ""); } catch { /* sandboxed shell */ }
  }, [section]);
  useEffect(() => {
    const onPop = (e) => {
      const s = e.state?.klSection;
      if (!s) return;
      popNavRef.current = true;
      setSection(s);
    };
    window.addEventListener("popstate", onPop);
    try { window.history.replaceState({ klSection: "library" }, ""); } catch { /* noop */ }
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
  const togglePlay = () => { arm(); stopArrangement(); if (!isPlaying && currentIdx >= view.prog.length - 1) setCurrentIdx(0); setIsPlaying((p) => !p); };
  const playSingleKey = (midi) => { arm(); ensureAndPlay([midi], 1.0); setFlash(new Set([midi])); setTimeout(() => setFlash(new Set()), 260); };

  // A chord clicked (or heard from the hover card) in the chart: land the
  // piano there and SOUND it — even when it's already the current chord (the
  // currentIdx effect only fires on change, which used to leave a re-click
  // silent). Chords outside the parsed progression play at sounding pitch.
  const hearReadingChord = useCallback((ch) => {
    arm();
    const i = readingView.prog.findIndex((c) => sameChordSound(c, ch));
    if (i >= 0) {
      setIsPlaying(false);
      if (i === currentIdx) ensureAndPlay(audioVoicingRef.current[i]);
      else setCurrentIdx(i);
    } else {
      ensureAndPlay(rootPositionFull(transposeChord(ch, pitchShift - readingShift)), 1.4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingView, currentIdx, ensureAndPlay, pitchShift, readingShift]);

  // The hover card's strum: the guitar voicing rolled low string to high,
  // through whatever instrument is loaded. 58ms per string ≈ a relaxed strum.
  const strumNotes = useCallback((midis) => {
    arm();
    midis.forEach((m, i) => setTimeout(() => ensureAndPlay([m], 1.9 - i * 0.08), i * 58));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureAndPlay]);

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
  const shapeKeyName = `${spellPc(readingKey.tonic, readingKey)} ${readingKey.mode}`;
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
    // Timed playback for Learn modules with a groove (Meter Feel, Pedal Lab):
    // same beat scheduler the Arranger uses, same stop-everything discipline.
    playEvents: startArrangement,
    now: () => audio.now(),
  };

  /* ---------- play-along + bench book plumbing ---------- */
  const songKey = useMemo(
    () => (loaded ? slugSongKey(loaded.artist, loaded.title) : "untitled-chart"),
    [loaded]
  );
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
  const useDetunedSetup = (id) => {
    setGuitarTuning(id);
    if (keyOverride && transpose) {
      setKeyOverride({
        ...keyOverride,
        tonic: ((keyOverride.tonic - transpose) % 12 + 12) % 12,
      });
    }
    setTranspose(0);
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
    <div style={{ border: `1.5px solid ${C.lineStrong}`, borderRadius: 999, padding: "6px 8px 6px 16px", display: "inline-flex", alignItems: "center", gap: 10 }}
      title="Moves the song's concert pitch. To compensate for a down-tuned guitar without moving the song, use Guitar setup below.">
      <span className="kl-eyebrow">Transpose</span>
      <button onClick={() => setTranspose((t) => Math.max(-11, t - 1))} style={miniBtn} aria-label="Transpose down"><Minus size={14} /></button>
      <span style={{ fontFamily: MONO, fontSize: 13, minWidth: 30, textAlign: "center", color: transpose ? C.rootText : C.muted }}>{transpose > 0 ? "+" : ""}{transpose}</span>
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
          onChange={(e) => setTempo(2400 - (Number(e.target.value) - 600))} style={{ width: 110, accentColor: C.root }} aria-label="playback speed" />
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

  // The guitar lens the Song room reads through, shared by the chart's hover
  // grips and the Grips strip. A uniformly detuned guitar fingers familiar
  // STANDARD shapes (the reading chord already carries the shift); a drop/
  // open tuning must search its own fretboard or the frets would lie.
  const guitarLens = useMemo(() => ({
    shapeTuning: uniformTuningOffset(guitarTuning) != null
      ? STANDARD_TUNING
      : (TUNINGS[guitarTuning] || TUNINGS.standard).notes,
    strumTuning: (TUNINGS[guitarTuning] || TUNINGS.standard).notes,
    strumCapo: effectiveCapo,
    onStrum: strumNotes,
  }), [guitarTuning, effectiveCapo, strumNotes]);

  const makeNumbersRail = (railView, railKey, shift, label, hint) => railView.prog.length > 0 && (
    <section style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 12 }}>
        <span className="kl-eyebrow">Progression · {label}</span>
        <span className="kl-eyebrow" style={{ color: C.faint, textAlign: "right" }}>{hint}</span>
      </div>
      <div ref={stripRef}>
        <NumbersRail prog={railView.prog} activeKey={railKey} currentIdx={currentIdx} transpose={shift} onSelect={selectIdx} />
      </div>
    </section>
  );
  const numbersRailPanel = makeNumbersRail(view, activeKey, transpose, keyName, "the numbers stay · the key moves");
  const songNumbersRailPanel = makeNumbersRail(readingView, readingKey, readingShift, shapeKeyName, "the numbers stay · shapes follow your setup");

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
      {/* ---- TOP BAR: brand · room tabs · key readout · theme pill ---- */}
      <header className="kl-topnav">
        <div className="kl-wordmark">Keylit<b>.</b></div>
        <nav className="kl-roomtabs" aria-label="Rooms">
          {NAV.map((n) => (
            <button key={n.id} className="kl-roomtab" aria-current={section === n.id} onClick={() => setSection(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16, flex: "0 0 auto", minWidth: 0 }}>
          <EnginePill engine={engineState.engine} loading={engineState.loading} />
          <span className="kl-hide-sm" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
            color: transpose || keyOverride ? C.rootText : C.faint,
            maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Key of {keyNameFull}
          </span>
          <button onClick={toggleTheme}
            aria-label={theme === "dark" ? "back to daylight" : "lamps low"}
            title={theme === "dark" ? "Back to daylight" : "Lamps low"}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10,
              letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "transparent",
              border: `1.5px solid ${C.line}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme === "dark" ? C.bass : C.root, transition: "background 300ms" }} />
            {theme === "dark" ? "After hours" : "Daylight"}
          </button>
        </div>
      </header>

      {/* ---- THE ROOM ---- */}
      <main className="kl-main">
        <div className={`kl-content${section === "library" || section === "song" ? "" : " wide"}`}>
          {section === "library" && (
            <Library onOpen={openSong}
              quote={roomQuote("library")}
              potd={potd}
              onPotd={(action) => {
                arm();
                if (action === "hear") { auditionChords(potd.chords); return; }
                setLoaded({ title: `${potd.name} — progression of the day`, artist: null, source: "spark", key: potd.keyName });
                loadSheet(`[${potd.name} · ${potd.keyName}]\n${potd.sheet}`);
                setSetlistCtx(null);
                setSection("song");
              }}
              onSetlist={() => { setPracticeTab("bench"); setSection("practice"); }}
              onPaste={() => { setSection("song"); setImportOpen(true); }}
              onDemo={() => { setLoaded(null); loadSheet(DEFAULT_SHEET); setSection("song"); }}
              onHeard={(sheetText, title) => {
                setLoaded({ title: title || "Heard from audio", artist: null, source: "ear" });
                loadSheet(sheetText);
                setSection("song");
              }} />
          )}

          {section === "song" && (
            <div className="kl-section">
              <HandedBanner handed={handed} kept={handedKept} onKeep={keepHanded} onDismiss={() => setHanded(null)} />
              {setlistCtx && setlistCtx.rows?.length > 0 && (
                <div className="flex items-center" style={{ gap: 10, marginBottom: 12, padding: "7px 12px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10 }}>
                  <span className="kl-eyebrow" style={{ whiteSpace: "nowrap" }}>{setlistCtx.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{setlistCtx.idx + 1} / {setlistCtx.rows.length}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {setlistCtx.rows[setlistCtx.idx + 1] ? <>next: {setlistCtx.rows[setlistCtx.idx + 1].title}</> : "last one — bring it home"}
                  </span>
                  <button onClick={() => openSong(setlistCtx.rows[setlistCtx.idx - 1], { ...setlistCtx, idx: setlistCtx.idx - 1 })}
                    disabled={setlistCtx.idx === 0} aria-label="previous song in setlist"
                    style={{ ...navChip, opacity: setlistCtx.idx === 0 ? 0.35 : 1 }}><ChevronLeft size={14} /></button>
                  <button onClick={() => openSong(setlistCtx.rows[setlistCtx.idx + 1], { ...setlistCtx, idx: setlistCtx.idx + 1 })}
                    disabled={setlistCtx.idx >= setlistCtx.rows.length - 1} aria-label="next song in setlist"
                    style={{ ...navChip, opacity: setlistCtx.idx >= setlistCtx.rows.length - 1 ? 0.35 : 1 }}><ChevronRight size={14} /></button>
                </div>
              )}
              <SongHeader loaded={loaded} keyName={keyNameFull} />
              <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", margin: "14px 0 4px" }}>
                {transposeCtl}
                {keyPicker}
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {/* Only songs with a source+id make live setlist entries;
                      pasted/shared/ear charts would leave dead rows. */}
                  {loaded?.id != null && <AddToSetlist song={loaded} />}
                  {sheet.trim() && (!loaded || loaded.source === "user" || loaded.source === "shared" || loaded.source === "ear") && (
                    <ShareChart data={{
                      title: loaded?.title || "Untitled chart", artist: loaded?.artist || undefined,
                      body: sheet, key: loaded?.key || undefined, capo: loaded?.capo || undefined,
                      tuning: loaded?.tuningRaw || loaded?.tuning || undefined,
                    }} />
                  )}
                  <BenchButton onClick={runAI} disabled={!view.prog.length || ai.loading}>
                    {ai.loading ? <Loader2 size={15} className="kl-spin" /> : <Lightbulb size={15} />} Read the harmony
                  </BenchButton>
                </span>
              </div>
              <GuitarSetup
                tuningId={guitarTuning}
                onTuningChange={setGuitarTuning}
                capo={effectiveCapo}
                chartCapo={capoShift}
                onCapoChange={setPlayCapo}
                onResetCapo={() => setPlayCapo(null)}
                bestCapo={capoBest}
                spelling={chartSpelling}
                onSpellingChange={setChartSpelling}
                shapeChord={shapeCurrent}
                soundingChord={soundingCurrent}
                shapeKey={readingKey}
                soundingKey={soundingKey}
                transpose={transpose}
                onUseDetunedSetup={useDetunedSetup}
              />
              {songNumbersRailPanel}
              {aiPanel}
              {tabKeysPanel}
              <SongGrips chords={readingView.unique} activeKey={readingKey}
                shapeTuning={guitarLens.shapeTuning}
                strumTuning={guitarLens.strumTuning} strumCapo={guitarLens.strumCapo}
                onStrum={strumNotes} />
              <section style={{ marginTop: 18 }}>
                <ChartView text={sheet} activeKey={readingKey} transpose={readingShift}
                  activeChord={readingView.prog[currentIdx] || null}
                  onChordClick={hearReadingChord}
                  guitar={guitarLens} />
              </section>
              {chartInput}
            </div>
          )}

          {section === "piano" && (
            <div className="kl-section">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 320 }}>
                  <div className="kl-eyebrow faint">The instrument</div>
                  {soundingCurrent ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
                        <div key={currentIdx + chordSymbol(soundingCurrent)} className="kl-noteswap"
                          style={{ fontFamily: MONO, fontSize: "clamp(44px, 8vw, 88px)", fontWeight: 600, lineHeight: 0.95, letterSpacing: "-0.02em", color: C.ink }}>
                          {displaySymbol(soundingCurrent, pitchShift)}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                            <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: C.root }}>{nashville(soundingCurrent, soundingKey.tonic)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 16, color: C.toneText }}>{romanNumeral(soundingCurrent, soundingKey.tonic)}</span>
                          </div>
                          <div className="kl-eyebrow faint" style={{ marginTop: 10 }}>
                            {soundingCurrent.section || "now playing"} · {currentIdx + 1} / {view.prog.length}
                            {capoShift > 0 && current && <> · written {displaySymbol(current, transpose)} (capo {capoShift})</>}
                          </div>
                        </div>
                      </div>
                      {soundingView.unique.length > 0 && (
                        <div style={{ marginTop: 26, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {soundingView.unique.map((ch, i) => {
                            const active = soundingCurrent && chordSymbol(soundingCurrent) === chordSymbol(ch);
                            const shown = displaySymbol(ch, pitchShift);
                            const piano = spellChord(ch, soundingKey);
                            return (
                              <button key={i} onClick={() => selectUnique(ch, soundingView.prog)}
                                title={piano !== shown ? `piano says ${piano}` : undefined}
                                style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2,
                                  fontFamily: MONO, padding: "9px 15px", borderRadius: 12, cursor: "pointer",
                                  transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
                                  border: `1.5px solid ${active ? C.ink : C.lineStrong}`,
                                  background: active ? C.ink : "transparent",
                                  color: active ? "var(--kl-on-ink)" : C.ink }}>
                                <span style={{ fontSize: 14, fontWeight: 600 }}>{shown}</span>
                                <span style={{ fontSize: 10, opacity: 0.6 }}>{nashville(ch, soundingKey.tonic)}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ marginTop: 14 }}>
                      <h1 className="kl-title">Nothing on the stand yet.</h1>
                      <div className="flex items-center" style={{ gap: 8, marginTop: 16 }}>
                        <BenchButton onClick={() => setSection("library")}>Pick from the Library</BenchButton>
                        <BenchButton onClick={() => setImportOpen(true)}>Paste a chart or tab</BenchButton>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-end" }}>
                  <Segmented label="Keys" value={mode} onChange={(v) => { arm(); setMode(v); }}
                    options={[{ v: "shape", t: "Shape" }, { v: "voicing", t: "Voicing" }, { v: "smooth", t: "Smooth" }]} />
                  {transport}
                </div>
              </div>
              <div className="deck" style={{ padding: "16px 18px", marginTop: 24 }}>
                <Keyboard height={210} roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash}
                  ariaLabel="piano keyboard — the current chord is lit" />
              </div>
              <p style={{ color: C.faint, fontSize: 12.5, marginTop: 18, maxWidth: 620 }}>
                <b style={{ color: C.muted }}>Shape</b> lights every note of the chord across the deck. <b style={{ color: C.muted }}>Voicing</b> shows one close hand position. <b style={{ color: C.muted }}>Smooth</b> voice-leads from the chord before it — the least your hand can move.
              </p>
              <Arranger prog={soundingView.prog} title={loaded?.title || "your chart"}
                onStart={startArrangement} onStepIdx={setCurrentIdx} />
              {tabKeysPanel}
            </div>
          )}

          {section === "theory" && (
            <div className="kl-section">
              <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div className="kl-eyebrow">The map</div>
                  <h1 className="kl-title" style={{ marginTop: 4 }}>Theory</h1>
                  <QuoteLine quote={roomQuote("theory")} style={{ marginTop: 10 }} />
                </div>
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
                          <span style={{ fontFamily: DISPLAY, fontSize: 17, color: C.ink }}>{mv.title}</span>
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
              <div className="kl-eyebrow faint">The theory tutor</div>
              <h1 className="kl-title" style={{ marginTop: 12, marginBottom: 0, maxWidth: 760 }}>{roomQuote("learn").q}</h1>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", color: C.muted, marginTop: 12 }}>— {roomQuote("learn").by}</div>
              <div className="deck" style={{ padding: "14px 16px", margin: "24px 0 18px" }}>
                <Keyboard height={150} roleFor={roleForKeyboard} onKey={playSingleKey} flash={flash}
                  ariaLabel="piano keyboard — the lesson is lit" />
              </div>
              <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}>
                <ScaleBuilder tutor={tutor} onIntent={onChipIntent} />
                <DegreeFinder tutor={tutor} onIntent={onChipIntent} />
                <MeterFeel tutor={tutor} />
                <PedalLab tutor={tutor} onIntent={onChipIntent} />
              </div>
            </div>
          )}

          {section === "write" && (
            <div className="kl-section">
              <div className="kl-eyebrow">The desk</div>
              <h1 className="kl-title" style={{ marginTop: 4 }}>Write</h1>
              <QuoteLine quote={roomQuote("write")} style={{ margin: "10px 0 16px" }} />
              <SongTools
                activeKey={activeKey} sheet={sheet} voicings={audioVoicings} tempoMs={tempo}
                onImport={() => setImportOpen(true)} onLoadProgression={loadProgression} onLoadSheet={(s) => { setLoaded(null); loadSheet(s); }}
                nowStamp={() => Date.now()} midiSupported={isMidiSupported()} midiOutputs={midiOutputs} midiOutId={midiOutId}
                onPickMidiOut={pickMidiOut} onRefreshMidi={refreshMidiOutputs} />
              {numbersRailPanel}
              <div style={{ marginTop: 18 }}>
                <ChordLab prog={view.prog} activeKey={namedKey} selectedIdx={currentIdx} onSelectIdx={selectIdx} onAudition={auditionChords} onApply={applyLab} />
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
              <QuoteLine quote={roomQuote("practice")} size={18} style={{ marginBottom: 16 }} />
              <div className="kl-seg" role="tablist" aria-label="Practice area" style={{ marginBottom: 6 }}>
                <button role="tab" aria-selected={practiceTab === "drills"} onClick={() => setPracticeTab("drills")}>Drills</button>
                <button role="tab" aria-selected={practiceTab === "song"} onClick={() => setPracticeTab("song")}>Play the song</button>
                <button role="tab" aria-selected={practiceTab === "bench"} onClick={() => setPracticeTab("bench")}>Bench Book</button>
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
              {practiceTab === "bench" && <BenchBook onOpen={openSong} />}
            </div>
          )}

          {section === "chords" && (
            <ChordBook tuningId={guitarTuning} spelling={chartSpelling}
              quote={roomQuote("chords")} onStrum={strumNotes}
              onPlay={(midis, dur) => { arm(); ensureAndPlay(midis, dur); }} />
          )}

          {section === "shed" && <Shed />}
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
  const bits = [loaded.artist, `key of ${keyName}`].filter(Boolean);
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
  width: 26, height: 26, borderRadius: "50%", background: "transparent",
  color: C.ink, border: `1.5px solid ${C.lineStrong}`, cursor: "pointer",
};
const navChip = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 8, background: C.panel2,
  color: C.ink, border: `1px solid ${C.line}`, cursor: "pointer", flex: "0 0 auto",
};
const selStyle = {
  background: C.panel, color: C.ink, border: `1px solid ${C.line}`,
  borderRadius: 7, padding: "4px 6px", fontSize: 13, fontFamily: MONO, cursor: "pointer",
};

// Lives in the top bar: a quiet mono readout of what instrument will speak.
function EnginePill({ engine, loading }) {
  const label = engine === "piano" ? "sampled grand" : engine === "synth" ? (loading ? "synth · loading piano…" : "synth") : "audio on first note";
  return (
    <span className="kl-hide-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint, whiteSpace: "nowrap" }}>
      {loading && <Loader2 size={11} className="kl-spin" />}
      {label}
    </span>
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
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", background: "transparent", color: active ? C.toneText : C.ink, border: `1.5px solid ${C.lineStrong}`, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}
