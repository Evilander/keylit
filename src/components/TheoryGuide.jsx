// TheoryGuide.jsx — "what am I looking at?" for the circle of fifths, in
// plain kitchen-table language, five steps, each with something to HEAR.
// Opens itself the first time the Theory room is ever visited, then folds
// away politely. The last step hands you to the Write desk — the wheel is
// for writing, not admiring.
import { useState } from "react";
import { ChevronDown, Play, ArrowRight } from "lucide-react";
import { buildChord } from "../lib/theory.js";
import { C, DISPLAY } from "../ui/theme.js";

const SEEN_KEY = "keylit.theory-guide.v1";
const seen = () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* noop */ } };

export default function TheoryGuide({ activeKey, onAudition, onGoWrite }) {
  const [open, setOpen] = useState(() => !seen());
  const [step, setStep] = useState(0);

  const tonic = activeKey.tonic;
  const maj = (pc) => buildChord(((pc % 12) + 12) % 12, "maj");
  const min = (pc) => buildChord(((pc % 12) + 12) % 12, "m");

  const STEPS = [
    {
      title: "Every key, sorted by kinship",
      body: "Neighbors on the wheel share six of their seven notes — moving next door barely hurts. One step clockwise adds a sharp (brighter); one step counter-clockwise adds a flat (warmer). Distant keys are distant because they share almost nothing.",
      hear: { label: "hear home, then next door", chords: [maj(tonic), maj(tonic + 7)] },
    },
    {
      title: "The wedge wears your key",
      body: "The dial never moves — C at noon, sharps clockwise, flats counter, same as every printed chart. Your song's key wears the dotted wedge, and when the key changes the wedge travels to it. The six chords under the wedge always fit — that's why your hands keep finding the same shapes: they live in the wedge.",
      hear: { label: "hear the wedge's pillars (1, 4, 5)", chords: [maj(tonic), maj(tonic + 5), maj(tonic + 7)] },
    },
    {
      title: "The inner ring is the sad twin",
      body: "Every key carries a relative minor — the same seven notes with a different center of gravity. A minor is C major wearing a different coat. Swap to it mid-song and nothing clashes; everything just gets heavier.",
      hear: { label: "hear the coat change", chords: [maj(tonic), min(tonic + 9)] },
    },
    {
      title: "The colored dots are YOUR song",
      body: "When a song is on the stand, its chords light the wheel by their job: cyan rests (home, T), gold moves away (S), tangerine pulls back (D). A verse that never leaves cyan is calm on purpose; a chorus usually wants some tangerine before it lands.",
    },
    {
      title: "How to write with it",
      body: "Three moves cover most songs ever written: stay in the wedge (safe, singable); borrow from next door for one chord of warmth or brightness; and when a chorus won't lift, ride the 5 (V) a bar longer than feels polite — then come home. The tension tab measures whether it worked.",
      cta: true,
    },
  ];
  const s = STEPS[step];

  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel }}>
      <button onClick={() => { setOpen((v) => !v); markSeen(); }} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: 0, cursor: "pointer", textAlign: "left", padding: "12px 14px" }}>
        <ChevronDown size={15} style={{ color: C.faint, transform: open ? "none" : "rotate(-90deg)", transition: "transform 160ms ease" }} />
        <span className="kl-eyebrow">What am I looking at?</span>
        <span style={{ fontSize: 12, color: C.faint }}>a five-step read of the wheel</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setStep(i)} aria-label={`step ${i + 1}`}
                style={{ width: 22, height: 4, borderRadius: 2, border: 0, cursor: "pointer", background: i === step ? C.root : C.line, padding: 0 }} />
            ))}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}>{step + 1} · {s.title}</div>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.62, margin: "8px 0 10px", maxWidth: 560 }}>{s.body}</p>
          <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            {s.hear && (
              <button className="bench-btn" style={{ padding: "6px 13px", fontSize: 12.5 }} onClick={() => onAudition?.(s.hear.chords)}>
                <Play size={13} /> {s.hear.label}
              </button>
            )}
            {s.cta && (
              <button className="bench-btn primary" style={{ padding: "6px 13px", fontSize: 12.5 }} onClick={onGoWrite}>
                take it to the desk <ArrowRight size={13} />
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="bench-btn" style={{ padding: "6px 13px", fontSize: 12.5, marginLeft: "auto" }} onClick={() => setStep(step + 1)}>next</button>
            ) : (
              <button className="bench-btn" style={{ padding: "6px 13px", fontSize: 12.5, marginLeft: "auto" }} onClick={() => { setOpen(false); markSeen(); }}>done</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
