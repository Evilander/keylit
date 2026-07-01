// capo.js — capo + open-tuning advisor.
//
// Given a chord progression, rank the best ways to PLAY it: across alternate
// tunings AND capo positions, scoring playability authentically and
// explaining HOW each chord is fingered. Pure: no DOM/audio/network, depends
// only on theory.js (chord math + standard-tuning shape ease) and tuning.js
// (the named-tuning fretboard model).

import { parseChord, chordSymbol, shapeForCapo, shapeEase } from "./theory.js";
import { getTuning } from "./tuning.js";

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

  if (open.quality === "standard") {
    // No free chord in the open strings: finger the normal open-position/
    // CAGED shape you'd use under this capo position in standard tuning.
    const shape = shapeForCapo(chord, capo);
    let ease = shapeEase(shape);
    // Drop D lets a D power/major chord be barred across the (now D-tuned)
    // bottom three strings with one finger — easier than its standard open
    // shape. Floored so it can never read as "free."
    if (tuning.id === "dropD" && chord.rootSemitone === 2) {
      ease = Math.max(0.4, ease - 0.4);
    }
    return { fret: null, ease, how: `${chordSymbol(shape)} shape` };
  }

  // Open-major / modal-sus4 tuning: a full barre at fret f sounds a chord
  // rooted at (openRoot + capo + f) mod 12, so to land on this chord's root:
  const f = pcMod(chord.rootSemitone - open.rootPc - capo);
  const cls = classifyChord(chord);
  const barreHow = f === 0 ? "all open" : `barre fret ${f}`;

  if (open.quality === "maj") {
    if (cls === "maj") return { fret: f, ease: f === 0 ? 0.5 : 1.0 + f * 0.03, how: barreHow };
    if (cls === "sus") return { fret: f, ease: f === 0 ? 0.8 : 1.2 + f * 0.03, how: barreHow };
    if (cls === "min") return { fret: f, ease: 2.2 + f * 0.03, how: `barre fret ${f} + flatten 3rd` };
    if (cls === "dom7") return { fret: f, ease: 2.2 + f * 0.03, how: `barre fret ${f} + add ♭7` };
    return { fret: f, ease: 4.0, how: "hard shape" };
  }

  // DADGAD-style open sus4: same barre geometry, but the open strings only
  // give you a sus4 — major/sus chords need the 3rd added in, so a touch harder.
  if (cls === "maj" || cls === "sus") return { fret: f, ease: f === 0 ? 0.8 : 1.4 + f * 0.03, how: barreHow };
  if (cls === "min") return { fret: f, ease: 2.4 + f * 0.03, how: `barre fret ${f} + flatten 3rd` };
  if (cls === "dom7") return { fret: f, ease: 2.4 + f * 0.03, how: `barre fret ${f} + add ♭7` };
  return { fret: f, ease: 4.0, how: "hard shape" };
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
