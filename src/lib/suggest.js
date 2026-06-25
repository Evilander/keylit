// suggest.js — pure: given a chord (and optional key context), return ranked
// "interesting moves" the user can audition and apply.
//
// A suggestion is a small, self-describing object:
//   { kind: "replace" | "insertBefore" | "insertAfter",
//     chords: [chord, ...],       // one for replace/single insert, two for ii-V, etc.
//     why: "human-readable reason",
//     style: "any" | "pop" | "jazz" | "soul" | "gospel" | "rock" | "indie" | "classical" | "cinematic",
//     boldness: 0..1,             // higher = more adventurous
//     tags?: string[]             // e.g. ["secondary-dominant", "tritone-sub"]
//   }
//
// All functions are pure and depend only on theory.js. No React, no audio.

import {
  buildChord, buildChordFromIntervals, diatonicChord, chordSymbol, qualityKey,
  qualClass, MAJOR_SCALE, MINOR_SCALE, SHARP_NAMES, symFromName,
} from "./theory.js";

/* ============ Atomic moves ============ */

// V7 chord whose target root is `targetSemi` (a pitch class 0-11).
export const dominantOf = (targetSemi) => buildChord(((targetSemi + 7) % 12), "7");

// ii-m7 chord for the key whose tonic is `targetSemi`.
export const iiOf = (targetSemi) => buildChord(((targetSemi + 2) % 12), "m7");

// Tritone substitute for a (dominant) chord: same b7, root a tritone away.
// Always returns a dominant 7. Most musical on actual dominants.
export const tritoneSubOf = (chord) => buildChord((chord.rootSemitone + 6) % 12, "7");

// Clone a chord at a new root, preserving intervals.
function cloneAtRoot(chord, newRoot, bassSemitone = null) {
  return buildChordFromIntervals(newRoot, chord.quality, chord.intervals, bassSemitone);
}

// Diminished passing chord between two roots a whole step apart.
// Returns null if the two are not a whole step apart.
export function passingDimBetween(a, b) {
  const diff = ((b.rootSemitone - a.rootSemitone) % 12 + 12) % 12;
  if (diff !== 2 && diff !== 10) return null;
  const upward = diff === 2;
  const dimRoot = upward
    ? (a.rootSemitone + 1) % 12
    : (a.rootSemitone + 11) % 12;
  return buildChord(dimRoot, "dim7");
}

/* ============ Construction helpers ============ */

export function makeSuggestion(opts) {
  return { style: "any", boldness: 0.5, tags: [], ...opts };
}

const replace = (chord, why, opts = {}) =>
  makeSuggestion({ kind: "replace", chords: [chord], why, ...opts });
const insertBefore = (chord, why, opts = {}) =>
  makeSuggestion({ kind: "insertBefore", chords: [chord], why, ...opts });
const insertAfter = (chord, why, opts = {}) =>
  makeSuggestion({ kind: "insertAfter", chords: [chord], why, ...opts });

function sym(chord) { return chordSymbol(chord); }
function nameAt(pc) { return SHARP_NAMES[((pc % 12) + 12) % 12]; }

/* ============ REPLACE this chord ============ */

