// meter.js — the Meter Feel Trainer's core. Pure: grooves that express a
// meter, the downbeat grid, deterministic challenges, and tap scoring.
// The drill is physical, not theoretical: hear a groove, find the ONE, tap it
// — and get told honestly whether you're rushing, dragging, or locked in.
import { DRUMS } from "./band.js";

export const METERS = {
  "4/4": {
    id: "4/4", beatsPerBar: 4,
    line: "Four steady quarters, backbeat in the middle — the meter most of the radio lives in.",
  },
  "3/4": {
    id: "3/4", beatsPerBar: 3,
    line: "ONE two three — the waltz. No backbeat to grab; you find the ONE by the way it leans.",
  },
  "6/8": {
    id: "6/8", beatsPerBar: 6, // counted in eighths; the felt pulse is two dotted quarters
    line: "Six eighths that swing in TWO — count one-two-three-four-five-six, feel ONE... FOUR.",
  },
};

const hit = (t, drum, v, dur = 0.12) => ({ t, dur, midis: [DRUMS[drum]], v, ch: "drums" });

// One bar per meter, authored to EXPRESS the feel without announcing it.
const METER_BAR = {
  "4/4": () => [
    hit(0, "kick", 0.7),
    hit(2, "snare", 0.55),
    hit(1, "hatC", 0.25), hit(3, "hatC", 0.25),
  ],
  "3/4": () => [
    hit(0, "kick", 0.65),
    hit(1, "hatC", 0.28), hit(2, "hatC", 0.2),
  ],
  "6/8": () => [
    hit(0, "kick", 0.7),
    hit(3, "snare", 0.5), // the mid-bar landing: 6/8's second big pulse
    hit(1, "hatC", 0.2), hit(2, "hatC", 0.16), hit(4, "hatC", 0.2), hit(5, "hatC", 0.16),
  ],
};

export function meterGroove(meterId, bars) {
  const meter = METERS[meterId] || METERS["4/4"];
  const barFn = METER_BAR[meter.id] || METER_BAR["4/4"];
  const events = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const e of barFn()) events.push({ ...e, t: bar * meter.beatsPerBar + e.t });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

// Where every ONE lives, in beats.
export function downbeatTimes(meterId, bars) {
  const bpb = (METERS[meterId] || METERS["4/4"]).beatsPerBar;
  return Array.from({ length: bars }, (_, i) => i * bpb);
}

// A deterministic rotation of meter + tempo, so the drill never repeats
// back-to-back and tests can pin it. Seed in, same challenge out, always.
const CHALLENGES = [
  { meterId: "4/4", bpm: 96 },
  { meterId: "3/4", bpm: 108 },
  { meterId: "6/8", bpm: 132 },
  { meterId: "4/4", bpm: 76 },
  { meterId: "3/4", bpm: 88 },
  { meterId: "6/8", bpm: 112 },
];

export function nextChallenge(seed = 0) {
  const i = ((Math.trunc(seed) % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length;
  return { ...CHALLENGES[i] };
}

/**
 * Score a run of taps against the downbeat grid (both in seconds).
 * Each downbeat claims at most its nearest unclaimed tap within `tol`.
 * @returns {{ hits, misses, extras, accuracy, meanOffset, feel }}
 *   meanOffset — signed seconds, negative = early. feel — "rushing" |
 *   "dragging" | "locked", or null when nothing landed.
 */
export function scoreTaps(taps, downbeats, { tol = 0.18 } = {}) {
  const pool = (taps || []).map((t, i) => ({ t, i, used: false }));
  const offsets = [];
  for (const d of downbeats || []) {
    let best = null;
    for (const tap of pool) {
      if (tap.used) continue;
      const off = tap.t - d;
      if (Math.abs(off) > tol) continue;
      if (!best || Math.abs(off) < Math.abs(best.t - d)) best = tap;
    }
    if (best) { best.used = true; offsets.push(best.t - d); }
  }
  const hits = offsets.length;
  const misses = (downbeats || []).length - hits;
  const extras = pool.filter((t) => !t.used).length;
  const meanOffset = hits ? offsets.reduce((s, x) => s + x, 0) / hits : null;
  const feel = meanOffset === null ? null
    : meanOffset < -0.045 ? "rushing"
    : meanOffset > 0.045 ? "dragging"
    : "locked";
  const accuracy = (downbeats || []).length ? hits / downbeats.length : 0;
  return { hits, misses, extras, accuracy, meanOffset, feel };
}
