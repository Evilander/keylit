// PlayAlong.jsx — "Keylit hears YOU": wait-mode walking of a song, driven by
// a MIDI keyboard (or mouse clicks — the embed has no hardware). The pure
// matching brain is lib/playalong.js; this file is hands, lights and score.
// Ghost keys = what to play · solid = held right · coral = held wrong.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Piano as PianoIcon, RotateCcw, SkipForward, Repeat, ListMusic } from "lucide-react";
import { createRun, summarize, buildTabSteps } from "../lib/playalong.js";
import { parseTab, hasTab } from "../lib/tab.js";
import { fingerEvents } from "../lib/fingering.js";
import { isMidiSupported, requestMidi, listInputs, watchInputs } from "../webmidi.js";
import { midiName, midiOctave } from "../lib/voicing.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (n) => BLACK.has(((n % 12) + 12) % 12);
const noteName = (m) => `${midiName(m)}${midiOctave(m)}`;

function Chip({ on, onClick, children, title }) {
  return (
    <button onClick={onClick} aria-pressed={on} title={title}
      style={{ fontSize: 12, fontFamily: "var(--kl-sans)", padding: "5px 11px", borderRadius: 999, cursor: "pointer",
        background: on ? C.panel2 : "transparent", color: on ? C.ink : C.muted,
        border: `1px solid ${on ? C.toneUi : C.line}` }}>
      {children}
    </button>
  );
}

