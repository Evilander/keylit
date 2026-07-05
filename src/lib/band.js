// band.js — the rhythm section. Pure: chords in, timed note events out
// (beats domain), exactly like arrange.js; src/audio/engine.js gives them
// sound and lib/midi.js#eventsToMidiTracks gives them a DAW-ready file.
//
// Three players live here:
//   - the BASSIST (bassLine): style-aware lines from long ballad roots to a
//     genuine four-to-the-bar walking line with passing and approach tones.
//   - the DRUMMER (drumGroove): General MIDI kit pieces, one tasteful groove
//     per style — brushes-soft for ballads, a backbeat for boom-chick, and
//     the classic swing ride for After Hours.
//   - the COUNT-OFF (countIn / metronome): stick clicks with the ONE accented.
//
// The iron rule extends to the bass: strong beats are chord tones (or the
// written slash bass); anything else must be a genuine passing or approach
// tone — stepwise into its target, never a stray. Tests enforce all of it.
//
// Swing lives here too: patterns are authored on a straight-eighth grid and
// applySwing() moves every off-beat eighth to the swing point, so one groove
// definition serves both feels and the .mid export is exactly what you hear.
import { STYLES, arrangeProgression } from "./arrange.js";

// General MIDI percussion (channel 10) — the kit pieces the Bench owns.
export const DRUMS = {
  kick: 36,   // acoustic bass drum
  stick: 37,  // side stick — the ballad's backbeat
  snare: 38,  // acoustic snare
  hatC: 42,   // closed hi-hat
  hatP: 44,   // pedal hi-hat — the drummer's left foot on 2 and 4
  hatO: 46,   // open hi-hat
  crash: 49,  // crash cymbal
  ride: 51,   // ride cymbal — where swing lives
  bell: 53,   // ride bell
  shaker: 70, // maracas/shaker
};

const pc = (m) => ((m % 12) + 12) % 12;
const bassPcOf = (ch) => pc(ch.bassSemitone !== null ? ch.bassSemitone : ch.rootSemitone);

// Where an upright bass lives: D1..G3.
const BASS_LO = 26, BASS_HI = 55;
const BASS_CENTER = 38; // D2 — lines gravitate here

// The chord's fifth/third as intervals from its root (dim/aug/sus aware).
const fifthIv = (ch) => { for (const iv of [7, 6, 8]) if (ch.intervals.includes(iv)) return iv; return null; };
const thirdIv = (ch) => { for (const iv of [4, 3, 2, 5]) if (ch.intervals.includes(iv)) return iv; return null; };

// Place a pitch class in the octave nearest `ref`, clamped to the bass range.
function place(pitchClass, ref) {
  let m = pitchClass + 12 * Math.round((ref - pitchClass) / 12);
  while (m < BASS_LO) m += 12;
  while (m > BASS_HI) m -= 12;
  return m;
}

/* ---- swing ------------------------------------------------------------- */

// Move every off-beat eighth (t % 1 === 0.5) to the swing point: with the
// default 2/3 ratio a pair of straight eighths becomes the triplet feel.
// Down-beats and non-eighth subdivisions are untouched. Pure — returns copies.
export function applySwing(events, ratio = 2 / 3) {
  return (events || []).map((e) => {
    const frac = e.t - Math.floor(e.t);
    if (Math.abs(frac - 0.5) < 1e-9) return { ...e, t: Math.floor(e.t) + ratio };
    return e;
  });
}

/* ---- clicks ------------------------------------------------------------ */

const hit = (t, drum, v, dur = 0.12) => ({ t, dur, midis: [DRUMS[drum]], v, ch: "drums" });

// One bar of stick clicks before the band enters. The ONE is accented so the
// player knows where home is before a note sounds.
export function countIn(beatsPerBar) {
  const out = [];
  for (let b = 0; b < beatsPerBar; b++) {
    out.push({ ...hit(b, "stick", b === 0 ? 0.9 : 0.55), count: true });
  }
  return out;
}

// A plain metronome: every beat clicks, every downbeat is accented.
export function metronome(bars, beatsPerBar) {
  const out = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let b = 0; b < beatsPerBar; b++) {
      out.push(hit(bar * beatsPerBar + b, "stick", b === 0 ? 0.85 : 0.45));
    }
  }
  return out;
}

/* ---- the drummer -------------------------------------------------------- */

