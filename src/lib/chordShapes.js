// chordShapes.js — guitar chord fingerings, DERIVED, not looked up.
//
// Given a parsed chord and a tuning, search every playable fretting and rank
// by the same taste a guitarist applies at the campfire: open strings beat
// barres, the nut beats the 9th fret, six ringing strings beat three, and the
// root sits on the bottom. The textbook shapes (x32010, 022100, 133211…) are
// not stored anywhere — they win the search, which is what keeps this honest
// in any tuning. Pure (no React/audio/DOM/network).
//
// A shape:
//   { frets, fingers, barre, baseFret, midi, score }
//   frets   — per string low→high; null = muted, 0 = open, n = fret n
//   fingers — per string; null = not fretted, 1–4 (barre strings share 1)
//   barre   — { fret, from, to } or null
//   baseFret— 1 when the nut is in view, else the lowest fretted fret
//   midi    — sounded notes low→high in the given tuning (capo NOT applied;
//             see shapeMidi — shapes are written relative to the capo)
import { STANDARD_TUNING } from "./tuning.js";
import { reduceVoicing } from "./voicing.js";

const pcOf = (m) => ((m % 12) + 12) % 12;
const SPAN = 3; // fretted notes live inside a 4-fret window

// Which chord tones may a shape drop? Triads: none. Four-note chords: only
// the perfect fifth (the classic C7 box x32310 has no G). Bigger chords:
// the same shell a pianist keeps (reduceVoicing: root, a third, a seventh,
// the top tension).
function requiredPcs(chord) {
  const classes = [...new Set(chord.intervals.map(pcOf))];
  let keep;
  if (classes.length <= 3) keep = classes;
  else if (classes.length === 4) keep = classes.filter((i) => i !== 7);
  else keep = [...new Set(reduceVoicing(chord.intervals).map(pcOf))];
  return new Set(keep.map((i) => pcOf(chord.rootSemitone + i)));
}

// Fretting-hand feasibility. ≤4 fretted notes = individual fingers. More
// demands a barre at the lowest fretted fret, and a barre only works when
// every string from its first barred string to the top is fretted at or
// above it (an open string under a barre is a fantasy).
function fingerings(frets) {
  const fretted = [];
  for (let s = 0; s < frets.length; s++) if (frets[s] != null && frets[s] > 0) fretted.push(s);
  const fingers = frets.map(() => null);
  if (!fretted.length) return { fingers, barre: null };
  const minFret = Math.min(...fretted.map((s) => frets[s]));

  if (fretted.length <= 4) {
    const order = [...fretted].sort((a, b) => frets[a] - frets[b] || a - b);
    order.forEach((s, i) => { fingers[s] = i + 1; });
    return { fingers, barre: null };
  }

  const atMin = fretted.filter((s) => frets[s] === minFret);
  if (atMin.length < 2) return null;
  const from = Math.min(...atMin);
  const to = frets.length - 1;
  for (let s = from; s <= to; s++) {
    if (frets[s] == null || frets[s] < minFret) return null;
  }
  const rest = fretted.filter((s) => frets[s] > minFret).sort((a, b) => frets[a] - frets[b] || a - b);
  if (rest.length > 3) return null;
  for (const s of fretted) if (frets[s] === minFret) fingers[s] = 1;
  rest.forEach((s, i) => { fingers[s] = i + 2; });
  return { fingers, barre: { fret: minFret, from, to } };
}

