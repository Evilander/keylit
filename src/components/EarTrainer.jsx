// EarTrainer.jsx — the ear drill that trains on THE SONG ON YOUR STAND.
// Questions come from the loaded progression (lib/eartrain.js); miss one and
// the explanation names the exact chords, in the song, that just fooled you.
// Levels open with your best streak. Falls back to plain folk furniture when
// the stand is empty.
import { useEffect, useMemo, useState } from "react";
import { Play, Ear } from "lucide-react";
import { parseSheet, detectKey } from "../lib/theory.js";
import { mkQuestion, levelFor, LEVELS, FALLBACK } from "../lib/eartrain.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const BEST_KEY = "keylit.ear.v1";
const loadBest = () => { try { return Number(JSON.parse(localStorage.getItem(BEST_KEY) || "{}").best) || 0; } catch { return 0; } };

export default function EarTrainer({ prog, activeKey, songTitle, onPlaySeq }) {
  const [best, setBest] = useState(loadBest);
  const [streak, setStreak] = useState(0);
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null);

  const source = useMemo(() => {
    if (prog?.length >= 3 && activeKey) return { progression: prog, key: activeKey, title: songTitle || "your chart" };
    const { progression } = parseSheet(FALLBACK.sheet);
    const k = detectKey(progression);
    return { progression, key: { tonic: k.tonic, mode: k.mode }, title: `the ${FALLBACK.keyName} furniture` };
  }, [prog, activeKey, songTitle]);

  const level = levelFor(best);

  const ask = () => {
    setPicked(null);
    let question = null;
    for (let l = level.id; l >= 1 && !question; l--) {
      question = mkQuestion(Math.random, { progression: source.progression, key: source.key, level: l });
    }
    setQ(question);
    if (question) onPlaySeq?.(question.play);
  };

  useEffect(() => { setQ(null); setPicked(null); }, [source]);

  const answer = (i) => {
    if (picked !== null || !q) return;
    setPicked(i);
    if (q.options[i].correct) {
      const s = streak + 1;
      setStreak(s);
      if (s > best) {
        setBest(s);
        try { localStorage.setItem(BEST_KEY, JSON.stringify({ best: s })); } catch { /* noop */ }
      }
    } else {
      setStreak(0);
    }
  };

  return (
    <div className="faceplate" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink }}><Ear size={15} style={{ marginRight: 6, color: C.toneText }} />The ear</span>
        <span className="kl-meta" style={{ color: C.faint }}>training on {source.title}</span>
        <span className="kl-meta" style={{ marginLeft: "auto" }}>
          {level.name} · streak <b style={{ color: streak ? C.rootText : C.faint }}>{streak}</b> · best {best}
        </span>
      </div>

      {!q ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "0 0 10px" }}>
            The drill plays real changes from the song and asks what your ear heard.
            {LEVELS.length - level.id > 0 ? ` ${LEVELS.length - level.id} deeper level${LEVELS.length - level.id === 1 ? "" : "s"} open with streaks.` : " All levels open."}
          </p>
          <button className="bench-btn primary" onClick={ask}><Play size={14} /> Throw one</button>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.ink, margin: "0 0 10px", lineHeight: 1.5 }}>{q.prompt}</p>
          <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="bench-btn" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => onPlaySeq?.(q.play)}>
              <Play size={13} /> hear it again
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {q.options.map((o, i) => {
              const done = picked !== null;
              const style = done && o.correct
                ? { background: C.toneUi, borderColor: C.toneUi, color: "#FAFAF8" }
                : done && picked === i
                  ? { borderColor: C.rootUi, color: C.rootText }
                  : {};
              return (
                <button key={i} className="chip" style={{ fontFamily: MONO, fontSize: 12.5, ...style }} onClick={() => answer(i)} disabled={picked !== null && i !== picked && !o.correct}>
                  {o.label}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: 0 }}>{q.explain}</p>
              <button className="bench-btn primary" style={{ marginTop: 10, padding: "6px 13px", fontSize: 12.5 }} onClick={ask}>next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
