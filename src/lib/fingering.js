// fingering.js — suggested piano fingerings for tab-derived note events.
// Pure (no React/audio/DOM/network).
//
// Model: the beginner "five-finger position" — the hand parks over a window of
// keys, fingers 1–5 map to offsets inside it, and the hand SHIFTS only when a
// note escapes the window (the thumb-under moment). Chords get span-based
// fingerings (1-3-5 style). These are playability suggestions, not editorial
// fingerings. Fingers: 1 = thumb … 5 = pinky, both hands (piano convention).

const pcMod = (n) => ((n % 12) + 12) % 12;
const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (midi) => BLACK.has(pcMod(midi));

// Offset above the window bottom (semitones, 0–7) → RH finger. LH mirrors.
const OFFSET_FINGER = [1, 2, 2, 3, 3, 4, 4, 5];

// Plant a five-finger window so the entry note lands at one end of it.
// side "low" = note at the window bottom, "high" = at the top. If the entry
// note would sit under a THUMB on a black key, nudge it onto finger 2.
function plantWindow(midi, side, hand) {
  const entryIsThumb = (hand === "R" && side === "low") || (hand === "L" && side === "high");
  if (entryIsThumb && isBlackKey(midi)) return side === "low" ? midi - 2 : midi - 5;
  return side === "low" ? midi : midi - 7;
}

/**
 * Finger one melodic note in a sticky window. `state` persists between calls:
 * { pos } = midi of the window bottom. `nextMidi` (optional) lets the first
 * note of a fresh position anticipate the line's direction.
 */
export function melodicFinger(midi, hand, state, nextMidi = null) {
  if (state.pos == null) {
    const descending = nextMidi != null && nextMidi < midi;
    // RH ascending enters on the thumb (window bottom); descending on the
    // pinky (top). The left hand mirrors both.
    const side = (hand === "R") !== descending ? "low" : "high";
    state.pos = plantWindow(midi, side, hand);
  }
  let off = midi - state.pos;
  state.shifted = false;
  if (off < 0 || off > 7) {
    const side = off > 7 ? (hand === "R" ? "low" : "high") : (hand === "R" ? "high" : "low");
    state.pos = plantWindow(midi, side, hand);
    state.shifted = true;
    off = midi - state.pos;
  }
  const f = OFFSET_FINGER[Math.max(0, Math.min(7, off))];
  return hand === "R" ? f : 6 - f;
}

/**
 * Fingering for a block chord in one hand, aligned to ASCENDING midis.
 * RH: thumb takes the lowest note. LH: pinky takes the lowest (mirror).
 */
export function chordFingers(midis, hand) {
  const m = [...midis].sort((a, b) => a - b);
  const n = m.length;
  const span = m[n - 1] - m[0];
  let up;
  if (n === 1) up = [3];
  else if (n === 2) up = span >= 7 ? [1, 5] : span >= 4 ? [1, 3] : [1, 2];
  else if (n === 3) up = span >= 7 ? [1, 3, 5] : span >= 5 ? [1, 2, 4] : [1, 2, 3];
  else if (n === 4) up = m[2] - m[1] > m[3] - m[2] ? [1, 2, 4, 5] : [1, 2, 3, 5];
  else { up = [1, 2, 3, 4, 5]; while (up.length < n) up.push(5); }
  return hand === "L" ? up.map((f) => 6 - f) : up;
}

/**
 * Split one event's midis between the hands. Wide events split at the biggest
 * internal gap; narrow ones go to one hand by register, sticky against the
 * previous event so melodies don't flip-flop hands.
 */
export function splitHands(midis, prev = null) {
  const m = [...midis].sort((a, b) => a - b);
  if (!m.length) return { L: [], R: [] };
  const span = m[m.length - 1] - m[0];
  if (m.length > 1 && span > 14) {
    // Pick the split that keeps both hands playable: minimize the larger
    // hand span; break ties toward the bigger gap between the hands.
    let best = 1, bestSpan = Infinity, bestGap = -1;
    for (let i = 1; i < m.length; i++) {
      const spanL = m[i - 1] - m[0];
      const spanR = m[m.length - 1] - m[i];
      const worst = Math.max(spanL, spanR);
      const gap = m[i] - m[i - 1];
      if (worst < bestSpan || (worst === bestSpan && gap > bestGap)) {
        best = i; bestSpan = worst; bestGap = gap;
      }
    }
    return { L: m.slice(0, best), R: m.slice(best) };
  }
  const center = (m[0] + m[m.length - 1]) / 2;
  let hand = center < 52 ? "L" : "R"; // ~E3 boundary
  if (prev && prev.hand && Math.abs(center - prev.center) < 5) hand = prev.hand;
  return hand === "L" ? { L: m, R: [] } : { L: [], R: m };
}

/**
 * Annotate tab events (from tab.js parseTab) with hands + fingers.
 * events: [{ notes: [{ midi, … }] }] → same shape; every note gains
 * { hand: "L"|"R", finger: 1–5 } and midi is transposed by `shift`.
 * event.handShift = true when the hand had to move to reach it.
 */
export function fingerEvents(events, shift = 0) {
  const state = { L: { pos: null }, R: { pos: null } };
  let prevHand = null;
  return events.map((ev, i) => {
    const midis = ev.notes.map((n) => n.midi + shift);
    const { L, R } = splitHands(midis, prevHand);
    const sorted = [...midis].sort((a, b) => a - b);
    prevHand = {
      center: sorted.length ? (sorted[0] + sorted[sorted.length - 1]) / 2 : 60,
      hand: L.length && !R.length ? "L" : "R",
    };
    const nextEv = events[i + 1];
    const nextMidi = nextEv && nextEv.notes.length === 1 ? nextEv.notes[0].midi + shift : null;
    const byMidi = new Map();
    let handShift = false;
    for (const [hand, group] of [["L", L], ["R", R]]) {
      if (!group.length) continue;
      if (group.length === 1) {
        byMidi.set(group[0], { hand, finger: melodicFinger(group[0], hand, state[hand], nextMidi) });
        if (state[hand].shifted) handShift = true;
      } else {
        const fingers = chordFingers(group, hand);
        group.forEach((midi, gi) => byMidi.set(midi, { hand, finger: fingers[gi] }));
        state[hand].pos = null; // a chord re-plants the hand
      }
    }
    return {
      ...ev,
      handShift,
      notes: ev.notes.map((n) => {
        const tag = byMidi.get(n.midi + shift) || { hand: "R", finger: 3 };
        return { ...n, midi: n.midi + shift, hand: tag.hand, finger: tag.finger };
      }),
    };
  });
}
