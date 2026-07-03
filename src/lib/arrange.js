// arrange.js — the Arranger: pattern engines that turn a chord chart into
// piano MUSIC instead of block pads. Pure: chords in, timed note events out
// (beats domain); src/audio/engine.js#playEvents gives them time.
//
// The iron rule (enforced by tests): every emitted pitch class belongs to its
// chord — or to the chord's written slash bass. Patterns place CHORD-degree
// pitch classes, never keyboard-relative offsets, so a wrong note is
// impossible by construction. Upper structures come from smoothUpper, so the
// right hand voice-leads exactly like the rest of Keylit.
import { smoothUpper, rootPositionUpper } from "./voicing.js";

export const STYLES = {
  ballad:    { id: "ballad",    name: "Bench Ballad", beatsPerBar: 4, line: "bass + shell on 1, a soft re-press on 3 — the slow-burn default" },
  waltz:     { id: "waltz",     name: "Waltz",        beatsPerBar: 3, line: "ONE two three — bass note, then the chord breathes twice" },
  boomchick: { id: "boomchick", name: "Boom-Chick",   beatsPerBar: 4, line: "root, chord, fifth, chord — the Carter strum moved to stride" },
  broken:    { id: "broken",    name: "Broken",       beatsPerBar: 4, line: "held bass under rolling eighths — Travis picking for ten fingers" },
};

const pc = (m) => ((m % 12) + 12) % 12;

// The chord's fifth, as an interval from its root (dim/aug aware).
const fifthInterval = (ch) => {
  for (const iv of [7, 6, 8]) if (ch.intervals.includes(iv)) return iv;
  return null;
};

// Low-register anchor for the WRITTEN bass (slash-aware): C2..B2.
const bassMidi = (ch) => 36 + pc(ch.bassSemitone !== null ? ch.bassSemitone : ch.rootSemitone);

// The chord's fifth placed as the next occurrence ABOVE a reference key.
// (Interval math runs root-relative; only the placement hangs off the bass.)
const fifthAbove = (ch, ref) => {
  const iv = fifthInterval(ch);
  if (iv === null) return ref + 12;                     // no fifth: octave stays in-chord
  const target = pc(ch.rootSemitone + iv);
  const step = (target - pc(ref) + 12) % 12;
  return ref + (step === 0 ? 12 : step);
};

const upperVoicing = (ch, prevUp) => {
  const up = smoothUpper(ch, prevUp);
  return up && up.length ? up : rootPositionUpper(ch);
};

/* ---- the patterns: one bar of events per chord, local beat times ---- */

function barBallad(ch, up) {
  const b = bassMidi(ch);
  return [
    { t: 0, dur: 3.9, midis: [b, fifthAbove(ch, b)], hand: "L", v: 0.92 },
    { t: 0, dur: 2.6, midis: [...up], hand: "R", v: 0.85 },
    { t: 2, dur: 1.9, midis: [...up], hand: "R", v: 0.55 },
  ];
}

function barWaltz(ch, up) {
  const b = bassMidi(ch);
  return [
    { t: 0, dur: 2.9, midis: [b], hand: "L", v: 0.95 },
    { t: 1, dur: 0.85, midis: [...up], hand: "R", v: 0.6 },
    { t: 2, dur: 0.85, midis: [...up], hand: "R", v: 0.52 },
  ];
}

function barBoomChick(ch, up) {
  const b = bassMidi(ch);
  return [
    { t: 0, dur: 0.95, midis: [b], hand: "L", v: 0.95 },
    { t: 1, dur: 0.5, midis: [...up], hand: "R", v: 0.6 },
    { t: 2, dur: 0.95, midis: [fifthAbove(ch, b)], hand: "L", v: 0.85 },
    { t: 3, dur: 0.5, midis: [...up], hand: "R", v: 0.58 },
  ];
}

function barBroken(ch, up) {
  const b = bassMidi(ch);
  const sorted = [...up].sort((x, y) => x - y);
  const low = sorted[0], top = sorted[sorted.length - 1];
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  const roll = [low, top, mid, top, low, top, mid, top];
  const events = [{ t: 0, dur: 3.9, midis: [b], hand: "L", v: 0.9 }];
  roll.forEach((m, k) => {
    events.push({ t: k * 0.5, dur: 0.48, midis: [m], hand: "R", v: k % 2 ? 0.5 : 0.68 });
  });
  return events;
}

const BAR_FN = { ballad: barBallad, waltz: barWaltz, boomchick: barBoomChick, broken: barBroken };

/**
 * Arrange a progression: one bar per chord in the chosen style.
 * @returns {{ events: Array<{t,dur,midis,hand,v,stepIdx}>, totalBeats, beatsPerBar, style }}
 */
export function arrangeProgression(prog, styleId) {
  const style = STYLES[styleId] || STYLES.ballad;
  const barFn = BAR_FN[style.id];
  const events = [];
  let prevUp = null;
  (prog || []).forEach((ch, i) => {
    const up = upperVoicing(ch, prevUp);
    prevUp = up;
    for (const e of barFn(ch, up)) {
      events.push({ ...e, t: i * style.beatsPerBar + e.t, stepIdx: i });
    }
  });
  events.sort((a, b) => a.t - b.t);
  return { events, totalBeats: (prog || []).length * style.beatsPerBar, beatsPerBar: style.beatsPerBar, style: style.id };
}
