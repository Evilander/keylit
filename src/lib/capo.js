// capo.js — capo + open-tuning advisor.
//
// Given a chord progression, rank the best ways to PLAY it: across alternate
// tunings AND capo positions, scoring playability authentically and
// explaining HOW each chord is fingered. Pure: no DOM/audio/network, depends
// only on theory.js (chord math + standard-tuning shape ease) and tuning.js
// (the named-tuning fretboard model).

import { parseChord, chordSymbol, shapeForCapo, shapeEase } from "./theory.js";
import { getTuning, uniformTuningOffset } from "./tuning.js";
import { chordShapes } from "./chordShapes.js";

const pcMod = (n) => ((n % 12) + 12) % 12;

/* ---- what chord do the open strings sound? ----
 * Strum every string open. If the resulting pitch classes are exactly a
 * major triad {r, r+4, r+7} (open-major tunings: openD/E/G/A/C) or a sus4
 * {r, r+5, r+7} (DADGAD), there's a "free" chord at fret 0 and full barres
 * elsewhere. Anything else (standard, drop D, modal re-spellings that don't
 * collapse to 3 pitch classes) has no free chord — you finger normal
 * open-position/CAGED shapes instead. */
export function classifyOpen(notes) {
  const pcs = [...new Set(notes.map((n) => pcMod(n)))];
  if (pcs.length === 3) {
    for (const r of pcs) {
      const triad = new Set([r, pcMod(r + 4), pcMod(r + 7)]);
      if (triad.size === 3 && pcs.every((p) => triad.has(p))) {
        return { rootPc: r, quality: "maj" };
      }
    }
    for (const r of pcs) {
      const sus4 = new Set([r, pcMod(r + 5), pcMod(r + 7)]);
      if (sus4.size === 3 && pcs.every((p) => sus4.has(p))) {
        return { rootPc: r, quality: "sus4" };
      }
    }
  }
  return { rootPc: null, quality: "standard" };
}

/* ---- triad/seventh family, read straight off the chord's intervals ----
 * Tuning-independent: this is what the sounding chord IS, not how it's
 * fingered. Drives which barre-tuning fingering recipe applies. */
export function classifyChord(chord) {
  const has = (n) => chord.intervals.includes(n);
  if (has(3) && has(6) && !has(7)) return "dim";
  if (has(4) && has(8) && !has(7)) return "aug";
  const third = has(4) ? "maj" : has(3) ? "min" : "none";
  if (has(10) && third === "maj") return "dom7";
  if (third === "min") return "min";
  if (third === "maj") return "maj";
  return "sus";
}

/* ---- how do you finger `chord` (sounding), in `tuning`, capo at `capo`? ----
 * Returns { fret, ease, how }. Lower ease = easier. `fret` is the barre fret
 * for open-major/sus4 tunings, or null when you're fingering a normal
 * standard-family open/CAGED shape (capo position is baked into `how`/`ease`
 * via the transposed shape instead). */
export function playInTuning(chord, tuning, capo) {
  const open = classifyOpen(tuning.notes);
  const uniform = uniformTuningOffset(tuning.id);

  if (uniform !== null) {
    // No free chord in the open strings: finger the normal open-position/
    // CAGED shape you'd use under this capo position in standard tuning.
    const shape = shapeForCapo(chord, capo + uniform);
    return { fret: null, ease: shapeEase(shape), how: `${chordSymbol(shape)} shape` };
  }

  if (open.rootPc != null) {
    const f = pcMod(chord.rootSemitone - open.rootPc - capo);
    const barreMidis = tuning.notes.map((m) => m + capo + f);
    const sounded = new Set(barreMidis.map(pcMod));
    const wanted = new Set(chord.intervals.map((iv) => pcMod(chord.rootSemitone + iv)));
    const correctBass = chord.bassSemitone == null || pcMod(Math.min(...barreMidis)) === chord.bassSemitone;
    if (correctBass && sounded.size === wanted.size && [...sounded].every((pc) => wanted.has(pc))) {
      return {
        fret: f, frets: tuning.notes.map(() => f), ease: f === 0 ? 0.5 : 1.0 + f * 0.03,
        how: f === 0 ? "all open" : `barre fret ${f}`,
      };
    }
  }

  // Anything beyond the tuning's exact open chord needs real fretting.
  // Searching the existing grip engine keeps thirds, extensions, and slash
  // basses honest instead of treating every major-family chord as a barre.
  const relative = shapeForCapo(chord, capo);
  const grip = chordShapes(relative, { tuning: tuning.notes, limit: 1 })[0];
  if (!grip) return { fret: null, ease: 6, how: "no complete grip found within 12 frets" };
  const fretted = grip.frets.filter((f) => f > 0);
  const fingers = new Set(grip.fingers.filter((f) => f != null)).size;
  const opens = grip.frets.filter((f) => f === 0).length;
  let ease = Math.max(0.6, 0.6 + fingers * 0.5 + (grip.barre ? 0.8 : 0) + Math.max(0, grip.baseFret - 1) * 0.08 - opens * 0.12);
  if (tuning.id === "dropD" && relative.rootSemitone === 2) ease = Math.min(ease, Math.max(0.4, shapeEase(relative) - 0.4));
  return { fret: fretted.length ? Math.min(...fretted) : 0, frets: grip.frets.slice(), ease, how: `frets low→high: ${grip.frets.map((f) => f == null ? "x" : f).join(" ")}` };
}