// The taste function. Each term is a piece of real guitar ergonomics or
// campfire convention — the weights were tuned until the textbook shapes win.
function scoreShape(frets, fingers, barre, ctx) {
  const { chordPcsAll, tuning, tensionPcs, rootPc, isPower } = ctx;
  const n = frets.length;
  let opens = 0, sounding = 0, firstSound = -1, lastSound = -1, interior = 0;
  const soundedPcs = new Set();
  let lowest = Infinity, lowestRoot = Infinity;
  for (let s = 0; s < n; s++) {
    if (frets[s] == null) continue;
    sounding++;
    if (firstSound < 0) firstSound = s;
    lastSound = s;
    if (frets[s] === 0) opens++;
    const m = tuning[s] + frets[s];
    if (m < lowest) lowest = m;
    const p = pcOf(m);
    soundedPcs.add(p);
    if (p === rootPc && m < lowestRoot) lowestRoot = m;
  }
  for (let s = firstSound; s <= lastSound; s++) if (frets[s] == null) interior++;
  const leading = firstSound, trailing = n - 1 - lastSound;
  const fretted = frets.filter((f) => f != null && f > 0);
  const baseFret = fretted.length ? Math.min(...fretted) : 1;
  const span = fretted.length ? Math.max(...fretted) - baseFret : 0;
  const distinctFingers = new Set(fingers.filter((f) => f != null)).size;
  const coversAll = [...chordPcsAll].every((p) => soundedPcs.has(p));

  // An open string beside a finger planted at fret 3+ is an arched-finger
  // stunt, not a chord box (kills the "harp voicings" the raw search loves).
  let awkwardOpens = 0;
  for (let s = 0; s < n; s++) {
    if (frets[s] !== 0) continue;
    const left = s > 0 ? frets[s - 1] : null;
    const right = s < n - 1 ? frets[s + 1] : null;
    if ((left != null && left >= 3) || (right != null && right >= 3)) awkwardOpens++;
  }

  // Tensions (the 9 in add9/9, the sus tone) belong above the root's octave;
  // below it they read as add2 mud. Penalized, not banned — a few roots have
  // no octave-up option inside 12 frets.
  let lowTensions = 0;
  if (tensionPcs.size && lowestRoot < Infinity) {
    for (let s = 0; s < n; s++) {
      if (frets[s] == null) continue;
      const m = tuning[s] + frets[s];
      if (tensionPcs.has(pcOf(m)) && m < lowestRoot + 12) lowTensions++;
    }
  }

  return (
    1.6 * opens +
    1.0 * sounding -
    0.9 * distinctFingers -
    (barre ? 1.2 : 0) +
    (barre && barre.to - barre.from >= 4 ? 1.5 : 0) - // the CAGED families
    0.55 * (baseFret - 1) -
    0.6 * span -
    5.5 * interior -
    0.8 * trailing -
    0.5 * leading -
    1.8 * awkwardOpens -
    4.5 * lowTensions +
    (coversAll ? 0.7 : 0) +
    (interior === 0 ? 2.5 : 0) + // one contiguous strum
    (isPower ? 0.3 * (60 - lowest) : 0) // power chords growl low
  );
}

const cache = new Map();
const CACHE_MAX = 300;

/**
 * All playable fingerings for a parsed chord, best first.
 * opts.tuning — ascending MIDI notes per string (default standard six-string)
 * opts.limit  — how many shapes to return (default 6)
 * opts.maxFret— highest fret searched (default 12)
 */