export function replaceChord(chord, context = {}) {
  const { tonic = 0, mode = "major" } = context;
  const out = [];

  // ---- Color / extension upgrades (preserve function) ----
  if (chord.quality === "maj") {
    out.push(replace(buildChord(chord.rootSemitone, "maj7"),
      "Add a major 7th for soft color.",
      { style: "any", boldness: 0.15, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "6"),
      "6th — open, Beach-Boys-warm.",
      { style: "pop", boldness: 0.2, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "add9"),
      "add9 — shimmer without changing the chord's function.",
      { style: "any", boldness: 0.2, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "sus2"),
      "sus2 — floats, no resolved 3rd.",
      { style: "indie", boldness: 0.25, tags: ["sus"] }));
    out.push(replace(buildChord(chord.rootSemitone, "sus4"),
      "sus4 — tense; resolves nicely back to the major.",
      { style: "any", boldness: 0.2, tags: ["sus"] }));
    out.push(replace(buildChord(chord.rootSemitone, "6/9"),
      "6/9 — full, jazz-pad lushness.",
      { style: "jazz", boldness: 0.45, tags: ["color"] }));
  }
  if (chord.quality === "min") {
    out.push(replace(buildChord(chord.rootSemitone, "m7"),
      "Minor 7 softens the chord; classic for vi or ii.",
      { style: "any", boldness: 0.15, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "m9"),
      "Minor 9 — silky, pad-like.",
      { style: "jazz", boldness: 0.35, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "m6"),
      "Minor 6 — Bond-theme moodiness.",
      { style: "cinematic", boldness: 0.5, tags: ["color"] }));
  }
  if (chord.quality === "7") {
    out.push(replace(buildChord(chord.rootSemitone, "9"),
      "9th — adds tasteful upper tension.",
      { style: "any", boldness: 0.25, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "13"),
      "13th — gospel/soul fullness.",
      { style: "gospel", boldness: 0.45, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "7b9"),
      "7♭9 — darker, classical-leaning dominant.",
      { style: "jazz", boldness: 0.55, tags: ["altered"] }));
    out.push(replace(buildChord(chord.rootSemitone, "7#9"),
      "7♯9 — bluesy 'Hendrix' tension.",
      { style: "rock", boldness: 0.55, tags: ["altered"] }));
    out.push(replace(tritoneSubOf(chord),
      `Tritone sub — replace ${sym(chord)} with ${sym(tritoneSubOf(chord))}; chromatic bass into the next chord.`,
      { style: "jazz", boldness: 0.75, tags: ["tritone-sub"] }));
    out.push(replace(buildChord(chord.rootSemitone, "7sus4"),
      "7sus4 — pre-dominant pad before resolving the 3rd.",
      { style: "any", boldness: 0.3, tags: ["sus"] }));
  }
  if (chord.quality === "maj7") {
    out.push(replace(buildChord(chord.rootSemitone, "6"),
      "6 in place of maj7 — less jazz, more pop.",
      { style: "pop", boldness: 0.2, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "maj9"),
      "maj9 — even more shimmer.",
      { style: "jazz", boldness: 0.3, tags: ["color"] }));
  }
  if (chord.quality === "m7") {
    out.push(replace(buildChord(chord.rootSemitone, "m9"),
      "m9 in place of m7 — Steely-Dan smoothness.",
      { style: "jazz", boldness: 0.3, tags: ["color"] }));
    out.push(replace(buildChord(chord.rootSemitone, "m11"),
      "m11 — wide, modal openness.",
      { style: "jazz", boldness: 0.5, tags: ["color"] }));
  }

  // ---- Diatonic substitutes (functional cousins) ----
  const scale = mode === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const deg = ((chord.rootSemitone - tonic) % 12 + 12) % 12;
  const degIdx = scale.indexOf(deg);
  if (degIdx >= 0 && mode === "major") {
    if (degIdx === 0) {
      out.push(replace(diatonicChord(tonic, mode, 5, true),
        "vi7 for I — relative minor (tonic function, more wistful).",
        { style: "pop", boldness: 0.4, tags: ["tonic-sub"] }));
      out.push(replace(diatonicChord(tonic, mode, 2, true),
        "iii7 for I — mediant (tonic function, brighter).",
        { style: "indie", boldness: 0.45, tags: ["tonic-sub"] }));
    } else if (degIdx === 3) {
      out.push(replace(diatonicChord(tonic, mode, 1, true),
        "ii7 for IV — subdominant cousin with smoother voice leading.",
        { style: "jazz", boldness: 0.3, tags: ["subdom-sub"] }));
    } else if (degIdx === 4) {
      out.push(replace(diatonicChord(tonic, mode, 6),
        "vii° for V — light dominant function.",
        { style: "classical", boldness: 0.5, tags: ["dom-sub"] }));
    }
  }

  // ---- Modal interchange (borrow from parallel mode) ----
  if (mode === "major" && degIdx >= 0) {
    if (degIdx === 3) {
      out.push(replace(buildChord((tonic + 5) % 12, "m"),
        "iv for IV — borrowed minor subdominant (Beatles-style melancholy).",
        { style: "pop", boldness: 0.55, tags: ["modal-interchange"] }));
      out.push(replace(buildChord((tonic + 5) % 12, "m7"),
        "iv7 for IV — softer borrowed minor.",
        { style: "pop", boldness: 0.5, tags: ["modal-interchange"] }));
    }
    if (degIdx === 0) {
      out.push(replace(buildChord((tonic + 0) % 12, "m"),
        "Parallel minor (i for I) — sudden mode change.",
        { style: "cinematic", boldness: 0.75, tags: ["modal-interchange"] }));
    }
    if (degIdx === 5) { // vi → ♭VI (borrowed)
      out.push(replace(buildChord((tonic + 8) % 12, "maj7"),
        "♭VI maj7 for vi — borrowed from parallel minor; lush.",
        { style: "cinematic", boldness: 0.7, tags: ["modal-interchange"] }));
    }
  }
  if (mode === "minor" && degIdx >= 0) {
    if (degIdx === 0) {
      // i → I (Picardy third's bigger cousin: just go to major)
      out.push(replace(buildChord(tonic, ""),
        "Parallel major (I for i) — sudden brightening.",
        { style: "cinematic", boldness: 0.75, tags: ["modal-interchange"] }));
    }
  }

  // ---- First-inversion slash chord for smoother bass ----
  if (chord.bassSemitone === null) {
    const thirdInterval = chord.intervals.find((i) => i === 3 || i === 4);
    if (thirdInterval !== undefined) {
      const bass = (chord.rootSemitone + thirdInterval) % 12;
      const qk = qualityKey(chord);
      if (qk !== undefined) {
        out.push(replace(buildChord(chord.rootSemitone, qk, bass),
          "First inversion — third in the bass; smoother bass line.",
          { style: "any", boldness: 0.2, tags: ["inversion"] }));
      }
    }
  }

  return out;
}

