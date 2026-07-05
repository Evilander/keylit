// pedal.js — the Pedal-Point Lab's core. Pure: a progression plus one held
// pitch class in, a playable timeline plus consonant/dissonant marks out.
// The lesson IS the grind: a pedal that lands inside the chord glows, one that
// lands outside it rubs — and hearing the rub resolve is the whole point.
import { pedalRelation } from "./theory.js";
import { smoothUpper, rootPositionUpper } from "./voicing.js";

// The classic pedal choices for a key: the tonic and the dominant. (Organists
// have been holding these two under everything for four hundred years.)
export function suggestPedals(key) {
  const tonic = ((key?.tonic ?? 0) % 12 + 12) % 12;
  return [
    { pc: tonic, degree: "1" },
    { pc: (tonic + 7) % 12, degree: "5" },
  ];
}

// Keep a voicing clear of the drone: lift whole octaves until its floor sits
// above the pedal's register. The drone owns the bottom of the instrument.
function liftAbove(notes, floor) {
  let out = [...notes];
  while (Math.min(...out) <= floor) out = out.map((m) => m + 12);
  return out;
}

/**
 * A play-through for the lab: the pedal drones once per bar (full-bar, low),
 * the chords breathe above it on beats 1 and 3, and every bar is marked
 * consonant or dissonant against the pedal.
 * @returns {{ events, marks:[{stepIdx, relation}], totalBeats, beatsPerBar }}
 */
export function pedalEvents(prog, pedalPc, { beatsPerBar = 4 } = {}) {
  const chords = prog || [];
  const p = ((pedalPc % 12) + 12) % 12;
  const droneMidi = 36 + p; // C2..B2 — organ-pedal territory
  const events = [];
  const marks = [];
  let prevUp = null;

  chords.forEach((ch, i) => {
    const t0 = i * beatsPerBar;
    events.push({ t: t0, dur: beatsPerBar - 0.02, midis: [droneMidi], v: 0.55, ch: "bass", stepIdx: i });

    const up = smoothUpper(ch, prevUp) || rootPositionUpper(ch);
    prevUp = up;
    const above = liftAbove(up, droneMidi + 4);
    events.push({ t: t0, dur: 1.9, midis: above, v: 0.6, ch: "piano", stepIdx: i });
    events.push({ t: t0 + 2, dur: 1.7, midis: above, v: 0.45, ch: "piano", stepIdx: i });

    marks.push({ stepIdx: i, relation: pedalRelation(p, ch) });
  });

  events.sort((a, b) => a.t - b.t);
  return { events, marks, totalBeats: chords.length * beatsPerBar, beatsPerBar };
}
