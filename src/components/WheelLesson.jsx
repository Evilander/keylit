// WheelLesson.jsx — "how do I USE it?" for the circle of fifths. TheoryGuide
// reads the wheel; this one drives it. Six short steps, each with a button
// that actually plays or actually moves the wedge — the lesson happens on the
// instrument, not in the prose. Waits its turn: auto-opens only after the
// guide has been seen, and only once.
import { useState } from "react";
import { ChevronDown, Play, ArrowRight, Compass } from "lucide-react";
import { buildChord } from "../lib/theory.js";
import { C, DISPLAY, MONO } from "../ui/theme.js";

const GUIDE_KEY = "keylit.theory-guide.v1";
const SEEN_KEY = "keylit.wheel-lesson.v1";
const ls = (k) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* noop */ } };

export default function WheelLesson({ activeKey, onAudition, onPickTonic, onDrill }) {
  const [open, setOpen] = useState(() => ls(GUIDE_KEY) && !ls(SEEN_KEY));
  const [step, setStep] = useState(0);

  // In a minor key the wedge hangs from the relative major; the lesson's
  // degree math anchors there so "1 · 4 · 5" always names the wedge pillars.
  const minor = activeKey.mode === "minor";
  const home = minor ? (activeKey.tonic + 3) % 12 : activeKey.tonic;
  const maj = (pc) => buildChord(((pc % 12) + 12) % 12, "maj");
  const min = (pc) => buildChord(((pc % 12) + 12) % 12, "m");
  const dom = (pc) => buildChord(((pc % 12) + 12) % 12, "7");

  const STEPS = [
    {
      title: "Strike home",
      body: "Before you go anywhere, know where you live. The wedge is sitting on your key right now — press the button and let the 1 ring. Every trip on this wheel ends by coming back to that sound.",
      act: { label: "hear your 1", run: () => onAudition?.(minor ? [min(activeKey.tonic)] : [maj(home)]) },
    },
    {
      title: "Meet the neighbors",
      body: "The two letters touching your wedge aren't decoration — counter-clockwise is your 4, clockwise is your 5. Those three chords are the pillars; whole careers were built without leaving them.",
      act: { label: "hear 1 · 4 · 5 · 1", run: () => onAudition?.([maj(home), maj(home + 5), maj(home + 7), maj(home)]) },
    },
    {
      title: "Feel the pull",
      body: "The 5 is the restless neighbor. Alone it's pretty; add the seventh and it leans on your door until you open it. That lean is the engine of almost every turnaround you know.",
      act: { label: "hear the 5 lean, then give in", run: () => onAudition?.([maj(home + 7), dom(home + 7), maj(home)]) },
    },
    {
      title: "Spin it",
      body: "Now move house. Press the button and watch the wedge pack up and slide one letter clockwise — or skip the button and click any letter on the dial yourself. Nothing on the wheel changed; home did. That's all a key is: where you park the wedge.",
      act: { label: "slide home one step clockwise", run: () => { onAudition?.([maj(home + 7)]); onPickTonic?.((home + 7) % 12, "major"); } },
    },
    {
      title: "Steal from next door",
      body: "Borrowing is legal and everyone does it. One step past your 4, counter-clockwise, lives the ♭7 — the flat-side neighbor. Drop it into a major song and the fall back home turns golden. You have heard this move in a thousand choruses.",
      act: { label: "hear 1 · ♭7 · 4 · 1", run: () => onAudition?.([maj(home), maj(home + 10), maj(home + 5), maj(home)]) },
    },
    {
      title: "The long way home",
      body: "Fifths are gravity: from anywhere on the wheel, stepping counter-clockwise falls toward home. Land on the 2, let it fall to the 5, let the 5 fall to the 1 — the oldest closing argument in music. When this feels obvious, the wheel is yours.",
      act: { label: "hear 2 · 5 · 1", run: () => onAudition?.([min(home + 2), dom(home + 7), maj(home)]) },
      cta: true,
    },
  ];
  const s = STEPS[step];

  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel }}>
      <button onClick={() => { setOpen((v) => !v); markSeen(); }} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: 0, cursor: "pointer", textAlign: "left", padding: "12px 14px" }}>
        <ChevronDown size={15} style={{ color: C.faint, transform: open ? "none" : "rotate(-90deg)", transition: "transform 160ms ease" }} />
        <span className="kl-eyebrow">Lesson one · take the wheel for a spin</span>
        <span style={{ fontSize: 12, color: C.faint }}>six moves, all hands-on</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setStep(i)} aria-label={`step ${i + 1}`}
                style={{ width: 22, height: 4, borderRadius: 2, border: 0, cursor: "pointer", background: i === step ? C.tone : C.line, padding: 0 }} />
            ))}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink }}>{step + 1} · {s.title}</div>
          {minor && step === 0 && (
            <p style={{ fontSize: 12, color: C.faint, margin: "6px 0 0" }}>
              Your song is minor, so the wedge hangs from its relative major — same six chords, heavier coat. The numbers below count from that anchor.
            </p>
          )}
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.62, margin: "8px 0 10px", maxWidth: 560 }}>{s.body}</p>
          <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="bench-btn" style={{ padding: "6px 13px", fontSize: 12.5, fontFamily: MONO }} onClick={s.act.run}>
              {step === 3 ? <Compass size={13} /> : <Play size={13} />} {s.act.label}
            </button>
            {s.cta && onDrill && (
              <button className="bench-btn primary" style={{ padding: "6px 13px", fontSize: 12.5 }} onClick={onDrill}>
                drill it in Practice <ArrowRight size={13} />
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
