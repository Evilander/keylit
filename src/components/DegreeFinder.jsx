// DegreeFinder.jsx — the atomic drill: "what's the 4th/6th/7th of any key?"
// Retrieval practice, interleaved across keys/degrees. Answer on a note row;
// the shared keyboard confirms by lighting the tonic + target, with a kind,
// no-scold correction in the tutor's voice.
import { useState } from "react";
import { MAJOR_SCALE, MINOR_SCALE, degreeOf } from "../lib/theory.js";
import { spellPc } from "../lib/spelling.js";
import { reaction, buildSuggestionChips } from "../lib/voice.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";
import { Faceplate, BenchButton, SuggestionChips } from "../ui/Bench.jsx";

const ORDINAL = { 1: "root", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th" };

function makeQuestion(mode) {
  const tonic = Math.floor(Math.random() * 12);
  const degree = 2 + Math.floor(Math.random() * 6); // 2..7 (skip the trivial root)
  return { tonic, degree, mode };
}

export default function DegreeFinder({ tutor, onIntent }) {
  const [mode] = useState("major");
  const [q, setQ] = useState(() => makeQuestion("major"));
  const [answered, setAnswered] = useState(null); // { pc, correct }
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [seed, setSeed] = useState(0);

  const scale = mode === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const keyCtx = { tonic: q.tonic, mode };
  const targetPc = (q.tonic + scale[q.degree - 1]) % 12;
  const tonicName = spellPc(q.tonic, keyCtx);
  const answerName = degreeOf(q.tonic, q.degree, mode);

  // 12 candidate notes, spelled for this key so the correct spelling appears.
  const candidates = Array.from({ length: 12 }, (_, pc) => ({ pc, name: spellPc(pc, keyCtx) }));

  const answer = (pc) => {
    if (answered) return;
    const correct = pc === targetPc;
    setAnswered({ pc, correct });
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    setSeed((n) => n + 1);
    tutor.light([
      { pc: q.tonic, role: "root", label: "1" },
      { pc: targetPc, role: "tone", label: String(q.degree) },
    ]);
    tutor.playPc(targetPc);
  };

  const next = () => { setAnswered(null); setQ(makeQuestion(mode)); tutor.light(null); };

  const chips = buildSuggestionChips({ key: keyCtx, lesson: "degree" });

  return (
    <Faceplate label="degree finder · drill" right={
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{score.right}/{score.total}</span>
    }>
      <div style={{ textAlign: "center", padding: "6px 0 14px" }}>
        <div className="engraved" style={{ marginBottom: 8 }}>what's the</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>
          {ORDINAL[q.degree]} of <span style={{ color: C.root }}>{tonicName} {mode}</span>?
        </div>
      </div>

      <div className="flex items-center justify-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {candidates.map((c) => {
          const isAnswerKey = c.pc === targetPc;
          const isPicked = answered && c.pc === answered.pc;
          let bg = C.panel, border = C.line, color = C.ink;
          if (answered) {
            if (isAnswerKey) { bg = "rgba(70,207,194,0.16)"; border = C.tone; color = C.tone; }
            else if (isPicked) { bg = "rgba(240,138,93,0.14)"; border = C.bass; color = C.bass; }
            else { color = C.faint; }
          }
          return (
            <button key={c.pc} onClick={() => answer(c.pc)} disabled={!!answered}
              style={{
                fontFamily: MONO, fontSize: 15, fontWeight: 600, color,
                background: bg, border: `1px solid ${border}`, borderRadius: 9,
                padding: "9px 12px", minWidth: 46, cursor: answered ? "default" : "pointer",
                transition: "background 130ms ease, border-color 130ms ease",
              }}>
              {c.name}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="kl-pop" style={{ textAlign: "center", marginBottom: 12 }}>
          <p style={{ color: answered.correct ? C.tone : C.bass, fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            {reaction(answered.correct, seed)}
          </p>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            The {ORDINAL[q.degree]} of {tonicName} {mode} is <b style={{ color: C.ink }}>{answerName}</b> — walk {q.degree - 1} step{q.degree - 1 === 1 ? "" : "s"} up the scale.
          </p>
        </div>
      )}

      <div className="flex items-center justify-center" style={{ gap: 10 }}>
        <BenchButton primary={!!answered} onClick={next}>{answered ? "Next ↻" : "Skip"}</BenchButton>
      </div>

      <div style={{ marginTop: 14 }}>
        <SuggestionChips chips={chips} onIntent={onIntent} />
      </div>
    </Faceplate>
  );
}