/* ============ INSERT BEFORE this chord ============ */

export function insertBeforeChord(chord, context = {}) {
  const { tonic = 0, mode = "major" } = context;
  const out = [];

  // Secondary dominant (V7 of the chord)
  const v = dominantOf(chord.rootSemitone);
  out.push(insertBefore(v,
    `Secondary dominant: ${sym(v)} → ${sym(chord)} (V7/${chord.rootName}).`,
    { style: "any", boldness: 0.4, tags: ["secondary-dominant"] }));

  // Relative ii–V (two chords)
  const ii = iiOf(chord.rootSemitone);
  out.push(makeSuggestion({
    kind: "insertBefore",
    chords: [ii, v],
    why: `Relative ii–V of ${chord.rootName}: ${sym(ii)} – ${sym(v)} → ${sym(chord)}.`,
    style: "jazz",
    boldness: 0.55,
    tags: ["ii-V"],
  }));

  // Tritone sub of the secondary dominant (♭II7 → target)
  const tritone = tritoneSubOf(v);
  out.push(insertBefore(tritone,
    `Tritone-sub V → ${chord.rootName}: ${sym(tritone)} (♭II7 chromatic approach).`,
    { style: "jazz", boldness: 0.7, tags: ["tritone-sub"] }));

  // Chromatic neighbor — same quality a half-step above
  const qkClone = qualityKey(chord);
  if (qkClone !== undefined) {
    const above = buildChord((chord.rootSemitone + 1) % 12, qkClone);
    out.push(insertBefore(above,
      `${sym(above)} → ${sym(chord)}: half-step-above chromatic approach.`,
      { style: "any", boldness: 0.65, tags: ["chromatic"] }));
    const below = buildChord((chord.rootSemitone + 11) % 12, qkClone);
    out.push(insertBefore(below,
      `${sym(below)} → ${sym(chord)}: half-step-below chromatic approach.`,
      { style: "any", boldness: 0.65, tags: ["chromatic"] }));
  }

  // Backdoor dominant for the tonic (♭VII7 → I)
  if (mode === "major" && ((chord.rootSemitone - tonic + 12) % 12) === 0) {
    const back = buildChord((tonic + 10) % 12, "7");
    out.push(insertBefore(back,
      `Backdoor dominant: ${sym(back)} → I.`,
      { style: "soul", boldness: 0.55, tags: ["backdoor"] }));
  }

  // Diminished approach a half-step below (passing dim7)
  const dim = buildChord((chord.rootSemitone + 11) % 12, "dim7");
  out.push(insertBefore(dim,
    `${sym(dim)} → ${sym(chord)}: chromatic dim7 leading up by a half-step.`,
    { style: "jazz", boldness: 0.6, tags: ["dim-passing"] }));

  return out;
}