export function chordShapes(chord, { tuning = STANDARD_TUNING, limit = 6, maxFret = 12 } = {}) {
  if (!chord || !Array.isArray(chord.intervals)) return [];
  const rootPc = pcOf(chord.rootSemitone);
  const bassPc = chord.bassSemitone != null ? pcOf(chord.bassSemitone) : rootPc;
  const key = `${rootPc}|${chord.intervals.join(".")}|${bassPc}|${tuning.join(",")}|${maxFret}`;
  let ranked = cache.get(key);

  if (!ranked) {
    const chordPcsAll = new Set(chord.intervals.map((i) => pcOf(chord.rootSemitone + i)));
    chordPcsAll.add(bassPc);
    const required = requiredPcs(chord);
    const nStrings = tuning.length;
    // A power chord is a compact low growl, not a six-string jangle.
    const isPower = new Set(chord.intervals.map(pcOf)).size < 3;
    const maxSounding = isPower ? 4 : Infinity;
    // Which pcs behave as tensions: real extensions (9/11/13), and the sus
    // tone when there is no third to anchor it.
    const hasThird = chord.intervals.some((i) => pcOf(i) === 3 || pcOf(i) === 4);
    const tensionPcs = new Set(
      chord.intervals
        .filter((i) => i > 12 || (!hasThird && (pcOf(i) === 2 || pcOf(i) === 5)))
        .map((i) => pcOf(chord.rootSemitone + i))
    );
    const scoreCtx = { chordPcsAll, tuning, tensionPcs, rootPc, isPower };

    // Per-string options per window: mute, open (if a chord tone), and any
    // in-window fret sounding a chord tone.
    const openPc = tuning.map((m) => pcOf(m));
    const found = new Map(); // frets-key → { frets, score, … }

    for (let w = 1; w <= Math.max(1, maxFret - SPAN); w++) {
      const options = [];
      for (let s = 0; s < nStrings; s++) {
        const o = [null];
        if (chordPcsAll.has(openPc[s])) o.push(0);
        for (let f = w; f <= Math.min(w + SPAN, maxFret); f++) {
          if (chordPcsAll.has(pcOf(tuning[s] + f))) o.push(f);
        }
        options.push(o);
      }

      const frets = new Array(nStrings).fill(null);
      const walk = (s, firstSoundPc) => {
        if (s === nStrings) {
          finish(frets);
          return;
        }
        for (const f of options[s]) {
          frets[s] = f;
          let first = firstSoundPc;
          if (f != null && first == null) {
            first = pcOf(tuning[s] + f);
            if (first !== bassPc) { frets[s] = null; continue; } // bass rule, pruned early
          }
          walk(s + 1, first);
        }
        frets[s] = null;
      };

      const finish = (fr) => {
        const k = fr.map((f) => (f == null ? "x" : f)).join(",");
        if (found.has(k)) return;
        const sounded = [];
        const soundedPcs = new Set();
        for (let s = 0; s < nStrings; s++) {
          if (fr[s] == null) continue;
          sounded.push(tuning[s] + fr[s]);
          soundedPcs.add(pcOf(tuning[s] + fr[s]));
        }
        if (sounded.length < 3 || sounded.length > maxSounding) return;
        for (const p of required) if (!soundedPcs.has(p)) return;
        if (!soundedPcs.has(rootPc)) return;
        sounded.sort((a, b) => a - b);
        if (pcOf(sounded[0]) !== bassPc) return; // the PITCH on the bottom, not just the string
        const fretted = fr.filter((f) => f != null && f > 0);
        if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > SPAN) return;
        const fing = fingerings(fr);
        if (!fing) return;
        const snapshot = fr.slice();
        const score = scoreShape(snapshot, fing.fingers, fing.barre, scoreCtx);
        const baseFret = fretted.length && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1;
        found.set(k, {
          frets: snapshot, fingers: fing.fingers, barre: fing.barre,
          baseFret, midi: sounded, score,
        });
      };

      walk(0, null);
    }

    ranked = [...found.values()].sort(
      (a, b) => b.score - a.score || a.baseFret - b.baseFret ||
        shapeFingerString(a).localeCompare(shapeFingerString(b))
    );
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, ranked);
  }

  return ranked.slice(0, limit);
}

/** "x32010" — the fret string guitarists trade. Frets ≥ 10 wear parens. */
export function shapeFingerString(shape) {
  return shape.frets
    .map((f) => (f == null ? "x" : f >= 10 ? `(${f})` : String(f)))
    .join("");
}

/** Sounded MIDI notes at CONCERT pitch: the tuning in your hands + the capo
 * the shape sits behind. This is what a strum of this shape actually sounds. */
export function shapeMidi(shape, tuning = STANDARD_TUNING, capo = 0) {
  const out = [];
  for (let s = 0; s < shape.frets.length; s++) {
    const f = shape.frets[s];
    if (f == null) continue;
    out.push(tuning[s] + capo + f);
  }
  return out.sort((a, b) => a - b);
}