// Retuning is real effort — added once per (tuning, capo) result so a switch
// only surfaces when it clearly wins. Drop D's friction is set equal to its
// D-chord ease discount (both 0.4): a single open D chord in an otherwise
// all-open-in-standard progression should net to a wash, not a recommendation
// to retune, with the tie resolved toward standard by the sort tiebreak below.
const TUNING_FRICTION = { standard: 0, dropD: 0.4 };
const frictionFor = (id) => TUNING_FRICTION[id] ?? 1.0;

const DEFAULT_TUNINGS = ["standard", "dropD", "openD", "openE", "openG", "openA", "openC", "DADGAD"];

// A short, human sentence explaining why this arrangement is (or isn't) easy.
function describeArrangement(tuning, capo, shapes) {
  const capoTxt = capo > 0 ? ` capo ${capo}` : "";
  const easy = shapes.filter((s) => s.ease <= 1.0).map((s) => s.symbol);
  const hard = shapes.filter((s) => s.ease > 1.0);
  if (!hard.length) {
    return `${tuning.name}${capoTxt} — ${easy.join(", ") || "every chord"} ${
      easy.length === 1 ? "is" : "are"
    } open or near-open.`;
  }
  const hardTxt = hard.map((s) => `${s.symbol} (${s.how})`).join(", ");
  if (!easy.length) return `${tuning.name}${capoTxt} — ${hardTxt}.`;
  return `${tuning.name}${capoTxt} — ${easy.join(", ")} ${
    easy.length === 1 ? "is" : "are"
  } open; ${hardTxt}.`;
}

// Rank every (tuning, capo) combination for a progression, best (easiest)
// first. `prog` may be chord-symbol strings or already-parsed chord objects.
export function suggestArrangements(prog, opts = {}) {
  const { tunings = DEFAULT_TUNINGS, maxFret = 7 } = opts;
  const chords = prog.map((c) => (typeof c === "string" ? parseChord(c) : c)).filter(Boolean);

  // Frequency-weight: the chord you play most should dominate the choice.
  const counts = new Map();
  const uniq = [];
  const seen = new Set();
  for (const ch of chords) {
    const sym = chordSymbol(ch);
    counts.set(sym, (counts.get(sym) || 0) + 1);
    if (!seen.has(sym)) { seen.add(sym); uniq.push(ch); }
  }

  const results = [];
  for (const tid of tunings) {
    const tuning = getTuning(tid);
    const friction = frictionFor(tid);
    for (let capo = 0; capo <= maxFret; capo++) {
      const shapes = uniq.map((ch) => {
        const sym = chordSymbol(ch);
        const { ease, how } = playInTuning(ch, tuning, capo);
        return { symbol: sym, how, ease, count: counts.get(sym) || 1 };
      });
      const totalEase = shapes.reduce((s, x) => s + x.ease * x.count, 0) + capo * 0.15 + friction;
      const openChordCount = shapes.filter((x) => x.ease <= 1.0).length;
      results.push({
        tuningId: tid,
        tuningName: tuning.name,
        capo,
        totalEase,
        openChordCount,
        shapes: shapes.map(({ symbol, how, ease }) => ({ symbol, how, ease })),
        note: describeArrangement(tuning, capo, shapes),
      });
    }
  }

  results.sort(
    (a, b) =>
      a.totalEase - b.totalEase ||
      a.capo - b.capo ||
      frictionFor(a.tuningId) - frictionFor(b.tuningId)
  );
  return results;
}

// The single best arrangement for a progression.
export const bestArrangement = (prog, opts) => suggestArrangements(prog, opts)[0];
