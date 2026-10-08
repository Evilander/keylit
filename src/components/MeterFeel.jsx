// MeterFeel.jsx — the Meter Feel Trainer (Learn room). Two rungs, both
// physical: (1) hear a groove, name the meter; (2) prove it — tap the ONE
// and get your time called honestly (rushing / dragging / locked), scored on
// the same audio clock the drummer plays on. All groove math is pure
// (lib/meter.js); this component only renders, listens, and taps.
import { useEffect, useMemo, useRef, useState } from "react";
import { METERS, meterGroove, downbeatTimes, nextChallenge, scoreTaps } from "../lib/meter.js";
import { CONCEPTS, reaction, meterFeelLine } from "../lib/voice.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";
import { Faceplate, BenchButton } from "../ui/Bench.jsx";

const LISTEN_BARS = 2; // looped under your ear while you decide
const TAP_BARS = 6;    // bar one is free footing; five ONEs are scored

export default function MeterFeel({ tutor }) {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | guessing | guessed | tapping | scored
  const [guess, setGuess] = useState(null);   // { meterId, correct }
  const [result, setResult] = useState(null); // scoreTaps output
  const [tapFlash, setTapFlash] = useState(0);
  const handleRef = useRef(null);
  const tapsRef = useRef([]);
  const runRef = useRef(null); // { startTime, spb, meterId }

  const challenge = useMemo(() => nextChallenge(round), [round]);
  const meter = METERS[challenge.meterId];

  const stopAudio = () => { handleRef.current?.stop(); handleRef.current = null; };
  useEffect(() => () => stopAudio(), []);

  // Another surface took the stage mid-drill: reset to the top rather than
  // sit in a guessing/tapping phase whose audio (and onDone) will never come.
  const onCancel = () => {
    handleRef.current = null;
    runRef.current = null;
    setPhase("idle"); setGuess(null); setResult(null);
  };

  const listen = async () => {
    stopAudio();
    setGuess(null); setResult(null);
    const groove = meterGroove(challenge.meterId, LISTEN_BARS);
    handleRef.current = await tutor.playEvents(
      { events: groove, totalBeats: LISTEN_BARS * meter.beatsPerBar },
      { bpm: challenge.bpm, loop: true, onCancel }
    );
    setPhase("guessing");
  };

  const answer = (meterId) => {
    if (phase !== "guessing") return;
    setGuess({ meterId, correct: meterId === challenge.meterId });
    setPhase("guessed");
  };

  const startTapRun = async () => {
    stopAudio();
    tapsRef.current = [];
    const groove = meterGroove(challenge.meterId, TAP_BARS);
    const h = await tutor.playEvents(
      { events: groove, totalBeats: TAP_BARS * meter.beatsPerBar },
      {
        bpm: challenge.bpm, loop: false, onCancel,
        onDone: () => {
          const run = runRef.current;
          if (!run) return;
          const downbeats = downbeatTimes(run.meterId, TAP_BARS).slice(1).map((b) => b * run.spb);
          setResult(scoreTaps(tapsRef.current, downbeats, { tol: 0.22 }));
          setPhase("scored");
        },
      }
    );
    handleRef.current = h;
    runRef.current = { startTime: h.startTime, spb: h.secondsPerBeat, meterId: challenge.meterId };
    setPhase("tapping");
  };

  const tap = () => {
    const run = runRef.current;
    if (phase !== "tapping" || !run) return;
    tapsRef.current.push(tutor.now() - run.startTime);
    setTapFlash((n) => n + 1);
  };

  // Spacebar taps too — hands stay where a player's hands are.
  useEffect(() => {
    if (phase !== "tapping") return;
    const onKey = (e) => {
      // This listens on window, so without a guard it swallows the spacebar
      // everywhere — a lyric field, a search box, a setlist name. Typing wins.
      const t = e.target;
      if (t?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); tap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const deal = () => { stopAudio(); setRound((r) => r + 1); setPhase("idle"); setGuess(null); setResult(null); };

  const accuracyPct = result ? Math.round(result.accuracy * 100) : 0;

  return (
    <Faceplate label="meter feel · trainer" right={
      phase === "guessing" || phase === "guessed" || phase === "tapping"
        ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{challenge.bpm} bpm</span>
        : null
    }>
      {phase === "idle" && (
        <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
          <p style={{ color: C.ink, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 6px", maxWidth: 640, textAlign: "left" }}>
            {CONCEPTS["meter-feel"].line}
          </p>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 14px", maxWidth: 640, textAlign: "left" }}>
            {CONCEPTS["meter-feel"].bridge}
          </p>
          <BenchButton primary onClick={listen}>Deal a groove ♪</BenchButton>
        </div>
      )}

      {(phase === "guessing" || phase === "guessed") && (
        <div>
          <div style={{ textAlign: "center", padding: "4px 0 12px" }}>
            <div className="engraved" style={{ marginBottom: 8 }}>the drummer's playing — how does it lean?</div>
            <div className="flex items-center justify-center" style={{ gap: 8, flexWrap: "wrap" }}>
              {Object.values(METERS).map((m) => {
                const picked = guess?.meterId === m.id;
                const isAnswer = guess && m.id === challenge.meterId;
                let bg = C.panel, border = C.line, color = C.ink;
                if (guess) {
                  if (isAnswer) { bg = "rgba(70,207,194,0.16)"; border = C.tone; color = C.toneText; }
                  else if (picked) { bg = "rgba(240,138,93,0.14)"; border = C.bass; color = C.bassText; }
                  else color = C.faint;
                }
                return (
                  <button key={m.id} onClick={() => answer(m.id)} disabled={!!guess}
                    style={{
                      fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color,
                      background: bg, border: `1px solid ${border}`, borderRadius: 11,
                      padding: "12px 22px", cursor: guess ? "default" : "pointer",
                      transition: "background 140ms ease, border-color 140ms ease",
                    }}>
                    {m.id}
                  </button>
                );
              })}
            </div>
          </div>

          {phase === "guessed" && guess && (
            <div className="kl-pop" style={{ textAlign: "center" }}>
              <p style={{ color: guess.correct ? C.toneText : C.bassText, fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
                {reaction(guess.correct, round)}
              </p>
              <p style={{ color: C.muted, fontSize: 13, margin: "0 0 8px", maxWidth: 620, marginLeft: "auto", marginRight: "auto" }}>
                {METERS[challenge.meterId].line}
              </p>
              <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 12px", maxWidth: 620, marginLeft: "auto", marginRight: "auto" }}>
                {CONCEPTS["find-the-one"].line}
              </p>
              <div className="flex items-center justify-center" style={{ gap: 10 }}>
                <BenchButton primary onClick={startTapRun}>Now find the ONE ↓</BenchButton>
                <BenchButton onClick={deal}>Deal another</BenchButton>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "tapping" && (
        <div style={{ textAlign: "center", padding: "6px 0" }}>
          <div className="engraved" style={{ marginBottom: 10 }}>
            first bar's free — then tap every ONE · space bar works
          </div>
          <button onPointerDown={tap} aria-label="tap the downbeat"
            className={tapFlash % 2 ? "kl-snap" : ""}
            style={{
              width: 148, height: 148, borderRadius: "50%", cursor: "pointer",
              background: C.deck, color: C.white, border: `3px solid ${C.tone}`,
              fontFamily: DISPLAY, fontSize: 30, fontWeight: 600,
              boxShadow: `0 0 ${12 + (tapFlash % 2) * 10}px rgba(70,207,194,0.4)`,
            }}>
            ONE
          </button>
          <p style={{ color: C.faint, fontSize: 12, marginTop: 10 }}>{tapsRef.current.length} taps in</p>
        </div>
      )}

      {phase === "scored" && result && (
        <div className="kl-pop" style={{ textAlign: "center", padding: "4px 0" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 600, color: accuracyPct >= 80 ? C.toneText : C.ink, lineHeight: 1.1 }}>
            {accuracyPct}%
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint, margin: "4px 0 8px" }}>
            {result.hits} ONE{result.hits === 1 ? "" : "s"} landed · {result.misses} slipped by{result.extras ? ` · ${result.extras} stray${result.extras === 1 ? "" : "s"}` : ""}
          </div>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 600, maxWidth: 560, margin: "0 auto 12px" }}>
            {meterFeelLine(result.feel, (result.meanOffset ?? 0) * 1000)}
          </p>
          <div className="flex items-center justify-center" style={{ gap: 10 }}>
            <BenchButton onClick={startTapRun}>Run it again</BenchButton>
            <BenchButton primary onClick={deal}>Deal another ↻</BenchButton>
          </div>
        </div>
      )}
    </Faceplate>
  );
}