export default function PlayAlong({
  title, artist, songKey, prog, rootVoicings, smoothVoicings,
  sheet, tuning, tuningRaw, capo = 0, shift = 0,
  labelFor, onPlay, onScore, onPickSong,
}) {
  const [material, setMaterial] = useState("chords");   // chords | tab
  const [voicingKind, setVoicingKind] = useState("root");
  const [octaveStrict, setOctaveStrict] = useState(false);
  const [allowExtra, setAllowExtra] = useState(false);
  const [sectionPick, setSectionPick] = useState("");
  const [loop, setLoop] = useState(false);
  const [midiState, setMidiState] = useState({ status: "idle", inputs: [] }); // idle|on|denied
  const [heldView, setHeldView] = useState(new Set());
  const [score, setScore] = useState(null);
  const [, setTick] = useState(0);

  const tabAvailable = useMemo(() => hasTab(sheet || ""), [sheet]);

  const chordSteps = useMemo(() => {
    const voicings = voicingKind === "smooth" ? smoothVoicings : rootVoicings;
    const out = [];
    for (let i = 0; i < (prog?.length || 0); i++) {
      const notes = voicings?.[i] || [];
      if (!notes.length) continue;
      out.push({ notes: [...notes], label: labelFor ? labelFor(prog[i], i) : null, section: prog[i].section || null, rootPc: ((prog[i].rootSemitone % 12) + 12) % 12 });
    }
    return out;
  }, [prog, rootVoicings, smoothVoicings, voicingKind, labelFor]);

  const tabSteps = useMemo(() => {
    if (!tabAvailable) return [];
    const parsed = parseTab(sheet, { defaultTuning: tuningRaw || tuning, capo });
    return buildTabSteps(fingerEvents(parsed.events, shift));
  }, [tabAvailable, sheet, tuning, tuningRaw, capo, shift]);

  const allSteps = material === "tab" && tabAvailable ? tabSteps : chordSteps;
  const sections = useMemo(() => {
    const seen = [];
    for (const s of allSteps) if (s.section && !seen.includes(s.section)) seen.push(s.section);
    return seen;
  }, [allSteps]);
  const steps = useMemo(
    () => (sectionPick ? allSteps.filter((s) => s.section === sectionPick) : allSteps),
    [allSteps, sectionPick]
  );

  /* ---- the run + one shared held-set (MIDI hands and mouse clicks) ---- */
  const runRef = useRef(null);
  const heldRef = useRef(new Set());
  const scoredRef = useRef(false);

  useEffect(() => {
    runRef.current = createRun(steps, { octaveStrict, allowExtra });
    scoredRef.current = false;
    setScore(null);
    setTick((t) => t + 1);
  }, [steps, octaveStrict, allowExtra]);

  const finish = useCallback((run) => {
    const s = summarize(run);
    setScore(s);
    if (!scoredRef.current && s.total > 0) {
      scoredRef.current = true;
      onScore?.({ songKey, title, artist, kind: "playalong", accuracy: s.accuracy, total: s.total, clean: s.clean, section: sectionPick || null });
    }
    if (loop) setTimeout(() => { runRef.current?.reset(); scoredRef.current = false; setScore(null); setTick((t) => t + 1); }, 900);
  }, [onScore, songKey, title, artist, sectionPick, loop]);

  const feed = useCallback((attack) => {
    const run = runRef.current;
    if (!run) return;
    const wasDone = run.done;
    run.observe([...heldRef.current], { attack });
    if (run.done && !wasDone) finish(run);
    setHeldView(new Set(heldRef.current));
    setTick((t) => t + 1);
  }, [finish]);

  /* ---- MIDI in ---- */
  const unsubRef = useRef(null);
  const connectMidi = async () => {
    try {
      const access = await requestMidi();
      unsubRef.current?.();
      unsubRef.current = watchInputs(access, (e) => {
        if (e.type === "down") heldRef.current.add(e.note);
        else heldRef.current.delete(e.note);
        feed(e.type === "down");
      });
      setMidiState({ status: "on", inputs: listInputs(access).map((i) => i.name) });
    } catch {
      setMidiState({ status: "denied", inputs: [] });
    }
  };
  useEffect(() => () => unsubRef.current?.(), []);

  /* ---- mouse hands ---- */
  const clickKey = (midi) => {
    onPlay?.([midi], 0.55);
    heldRef.current.add(midi);
    feed(true);
    setTimeout(() => { heldRef.current.delete(midi); feed(false); }, 240);
  };

  const run = runRef.current;
  const step = run && !run.done ? run.steps[run.i] : null;
  const target = useMemo(() => new Set(step?.notes || []), [step]);
  const targetPcs = useMemo(() => new Set([...target].map((n) => ((n % 12) + 12) % 12)), [target]);
  const heldOk = (m) => (octaveStrict ? target.has(m) : targetPcs.has(((m % 12) + 12) % 12));
  const missing = step ? step.notes.filter((n) => (octaveStrict ? !heldView.has(n) : ![...heldView].some((h) => (h % 12 + 12) % 12 === ((n % 12) + 12) % 12))) : [];

  /* ---- wide keyboard geometry (range hugs the material) ---- */
  const range = useMemo(() => {
    let lo = 48, hi = 76;
    for (const s of steps) for (const n of s.notes) { if (n < lo) lo = n; if (n > hi) hi = n; }
    lo = Math.max(21, lo - ((lo % 12) + 12) % 12);
    hi = Math.min(108, hi + (11 - (((hi % 12) + 12) % 12)));
    return { lo, hi };
  }, [steps]);
  const geom = useMemo(() => {
    const WKW = 16, pos = {};
    let x = 0;
    for (let n = range.lo; n <= range.hi; n++) if (!isBlack(n)) { pos[n] = { x }; x += WKW; }
    for (let n = range.lo; n <= range.hi; n++) if (isBlack(n)) { let p = n - 1; while (isBlack(p)) p--; if (pos[p]) pos[n] = { x: pos[p].x + WKW - 5, black: true }; }
    return { pos, width: x, WKW };
  }, [range]);
  const WKH = 78, BKW = 10, BKH = 50;

  const keyPaint = (midi) => {
    if (heldView.has(midi)) {
      if (step && heldOk(midi)) {
        const amber = step.rootPc != null && ((midi % 12) + 12) % 12 === step.rootPc;
        return { fill: amber ? C.root : C.tone, glow: amber ? C.rootGlow : C.toneGlow, solid: true };
      }
      return { fill: C.bass, glow: C.bassGlow, solid: true };       // coral: not in this chord
    }
    if (target.has(midi)) {
      const amber = step?.rootPc != null && ((midi % 12) + 12) % 12 === step.rootPc;
      return { ghost: true, glow: amber ? C.rootGlow : C.toneGlow, fill: amber ? C.root : C.tone };
    }
    return null;
  };

  if (!allSteps.length) {
    return (
      <div style={{ marginTop: 18 }}>
        <div className="kl-eyebrow">Keylit hears you</div>
        <h2 className="kl-title" style={{ marginTop: 4, fontSize: 26 }}>Play the song</h2>
        <p className="kl-prose" style={{ maxWidth: 560, marginTop: 8 }}>
          Load a song and Keylit waits for your hands: each chord lights up as ghosts, and the music only moves when you play it.
        </p>
        <div className="flex items-center" style={{ gap: 10, marginTop: 14 }}>
          <button className="bench-btn primary" onClick={onPickSong}><ListMusic size={15} /> Pick from the Library</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="kl-eyebrow">Keylit hears you</div>
          <h2 className="kl-title" style={{ marginTop: 4, fontSize: 26 }}>
            {title || "Your chart"}{artist ? <span style={{ color: C.faint, fontWeight: 400 }}> · {artist}</span> : null}
          </h2>
        </div>
        <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
          {tabAvailable && (
            <div className="kl-seg" role="tablist" aria-label="material">
              <button role="tab" aria-selected={material === "chords"} onClick={() => setMaterial("chords")}>Chords</button>
              <button role="tab" aria-selected={material === "tab"} onClick={() => setMaterial("tab")}>Tab notes</button>
            </div>
          )}
          {material === "chords" && (
            <div className="kl-seg" role="tablist" aria-label="voicing">
              <button role="tab" aria-selected={voicingKind === "root"} onClick={() => setVoicingKind("root")}>Root</button>
              <button role="tab" aria-selected={voicingKind === "smooth"} onClick={() => setVoicingKind("smooth")}>Smooth</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <Chip on={!octaveStrict} onClick={() => setOctaveStrict((v) => !v)} title="Any octave counts — friendlier on small keyboards">any octave</Chip>
        <Chip on={allowExtra} onClick={() => setAllowExtra((v) => !v)} title="Doubled notes don't count against you">forgive extras</Chip>
        <Chip on={loop} onClick={() => setLoop((v) => !v)} title="Start over automatically when you finish"><Repeat size={12} style={{ marginRight: 4, verticalAlign: -2 }} />loop</Chip>
        {sections.length > 1 && (
          <select value={sectionPick} onChange={(e) => setSectionPick(e.target.value)} aria-label="section"
            style={{ background: C.panel, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 8px", fontSize: 12, fontFamily: MONO }}>
            <option value="">whole song</option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <div className="deck" style={{ padding: "16px 14px 14px" }}>
        {score ? (
          <ScoreCard score={score} onAgain={() => { runRef.current?.reset(); scoredRef.current = false; setScore(null); setTick((t) => t + 1); }} />
        ) : (
          <>
            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div className="flex items-center" style={{ gap: 14 }}>
                <div key={run?.i} className="kl-pop" style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, lineHeight: 1, color: "#f3ede2" }}>
                  {step?.label || (step ? `${step.notes.length} note${step.notes.length > 1 ? "s" : ""}` : "—")}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#8b8378", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {step?.section ? `${step.section} · ` : ""}step {run ? Math.min(run.i + 1, run.steps.length) : 0} / {run?.steps.length || 0}
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: missing.length ? "#b8b0a4" : C.toneGlow, minHeight: 18 }}>
                {step ? (missing.length ? <>waiting for <b style={{ color: "#e8e2d6" }}>{missing.map(noteName).join(" ")}</b></> : "…") : ""}
              </div>
            </div>
            <div className="key-felt" style={{ padding: "12px 10px" }}>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <svg viewBox={`0 0 ${geom.width} ${WKH + 4}`} width="100%" style={{ maxWidth: geom.width, minWidth: 470, display: "block", margin: "0 auto" }} role="img"
                  aria-label={`play-along keyboard — waiting for ${missing.map(noteName).join(", ") || "you"}`}>
                  <defs><linearGradient id="paWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbf6ec" /><stop offset="100%" stopColor={C.whiteShadow} /></linearGradient></defs>
                  {Object.entries(geom.pos).filter(([n]) => !isBlack(+n)).map(([n, p]) => {
                    const paint = keyPaint(+n);
                    return (
                      <g key={n} onClick={() => clickKey(+n)} style={{ cursor: "pointer" }}>
                        <rect x={p.x + 1} y={2} width={geom.WKW - 2} height={WKH} rx={3}
                          fill={paint?.solid ? paint.fill : "url(#paWhite)"}
                          stroke={paint ? paint.glow : C.whiteShadow} strokeWidth={paint ? 1.6 : 1}
                          style={{ filter: paint?.solid ? `drop-shadow(0 0 9px ${paint.glow}cc)` : "none", transition: "fill 110ms ease" }} />
                        {paint?.ghost && <circle cx={p.x + geom.WKW / 2} cy={WKH - 12} r={4} fill={paint.fill} opacity={0.9} />}
                      </g>
                    );
                  })}
                  {Object.entries(geom.pos).filter(([n]) => isBlack(+n)).map(([n, p]) => {
                    const paint = keyPaint(+n);
                    return (
                      <g key={n} onClick={() => clickKey(+n)} style={{ cursor: "pointer" }}>
                        <rect x={p.x} y={2} width={BKW} height={BKH} rx={2}
                          fill={paint?.solid ? paint.fill : "#221d18"}
                          stroke={paint ? paint.glow : "#0c0a08"} strokeWidth={paint ? 1.5 : 1}
                          style={{ filter: paint?.solid ? `drop-shadow(0 0 8px ${paint.glow}dd)` : "none", transition: "fill 110ms ease" }} />
                        {paint?.ghost && <circle cx={p.x + BKW / 2} cy={BKH - 9} r={3.2} fill={paint.fill} opacity={0.95} />}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
            <div className="flex items-center" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {isMidiSupported() ? (
                midiState.status === "on" ? (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.toneGlow, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <PianoIcon size={13} /> hearing {midiState.inputs.length ? midiState.inputs.join(", ") : "your keyboard"}
                  </span>
                ) : (
                  <button className="bench-btn" onClick={connectMidi}>
                    <PianoIcon size={14} /> {midiState.status === "denied" ? "MIDI blocked — try again" : "Connect a MIDI keyboard"}
                  </button>
                )
              ) : (
                <span style={{ fontSize: 12, color: "#8b8378" }}>this browser has no Web MIDI —</span>
              )}
              <span style={{ fontSize: 12, color: "#8b8378" }}>or click the keys.</span>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                <button className="bench-btn" onClick={() => { runRef.current?.skip(); setTick((t) => t + 1); if (runRef.current?.done) finish(runRef.current); }} title="Give me this one">
                  <SkipForward size={14} /> skip
                </button>
                <button className="bench-btn" onClick={() => { runRef.current?.reset(); scoredRef.current = false; setScore(null); setTick((t) => t + 1); }}>
                  <RotateCcw size={14} /> restart
                </button>
              </span>
            </div>
          </>
        )}
      </div>
      <p style={{ color: C.faint, fontSize: 12, marginTop: 10, maxWidth: 640 }}>
        Dots are the chord waiting for you — Keylit only moves when you play it. <b style={{ color: C.rootText }}>Amber</b> marks the root,
        <b style={{ color: C.bassText }}> coral</b> means a finger strayed. Finish a pass and it lands in your Bench Book.
      </p>
    </div>
  );
}

function ScoreCard({ score, onAgain }) {
  const pct = Math.round(score.accuracy * 100);
  const grade = pct >= 90 ? "clean pass" : pct >= 70 ? "solid — again tomorrow" : "rough cut — slow it down";
  return (
    <div style={{ textAlign: "center", padding: "18px 8px 10px" }}>
      <div className="kl-eyebrow" style={{ color: "#8b8378" }}>the pass</div>
      <div className="kl-pop" style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 58, color: "#f3ede2", lineHeight: 1.1 }}>{pct}%</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: pct >= 90 ? C.toneGlow : pct >= 70 ? C.rootGlow : C.bassGlow }}>{grade}</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#8b8378", marginTop: 6 }}>{score.clean} of {score.total} chords clean on the first hold</div>
      {score.bySection.length > 1 && (
        <div style={{ maxWidth: 380, margin: "14px auto 0", textAlign: "left" }}>
          {score.bySection.map((b) => (
            <div key={b.section || "song"} className="flex items-center" style={{ gap: 10, marginTop: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#b8b0a4", width: 110, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.section || "—"}</span>
              <span style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${b.total ? Math.round((b.clean / b.total) * 100) : 0}%`, background: C.tone, borderRadius: 3 }} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#b8b0a4" }}>{b.clean}/{b.total}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center" style={{ gap: 10, marginTop: 16, justifyContent: "center" }}>
        <button className="bench-btn primary" onClick={onAgain}><RotateCcw size={14} /> Go again</button>
      </div>
      <div style={{ fontSize: 11.5, color: "#8b8378", marginTop: 10 }}>logged to your Bench Book ✓</div>
    </div>
  );
}
