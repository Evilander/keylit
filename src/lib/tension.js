// tension.js — harmonic tension over a song's timeline, made visible and
// DIAGNOSTIC (not decorative). The model is deliberately simplified after
// Lerdahl's Tonal Pitch Space and the empirical validation in Lerdahl &
// Krumhansl, "Modeling Tonal Tension" (Music Perception 24/4, 2007) — we
// label it "after L&K, simplified" in the UI and never claim more. Huron's
// expectation framing (Sweet Anticipation, 2006) is why the SURPRISE and
// RELEASE markers exist: the pleasure lives where expectation bends.
import { harmonicFunction } from "./theory.js";

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

// Function is the spine of the estimate: rest, motion away, pull home.
const FN_TENSION = { T: 0.08, S: 0.45, D: 0.78, "?": 0.85 };

/** 0..1 tension estimate for one chord in a key. */
export function chordTension(ch, key) {
  const fn = harmonicFunction(ch, key.tonic, key.mode);
  let t = FN_TENSION[fn] ?? 0.5;

  // surface dissonance (Lerdahl's surface-tension term, coarsened)
  const iv = ch.intervals;
  if (iv.includes(10) || iv.includes(11)) t += 0.05;      // any seventh
  if (iv.length > 4) t += 0.05;                           // extensions
  if (iv.includes(6) && iv.includes(3) && !iv.includes(7)) t += 0.14; // diminished
  if (iv.includes(8) && iv.includes(4) && !iv.includes(7)) t += 0.12; // augmented
  if (!iv.includes(3) && !iv.includes(4)) t += 0.04;      // sus/5 — unresolved third

  // out-of-key color (pitch-space distance, coarsened to scale membership)
  const scale = new Set((key.mode === "minor" ? MINOR_SCALE : MAJOR_SCALE).map((s) => (s + key.tonic) % 12));
  const outs = iv.map((i) => (ch.rootSemitone + i) % 12).filter((p) => !scale.has(p)).length;
  t += Math.min(0.18, outs * 0.06);

  // inversion instability: the ground note isn't the root
  if (ch.bassSemitone !== null && ch.bassSemitone !== ch.rootSemitone) t += 0.05;

  return Math.max(0, Math.min(1, t));
}

/**
 * The whole song's curve + the expectation markers.
 * Returns { points: [{ i, t, fn, section, symbol? }], markers: [{ i, kind }] }
 * kind: "surprise" (a jump up you didn't see coming) | "release" (a real landing).
 */
export function tensionCurve(prog, key) {
  const points = (prog || []).map((ch, i) => ({
    i,
    t: chordTension(ch, key),
    fn: harmonicFunction(ch, key.tonic, key.mode),
    section: ch.section || "",
  }));
  const markers = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i].t - points[i - 1].t;
    if (d >= 0.33) markers.push({ i, kind: "surprise" });
    else if (d <= -0.33 && points[i].fn === "T") markers.push({ i, kind: "release" });
  }
  return { points, markers };
}

/** Per-section mean tension, in chart order. [{ section, mean, count }] */
export function sectionTension(points) {
  const order = [];
  const by = new Map();
  for (const p of points) {
    const s = p.section || "—";
    if (!by.has(s)) { by.set(s, { section: s, sum: 0, count: 0 }); order.push(s); }
    const g = by.get(s);
    g.sum += p.t;
    g.count++;
  }
  return order.map((s) => { const g = by.get(s); return { section: g.section, mean: g.sum / g.count, count: g.count }; });
}

/**
 * The diagnosis — plain sentences a songwriter can act on. This is the
 * whole point: a curve you glance at once is furniture; a sentence that
 * names the problem is a tool.
 */
export function tensionDiagnosis(prog, key) {
  const { points } = tensionCurve(prog, key);
  if (points.length < 2) return [];
  const advice = [];
  const secs = sectionTension(points);

  const find = (re) => secs.filter((s) => re.test(s.section));
  const verses = find(/verse/i);
  const choruses = find(/chorus/i);
  if (verses.length && choruses.length) {
    const v = Math.max(...verses.map((s) => s.mean));
    const c = Math.max(...choruses.map((s) => s.mean));
    if (c <= v + 0.05) {
      advice.push("Your chorus doesn't sit above the verse — that's why it may not feel like arrival. The cheapest lifts: end the verse on the 5 (V) so the chorus resolves it, or open the chorus on the 4 (IV) instead of home.");
    } else if (c - v > 0.12) {
      advice.push("The chorus genuinely lifts above the verse — the release is structural, not just louder. That shape is doing its job.");
    }
  }

  const spread = Math.max(...points.map((p) => p.t)) - Math.min(...points.map((p) => p.t));
  if (spread < 0.25) {
    advice.push("The whole song sits at one tension level. Hypnotic if you mean it — Kozelek means it — but if a section is supposed to arrive, nothing here rises to make room for it.");
  }

  if (!points.some((p) => p.fn === "D")) {
    advice.push("There's no pull chord (D function) anywhere — nothing asks to come home. Even one 5 (V) before a section returns gives the ear a doorway.");
  }

  const last = points[points.length - 1];
  if (last.fn !== "T") {
    advice.push(`It ends away from home (${last.fn === "D" ? "on the pull" : "mid-motion"}). Powerful if chosen — the ear leaves leaning forward. Accidental? Land the last chord on the 1.`);
  }

  return advice;
}