/* ============ INSERT AFTER this chord ============ */

export function insertAfterChord(chord, context = {}) {
  const { tonic = 0, mode = "major" } = context;
  const out = [];

  // If the chord is the tonic in major: walk to vi via III7 (secondary dominant of vi).
  const isTonicMajor = mode === "major"
    && ((chord.rootSemitone - tonic + 12) % 12) === 0
    && (chord.quality === "maj" || chord.quality === "maj7" || chord.quality === "6");
  if (isTonicMajor) {
    const iiiSeven = buildChord((tonic + 4) % 12, "7");
    out.push(insertAfter(iiiSeven,
      `III7 (${sym(iiiSeven)}) → vi: soul-style detour toward the relative minor.`,
      { style: "soul", boldness: 0.5, tags: ["secondary-dominant"] }));
  }

  // Line cliché: same chord with descending chromatic bass (maj7 -> dom7 -> maj6 voicing on bass).
  if (chord.quality === "maj" || chord.quality === "min") {
    const qk = qualityKey(chord);
    if (qk !== undefined) {
      const bass7 = (chord.rootSemitone + 11) % 12;
      const cliche = buildChord(chord.rootSemitone, qk, bass7);
      out.push(insertAfter(cliche,
        `Line cliché: ${sym(chord)} → ${sym(cliche)} — bass walks chromatically down.`,
        { style: "any", boldness: 0.35, tags: ["line-cliche"] }));
    }
  }

  // Picardy third in minor: if chord is minor tonic, suggest its major form right after.
  if (mode === "minor" && ((chord.rootSemitone - tonic + 12) % 12) === 0) {
    out.push(insertAfter(buildChord(tonic, "maj7"),
      "Picardy 3rd: end the line on a major-tonic (Imaj7).",
      { style: "classical", boldness: 0.65, tags: ["picardy"] }));
  }

  return out;
}

/* ============ Whole-progression analysis ============ */

// Scan a progression and propose low-cost, high-value edits between consecutive chords.
// Returns suggestions with an `atIndex` (after which chord the move applies).
export function suggestProgressionEdits(prog, context = {}) {
  const moves = [];
  for (let i = 0; i < prog.length - 1; i++) {
    const cur = prog[i];
    const next = prog[i + 1];

    // Passing dim7 between two chords a whole step apart
    const pdim = passingDimBetween(cur, next);
    if (pdim) {
      moves.push({
        atIndex: i,
        suggestion: makeSuggestion({
          kind: "insertAfter",
          chords: [pdim],
          why: `Passing °7 between ${cur.rootName} and ${next.rootName}: ${sym(pdim)}.`,
          style: "jazz",
          boldness: 0.45,
          tags: ["dim-passing"],
        }),
      });
    }

    // Relative ii-V into any non-trivial target
    if (
      cur.rootSemitone !== next.rootSemitone &&
      cur.quality !== "7" &&
      i > 0 // don't replace the opening
    ) {
      const ii = iiOf(next.rootSemitone);
      const v = dominantOf(next.rootSemitone);
      moves.push({
        atIndex: i,
        suggestion: makeSuggestion({
          kind: "insertAfter",
          chords: [ii, v],
          why: `Drop a ii–V into ${next.rootName} before it lands: ${sym(ii)} – ${sym(v)} → ${sym(next)}.`,
          style: "jazz",
          boldness: 0.55,
          tags: ["ii-V"],
        }),
      });
    }
  }
  return moves;
}

/* ============ SIMPLIFY: make a hard chord playable ============ */

// The plain triad a chord reduces to, by quality class.
function baseTriad(chord) {
  const cls = qualClass(chord.quality);
  if (cls === "min") return buildChord(chord.rootSemitone, "m");
  if (cls === "dim") return buildChord(chord.rootSemitone, "dim");
  if (cls === "aug") return buildChord(chord.rootSemitone, "aug");
  return buildChord(chord.rootSemitone, ""); // maj + dominant both reduce to a major triad
}

