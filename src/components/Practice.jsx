// Practice.jsx — games / drills. Self-contained highlights (own keyboard /
// fretboard) so they don't touch the shared instrument. Covers piano & fretboard
// note-ID, circle-of-fifths reasoning, and ear training (intervals / pitch).
import { useEffect, useMemo, useState } from "react";
import { Check, X, RotateCcw, Volume2 } from "lucide-react";
import Keyboard from "./Keyboard.jsx";
import Fretboard from "./Fretboard.jsx";
import { SHARP_NAMES, CIRCLE_OF_FIFTHS } from "../lib/theory.js";
import { STANDARD_TUNING, fretToMidi } from "../lib/tuning.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const GAMES = [
  { id: "key", label: "Piano note" },
  { id: "fret", label: "Fretboard note" },
  { id: "interval", label: "Name the interval" },
  { id: "fifth", label: "Up a fifth" },
  { id: "relmin", label: "Relative minor" },
];

const INTERVALS = ["", "m2", "M2", "m3", "M3", "P4", "tritone", "P5", "m6", "M6", "m7", "M7", "octave"];

function pick(n, seed) { return Math.abs((seed * 2654435761) % n); }

export default function Practice({ onPlay }) {
  const [game, setGame] = useState("key");
  const [seed, setSeed] = useState(1);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [verdict, setVerdict] = useState(null);

  const prompt = useMemo(() => buildPrompt(game, seed), [game, seed]);
  const isInterval = game === "interval";
  const choices = isInterval ? INTERVALS.map((n, i) => ({ label: n, val: i })).slice(1) : SHARP_NAMES.map((n, i) => ({ label: n, val: i }));

  // Auto-play the interval when it changes (best-effort; audio may need a prior gesture).
  useEffect(() => { if (isInterval && prompt.play) onPlay?.(prompt.play); /* eslint-disable-next-line */ }, [game, seed]);

  const answer = (val) => {
    if (verdict) return;
    const ok = val === prompt.answer;
    setVerdict({ ok, answer: prompt.answer });
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    if (game === "key" && prompt.midi != null) onPlay?.([prompt.midi]);
    if (game === "fret" && prompt.midi != null) onPlay?.([prompt.midi]);
  };
  const next = () => { setVerdict(null); setSeed((s) => s + 1); };
  const switchGame = (g) => { setGame(g); setVerdict(null); setScore({ right: 0, total: 0 }); setSeed((s) => s + 1); };
  const answerLabel = isInterval ? INTERVALS[verdict?.answer] : SHARP_NAMES[verdict?.answer];

  return (
    <div className="kl-section">
      <div className="kl-eyebrow">Drills</div>
      <h1 className="kl-title" style={{ marginTop: 4 }}>Practice</h1>
      <p className="kl-prose" style={{ maxWidth: 580, marginTop: 8 }}>Quick reps to make it automatic — read the piano and the neck, walk the circle of fifths, train your ear.</p>

      <div className="kl-seg" style={{ margin: "18px 0", flexWrap: "wrap" }} role="tablist" aria-label="Drill type">
        {GAMES.map((g) => (
          <button key={g.id} role="tab" aria-selected={game === g.id} onClick={() => switchGame(g.id)}>{g.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 24, color: C.ink }}>{prompt.question}</div>
          {isInterval && <button className="bench-btn" onClick={() => onPlay?.(prompt.play)} style={{ padding: "6px 12px" }}><Volume2 size={14} /> Replay</button>}
          <div className="kl-meta" style={{ marginLeft: "auto" }}>{score.right}/{score.total}</div>
        </div>

        {game === "key" && (
          <div className="deck" style={{ padding: "14px 12px", marginBottom: 16 }}>
            <div className="key-felt" style={{ padding: "12px 10px 8px" }}>
              <Keyboard roleFor={(midi) => (midi === prompt.midi ? { role: "tone" } : null)} ariaLabel="name the lit key" />
            </div>
          </div>
        )}
        {game === "fret" && (
          <div style={{ marginBottom: 16, padding: "6px 2px" }}>
            <Fretboard highlight={prompt.fret} />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {choices.map((c) => {
            const isAnswer = verdict && c.val === verdict.answer;
            return (
              <button key={c.val} onClick={() => answer(c.val)} disabled={!!verdict}
                style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, minWidth: isInterval ? 74 : 52, padding: "10px 8px", borderRadius: 9,
                  cursor: verdict ? "default" : "pointer", color: isAnswer ? "#FAFAF8" : C.ink,
                  background: isAnswer ? C.toneUi : C.panel, border: `1px solid ${isAnswer ? C.toneUi : C.line}` }}>
                {c.label}
              </button>
            );
          })}
        </div>

        <div style={{ height: 44, marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          {verdict && (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: verdict.ok ? C.toneText : C.bassText, fontWeight: 700 }}>
                {verdict.ok ? <Check size={17} /> : <X size={17} />} {verdict.ok ? "Right" : `It's ${answerLabel}`}
              </span>
              <button className="bench-btn primary" onClick={next}><RotateCcw size={14} /> Next</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPrompt(game, seed) {
  if (game === "key") {
    const midi = 48 + pick(24, seed * 7 + 3);
    return { question: "Which note is lit?", midi, answer: midi % 12 };
  }
  if (game === "fret") {
    const string = pick(6, seed * 3 + 1), fret = pick(13, seed * 7 + 5);
    const midi = fretToMidi(STANDARD_TUNING, string, fret);
    return { question: "Name the note on the neck", fret: { string, fret }, midi, answer: midi % 12 };
  }
  if (game === "interval") {
    const root = 52 + pick(9, seed * 3 + 2);
    const iv = 1 + pick(12, seed * 5 + 1);
    return { question: "Name the interval you hear", play: [root, root + iv], answer: iv };
  }
  if (game === "fifth") {
    const from = pick(12, seed * 5 + 1);
    return { question: `A fifth up from ${SHARP_NAMES[from]} is…`, answer: (from + 7) % 12 };
  }
  const idx = pick(12, seed * 11 + 2);
  const majorPc = CIRCLE_OF_FIFTHS[idx];
  return { question: `Relative minor of ${SHARP_NAMES[majorPc]} major is…`, answer: (majorPc + 9) % 12 };
}
