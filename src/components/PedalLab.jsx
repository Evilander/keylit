// PedalLab.jsx — the Pedal-Point Lab (Learn room). One note held steady
// while the key's own chords change over it: some bars ring (the pedal is a
// chord tone), some grind (it isn't) — and the grind resolving is the lesson.
// Choose the classic pedals (the 1 or the 5); the shared keyboard lights the
// drone in the reserved pedal color while each chord passes over it.
// All timing/relation math is pure (lib/pedal.js + theory.js#pedalRelation).
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { diatonicChord, romanNumeral, chordSymbol } from "../lib/theory.js";
import { spellPc } from "../lib/spelling.js";
import { pedalEvents, suggestPedals } from "../lib/pedal.js";
import { CONCEPTS, buildSuggestionChips } from "../lib/voice.js";
import { C, MONO } from "../ui/theme.js";
import { Faceplate, BenchButton, SuggestionChips } from "../ui/Bench.jsx";

// I · ii · IV · V · I — home, a grind, a ring, a bigger grind, home again.
const DEGREES = [0, 1, 3, 4, 0];

export default function PedalLab({ tutor, onIntent }) {
  const { activeKey } = tutor;
  const [pedalIdx, setPedalIdx] = useState(0);
  const [step, setStep] = useState(null);
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef(null);

  const chords = useMemo(
    () => DEGREES.map((d) => diatonicChord(activeKey.tonic, activeKey.mode, d, false)).filter(Boolean),
    [activeKey.tonic, activeKey.mode]
  );
  const pedals = useMemo(() => suggestPedals(activeKey), [activeKey.tonic, activeKey.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const pedal = pedals[pedalIdx] || pedals[0];
  const pedalName = spellPc(pedal.pc, activeKey);

  const lab = useMemo(() => pedalEvents(chords, pedal.pc), [chords, pedal.pc]);

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlaying(false);
    setStep(null);
  };

  const play = async () => {
    handleRef.current?.stop();
    const h = await tutor.playEvents(
      { events: lab.events, totalBeats: lab.totalBeats },
      {
        bpm: 76, loop: true,
        onStep: (e) => { if (Number.isInteger(e.stepIdx)) setStep(e.stepIdx); },
        // Another surface took the stage: put the transport back to rest.
        onCancel: () => { handleRef.current = null; setPlaying(false); setStep(null); },
      }
    );
    handleRef.current = h;
    setPlaying(true);
  };

  // A new pedal mid-play restarts the drone; a new key stops it cold.
  useEffect(() => { if (playing) play(); /* eslint-disable-next-line */ }, [pedal.pc]);
  useEffect(() => { stop(); /* eslint-disable-next-line */ }, [activeKey.tonic, activeKey.mode]);
  useEffect(() => () => { handleRef.current?.stop(); }, []);

  // Light the drone (reserved pedal color) plus whatever chord is passing —
  // but only while the walk is live. At rest, PedalLab is one of five widgets
  // sharing the Learn keyboard, and tutor.light REPLACES the whole map; if it
  // lit on mount it would stomp the scale workshop's scale (the room's headline
  // widget) with a lone violet drone. So it claims the board only once stepping
  // starts, and hands it back when the walk stops.
  const litRef = useRef(false);
  useEffect(() => {
    if (step === null) {
      if (litRef.current) { tutor.light(null); litRef.current = false; }
      return;
    }
    const entries = [{ pc: pedal.pc, role: "pedal", label: pedal.degree }];
    const ch = chords[step];
    if (ch) {
      for (const iv of ch.intervals) {
        const pc = (ch.rootSemitone + iv) % 12;
        if (pc === pedal.pc) continue; // the drone keeps its color
        entries.push({ pc, role: iv === 0 ? "root" : "tone", label: spellPc(pc, activeKey) });
      }
    }
    litRef.current = true;
    tutor.light(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedal.pc, step, chords]);
  useEffect(() => () => tutor.light(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = buildSuggestionChips({ key: activeKey, chord: step !== null ? chords[step] : chords[0] });

  return (
    <Faceplate label={`pedal-point lab · ${pedalName} under everything`} right={
      <div className="room-tabs" style={{ padding: 4 }}>
        {pedals.map((p, i) => (
          <button key={p.degree} className="room-tab" aria-selected={pedalIdx === i}
            onClick={() => setPedalIdx(i)} style={{ padding: "5px 12px", fontSize: 12 }}>
            the {p.degree}
          </button>
        ))}
      </div>
    }>
      <div className="flex items-stretch kl-stagger" style={{ gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        {chords.map((ch, i) => {
          const rings = lab.marks[i]?.relation === "consonant";
          const active = step === i;
          return (
            <button key={i} onClick={() => tutor.playChord(ch)} title={rings ? "the pedal is a chord tone here — it rings" : "the pedal is outside this chord — it grinds"}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "9px 12px", borderRadius: 11, cursor: "pointer", minWidth: 64,
                background: active ? "rgba(240,180,41,0.10)" : C.panel,
                border: `1px solid ${active ? C.root : C.line}`,
                borderBottom: `3px solid ${rings ? C.tone : C.bass}`,
                transition: "background 140ms ease, border-color 140ms ease",
              }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.faint }}>
                {romanNumeral(ch, activeKey.tonic)}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: C.ink }}>
                {chordSymbol(ch)}/{pedalName}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: rings ? C.toneText : C.bassText }}>
                {rings ? "rings" : "grinds"}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ color: C.ink, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 6px", maxWidth: 640 }}>
        {CONCEPTS.pedal.line}
      </p>
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 12px", maxWidth: 640 }}>
        {CONCEPTS.pedal.bridge}
      </p>

      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        {playing ? (
          <BenchButton primary onClick={stop}><Square size={13} /> Stop</BenchButton>
        ) : (
          <BenchButton primary onClick={play}><Play size={14} /> Hold {pedalName} under it</BenchButton>
        )}
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
          teal rings · coral grinds — listen for the grind letting go
        </span>
      </div>

      <div style={{ marginTop: 14 }}>
        <SuggestionChips chips={chips} onIntent={onIntent} />
      </div>
    </Faceplate>
  );
}
