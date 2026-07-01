// Practice.jsx — games / drills. Self-contained: its own keyboard highlight so
// it doesn't touch the shared instrument's state. Covers piano note-ID and
// circle-of-fifths reasoning. Ear/pitch and fretboard drills build on this.
import { useMemo, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import Keyboard from "./Keyboard.jsx";
import { SHARP_NAMES, CIRCLE_OF_FIFTHS } from "../lib/theory.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const GAMES = [
  { id: "key", label: "Name the key" },
  { id: "fifth", label: "Up a fifth" },
  { id: "relmin", label: "Relative minor" },
];

// deterministic-ish picker that varies by attempt count (no Math.random reliance for SSR safety)
function pick(n, seed) { return Math.abs((seed * 2654435761) % n); }

export default function Practice({ onPlayNote }) {
  const [game, setGame] = useState("key");
  const [seed, setSeed] = useState(1);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [verdict, setVerdict] = useState(null); // {ok, answer}

  const prompt = useMemo(() => buildPrompt(game, seed), [game, seed]);

  const answer = (choice) => {
    if (verdict) return;
    const ok = choice === prompt.answerPc;
    setVerdict({ ok, answer: prompt.answerPc });
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    if (game === "key" && onPlayNote) onPlayNote(prompt.midi);
  };
  const next = () => { setVerdict(null); setSeed((s) => s + 1); };
  const switchGame = (g) => { setGame(g); setVerdict(null); setScore({ right: 0, total: 0 }); setSeed((s) => s + 1); };

  const roleFor = (midi) => (game === "key" && midi === prompt.midi ? { role: "tone" } : null);

  return (
    <div className="kl-section">
      <div className="kl-eyebrow">Drills</div>
      <h1 className="kl-title" style={{ marginTop: 4 }}>Practice</h1>
      <p className="kl-prose" style={{ maxWidth: 560, marginTop: 8 }}>
        Quick reps to make the theory automatic — read the keyboard, walk the circle of fifths.
        <span style={{ color: C.faint, fontStyle: "italic" }}> Fretboard and ear-training drills are next.</span>
      </p>

      <div className="kl-seg" style={{ margin: "18px 0" }} role="tablist" aria-label="Drill type">
        {GAMES.map((g) => (
          <button key={g.id} role="tab" aria-selected={game === g.id} onClick={() => switchGame(g.id)}>{g.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 24, color: C.ink }}>{prompt.question}</div>
          <div className="kl-meta" style={{ marginLeft: "auto" }}>{score.right}/{score.total}</div>
        </div>

        {game === "key" && (
          <div className="deck" style={{ padding: "14px 12px", marginBottom: 16 }}>
            <div className="key-felt" style={{ padding: "12px 10px 8px" }}>
              <Keyboard roleFor={roleFor} ariaLabel="name the lit key" />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SHARP_NAMES.map((n, pc) => {
            const isAnswer = verdict && pc === verdict.answer;
            const chosenWrong = verdict && !verdict.ok && pc === verdict.answer;
            return (
              <button key={pc} onClick={() => answer(pc)} disabled={!!verdict}
                style={{
                  fontFamily: MONO, fontSize: 15, fontWeight: 700, minWidth: 52, padding: "10px 0",
                  borderRadius: 9, cursor: verdict ? "default" : "pointer",
                  color: isAnswer ? "#FAFAF8" : C.ink,
                  background: isAnswer ? C.toneUi : C.panel,
                  border: `1px solid ${isAnswer ? C.toneUi : C.line}`,
                }}>
                {n}
              </button>
            );
          })}
        </div>

        <div style={{ height: 44, marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          {verdict && (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: verdict.ok ? C.toneText : C.bassText, fontWeight: 700 }}>
                {verdict.ok ? <Check size={17} /> : <X size={17} />} {verdict.ok ? "Right" : `It's ${SHARP_NAMES[verdict.answer]}`}
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
    const midi = 48 + pick(24, seed * 7 + 3); // C3..B4
    return { question: "Which note is lit?", midi, answerPc: midi % 12 };
  }
  if (game === "fifth") {
    const fromPc = pick(12, seed * 5 + 1);
    return { question: `A fifth up from ${SHARP_NAMES[fromPc]} is…`, answerPc: (fromPc + 7) % 12 };
  }
  // relative minor: relative minor of a major key is down a minor 3rd (−3 semitones)
  const idx = pick(12, seed * 11 + 2);
  const majorPc = CIRCLE_OF_FIFTHS[idx];
  return { question: `Relative minor of ${SHARP_NAMES[majorPc]} major is…`, answerPc: (majorPc + 9) % 12 };
}