// Given a complex chord, return easier ways to play it (best-first). For a
// beginner covering a hard song: drop extensions to the triad, drop the slash
// bass, or fall back to a two-note power chord. Loses color but keeps the song
// recognisable — the whole point of "I could never make this make sense."
export function simplify(chord) {
  const out = [];

  // 1. Reduce to the plain triad (only if there's something to drop).
  if (chord.intervals.length > 3 || /7|9|11|13|6|add|sus|maj/.test(chord.quality)) {
    const triad = baseTriad(chord);
    if (chordSymbol(triad) !== chordSymbol({ ...chord, bassSemitone: null, bassName: null })) {
      out.push(replace(triad,
        `Drop the extensions — just play ${chordSymbol(triad)}. Keeps the feel, far easier.`,
        { style: "any", boldness: 0, tags: ["simplify"] }));
    }
  }

  // 2. m7b5 / dim are awkward — a plain minor triad is a friendly stand-in.
  if (qualClass(chord.quality) === "dim" || chord.quality.includes("♭5")) {
    out.push(replace(buildChord(chord.rootSemitone, "m"),
      `${chordSymbol(buildChord(chord.rootSemitone, "m"))} is an easy stand-in for ${chordSymbol(chord)} (drops the flat-5 tension).`,
      { style: "any", boldness: 0.1, tags: ["simplify"] }));
  }

  // 3. Drop a slash bass — play the chord in root position.
  if (chord.bassSemitone !== null && chord.bassSemitone !== undefined) {
    const qk = qualityKey(chord);
    if (qk !== undefined) {
      const plain = buildChord(chord.rootSemitone, qk);
      out.push(replace(plain,
        `Ignore the slash bass — plain ${chordSymbol(plain)} is fine for strumming.`,
        { style: "any", boldness: 0, tags: ["simplify"] }));
    }
  }

  // 4. Universal fallback: a two-finger power chord works under anything.
  out.push(replace(buildChord(chord.rootSemitone, "5"),
    `Power chord (${chordSymbol(buildChord(chord.rootSemitone, "5"))}) — two notes, works under any quality.`,
    { style: "rock", boldness: 0.15, tags: ["simplify"] }));

  // de-dupe by resulting symbol
  const seen = new Set();
  return out.filter((s) => { const k = chordSymbol(s.chords[0]); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ============ Public: "give me good moves on this chord" ============ */

export const KNOWN_STYLES = ["any", "pop", "indie", "jazz", "soul", "gospel", "rock", "classical", "cinematic"];

function filterStyle(list, style) {
  if (!style || style === "any") return list;
  return list.filter((s) => s.style === style || s.style === "any");
}

function sortByBoldness(list, bias = 0.5) {
  // bias 0 → favor safe; bias 1 → favor bold. Default mixes.
  return [...list].sort((a, b) => {
    const aScore = 1 - Math.abs(a.boldness - bias);
    const bScore = 1 - Math.abs(b.boldness - bias);
    return bScore - aScore;
  });
}

export function suggestionsFor(target, options = {}) {
  const {
    tonic = 0, mode = "major", style = "any",
    maxPerKind = 6, boldnessBias = 0.5,
  } = options;
  const ctx = { tonic, mode };
  const post = (list) => sortByBoldness(filterStyle(list, style), boldnessBias).slice(0, maxPerKind);
  return {
    replace: post(replaceChord(target, ctx)),
    insertBefore: post(insertBeforeChord(target, ctx)),
    insertAfter: post(insertAfterChord(target, ctx)),
  };
}

// Friendly summary string (used by tooltips + LLM prompts).
export function describeSuggestion(s) {
  return `${s.kind}: ${s.chords.map(sym).join(" ")} — ${s.why}`;
}

// Map a suggestion to a harmonic-function bucket for consistent coloring:
// "D" dominant pull, "S" subdominant motion, "T" tonic substitute, "color" else.
export function suggestionFunction(s) {
  const t = s.tags || [];
  if (t.some((x) => ["secondary-dominant", "tritone-sub", "backdoor", "dim-passing", "dom-sub"].includes(x))) return "D";
  if (t.some((x) => ["subdom-sub", "modal-interchange"].includes(x))) return "S";
  if (t.includes("tonic-sub")) return "T";
  if (t.includes("ii-V")) return "D";
  return "color";
}