// One bar of groove per style, local beat times, straight grid. Swing is
// applied later so the definitions stay readable.
const GROOVE_BAR = {
  ballad: () => [
    hit(0, "kick", 0.6),
    hit(2, "stick", 0.5),
    hit(0, "hatC", 0.3), hit(1, "hatC", 0.2), hit(2, "hatC", 0.24), hit(3, "hatC", 0.2),
  ],
  waltz: () => [
    hit(0, "kick", 0.55),
    hit(1, "hatC", 0.26), hit(2, "hatC", 0.2),
  ],
  boomchick: () => [
    hit(0, "kick", 0.8), hit(2, "kick", 0.7),
    hit(1, "snare", 0.55), hit(3, "snare", 0.58),
    ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => hit(t, "hatC", t % 1 ? 0.14 : 0.22)),
  ],
  broken: () => [
    hit(0, "kick", 0.5),
    hit(2, "stick", 0.4),
    ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => hit(t, "hatC", t % 1 ? 0.1 : 0.16)),
  ],
  // The classic swing ride — "ding, ding-ga-ding" — with the left foot
  // closing the hat on 2 and 4 and a feathered kick under the ONE.
  afterhours: () => [
    hit(0, "ride", 0.5), hit(1, "ride", 0.42), hit(1.5, "ride", 0.3),
    hit(2, "ride", 0.48), hit(3, "ride", 0.42), hit(3.5, "ride", 0.3),
    hit(1, "hatP", 0.38), hit(3, "hatP", 0.38),
    hit(0, "kick", 0.18),
  ],
};

// A groove for `bars` bars of a style. Each event carries the bar it belongs
// to as stepIdx (one bar per chord everywhere in Keylit).
export function drumGroove(styleId, bars) {
  const style = STYLES[styleId] || STYLES.ballad;
  const barFn = GROOVE_BAR[style.id] || GROOVE_BAR.ballad;
  const events = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const e of barFn()) {
      events.push({ ...e, t: bar * style.beatsPerBar + e.t, stepIdx: bar });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

/* ---- the bassist --------------------------------------------------------- */

// An approach note into `target`: the chromatic neighbor on the side the line
// is coming from, flipped if that would leave the instrument.
function approach(target, from) {
  let m = target + (from >= target ? 1 : -1);
  if (m < BASS_LO || m > BASS_HI) m = target + (from >= target ? -1 : 1);
  return m;
}

// The full walking engine (After Hours): four quarters to the bar.
//   beat 1 — the written bass (slash-aware), placed near the previous note
//   beat 2 — the third (or a chromatic passing tone when the line is stepwise)
//   beat 3 — the fifth (falling back to third, then root)
//   beat 4 — a chromatic approach into the NEXT bar's downbeat
// The next bar's downbeat is planned first so the approach is honest; the
// last bar resolves on chord tones instead of dangling on a leading note.
function walkingBars(chords) {
  const n = chords.length;
  const bars = [];
  let prevNote = null;
  let plannedDown = null; // the downbeat the previous approach aimed at
  for (let i = 0; i < n; i++) {
    const ch = chords[i];
    const b0 = plannedDown ?? place(bassPcOf(ch), prevNote ?? BASS_CENTER);
    const f = fifthIv(ch), t3 = thirdIv(ch);
    const b2pc = f !== null ? pc(ch.rootSemitone + f) : t3 !== null ? pc(ch.rootSemitone + t3) : pc(ch.rootSemitone);
    const b2 = place(b2pc, b0);
    let b1;
    const thirdPc = t3 !== null ? pc(ch.rootSemitone + t3) : null;
    if (thirdPc !== null && thirdPc !== pc(b2)) {
      b1 = place(thirdPc, Math.round((b0 + b2) / 2));
    } else if (Math.abs(b2 - b0) === 2) {
      b1 = b0 + (b2 > b0 ? 1 : -1); // chromatic passing tone, stepwise both ways
    } else {
      b1 = b0; // restate the root — always safe
    }
    let b3;
    if (i === n - 1) {
      b3 = place(pc(ch.rootSemitone), b2); // resolve home
      plannedDown = null;
    } else {
      plannedDown = place(bassPcOf(chords[i + 1]), b2);
      b3 = approach(plannedDown, b2);
    }
    bars.push([b0, b1, b2, b3]);
    prevNote = b3;
  }
  return bars;
}

/**
 * A bass line for the whole progression, one bar per chord, in the style's
 * meter. Returns events tagged ch:"bass" with stepIdx per bar.
 */
export function bassLine(prog, styleId) {
  const chords = prog || [];
  if (!chords.length) return [];
  const style = STYLES[styleId] || STYLES.ballad;
  const bpb = style.beatsPerBar;
  const ev = (t, midi, dur, v, stepIdx) => ({ t, dur, midis: [midi], v, ch: "bass", stepIdx });
  const events = [];

  if (style.id === "afterhours") {
    walkingBars(chords).forEach((bar, i) => {
      const vs = [0.85, 0.7, 0.8, 0.72];
      bar.forEach((m, b) => events.push(ev(i * bpb + b, m, 0.95, vs[b], i)));
    });
    return events;
  }

  let prev = null;
  chords.forEach((ch, i) => {
    const t0 = i * bpb;
    const b0 = place(bassPcOf(ch), prev ?? BASS_CENTER);
    prev = b0;
    const f = fifthIv(ch);
    const fifth = f !== null ? place(pc(ch.rootSemitone + f), b0) : place(pc(ch.rootSemitone), b0 + 5);
    switch (style.id) {
      case "waltz":
        events.push(ev(t0, b0, bpb - 0.1, 0.8, i));
        break;
      case "boomchick":
        events.push(ev(t0, b0, 0.95, 0.85, i));
        events.push(ev(t0 + 2, fifth, 0.95, 0.75, i));
        break;
      case "broken":
        // Root hands off to the fifth at beat 3 — the bass is ONE voice
        // (a MonoSynth live, a mono stem in the export; they must agree).
        events.push(ev(t0, b0, 1.95, 0.7, i));
        events.push(ev(t0 + 2, fifth, 1.9, 0.5, i));
        break;
      default: { // ballad — a long root, then a lead-in to the next bar
        events.push(ev(t0, b0, bpb - 1.1, 0.8, i));
        const next = chords[i + 1];
        const lead = next && bassPcOf(next) !== bassPcOf(ch)
          ? approach(place(bassPcOf(next), b0), b0)
          : fifth;
        events.push(ev(t0 + bpb - 1, lead, 0.9, 0.6, i));
      }
    }
  });
  return events;
}

/* ---- the whole stage ------------------------------------------------------ */

/**
 * Arrange the full band behind a chart. The piano part comes straight from
 * arrangeProgression; when the bassist is on, the piano's left-hand events are
 * dropped (the low end belongs to one player at a time). Swing styles swing
 * every part identically, so live playback and the export always agree.
 *
 * @param {object} opts { bass=true, drums=true, count=false, swingRatio=2/3 }
 * @returns {{ events, tracks:{piano,bass,drums}, totalBeats, beatsPerBar,
 *             style, swing, countInBeats }}
 *   events — the live timeline (count-in included, offset applied), sorted.
 *   tracks — per-part events starting at 0, no count-in: export-ready.
 */
export function arrangeBand(prog, styleId, opts = {}) {
  const { bass = true, drums = true, count = false, swingRatio = 2 / 3 } = opts;
  const style = STYLES[styleId] || STYLES.ballad;
  const chords = prog || [];
  const pianoArr = arrangeProgression(chords, style.id);

  let piano = pianoArr.events
    .filter((e) => !bass || e.hand !== "L")
    .map((e) => ({ ...e, ch: "piano" }));
  let bassEvents = bass && chords.length ? bassLine(chords, style.id) : [];
  let drumEvents = drums && chords.length ? drumGroove(style.id, chords.length) : [];

  const swing = !!style.swing;
  if (swing) {
    piano = applySwing(piano, swingRatio);
    bassEvents = applySwing(bassEvents, swingRatio);
    drumEvents = applySwing(drumEvents, swingRatio);
  }

  const tracks = { piano, bass: bassEvents, drums: drumEvents };
  const countEvents = count && chords.length ? countIn(style.beatsPerBar) : [];
  const countInBeats = countEvents.length ? style.beatsPerBar : 0;
  const shift = (es) => (countInBeats ? es.map((e) => ({ ...e, t: e.t + countInBeats })) : es);

  const events = [...countEvents, ...shift(piano), ...shift(bassEvents), ...shift(drumEvents)]
    .sort((a, b) => a.t - b.t);

  return {
    events,
    tracks,
    totalBeats: pianoArr.totalBeats + countInBeats,
    beatsPerBar: style.beatsPerBar,
    style: style.id,
    swing,
    countInBeats,
  };
}
