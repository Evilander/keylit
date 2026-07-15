// coverize.js — take any song on the stand and re-speak it in another
// writer's arrangement language. Not a genre filter: a set of studied,
// deterministic moves per style — simplify or color the qualities, sit the
// key where that writer's voice lives, advise capo/tuning/tempo/feel — with
// every move explained in plain musician language. The paper stays the
// source document; a cover is a performance lens (it applies to the Lab
// progression, never rewrites the sheet).
//
// Iron rules, test-enforced:
//  · every output chord re-parses through parseChord (no invented symbols)
//  · roots never move except in campfire's function mapping — a cover keeps
//    the song's spine, only campfire trades exactness for playability
//  · output length === input length (no chords appear or vanish)
import {
  parseChord, chordSymbol, transposeChord, harmonicFunction, suggestCapo, SHARP_NAMES,
} from "./theory.js";

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const pcs = (ch) => ch.intervals.map((i) => (ch.rootSemitone + i) % 12);
const keyPcs = (key) => new Set((key.mode === "minor" ? MINOR_SCALE : MAJOR_SCALE).map((i) => (i + key.tonic) % 12));
const isDiatonic = (ch, key) => {
  const scale = keyPcs(key);
  return pcs(ch).every((p) => scale.has(p)) && (ch.bassSemitone === null || scale.has(ch.bassSemitone));
};
const isMinorish = (ch) => ch.intervals.includes(3) && !ch.intervals.includes(4);
const isMajorish = (ch) => ch.intervals.includes(4);
const isDominantOf = (ch, key) => ch.rootSemitone === (key.tonic + 7) % 12 && isMajorish(ch);

/** Rebuild a chord as `rootName + suffix` (+ optional slash bass), through
 * parseChord so intervals stay canonical. Falls back to the original chord
 * if the symbol wouldn't parse — a cover must never mint a broken chord. */
function respellQuality(ch, suffix, { keepBass = false } = {}) {
  const bass = keepBass && ch.bassName && ch.bassSemitone !== ch.rootSemitone ? `/${ch.bassName}` : "";
  const built = parseChord(`${ch.rootName}${suffix}${bass}`);
  return built ? { ...built, section: ch.section } : ch;
}

/** Smallest signed shift landing the tonic on one of the style's home keys.
 * bias "down" breaks ties toward the floor (low voices live down there). */
export function keyShiftFor(tonic, homes, bias = "none") {
  let best = 0, bestAbs = Infinity;
  for (const home of homes) {
    let d = ((home - tonic) % 12 + 12) % 12;
    if (d > 6) d -= 12;
    const abs = Math.abs(d);
    if (abs < bestAbs || (abs === bestAbs && bias === "down" && d < best)) { best = d; bestAbs = abs; }
  }
  return best;
}

/* ================================================================== *
 * THE STYLES — each one is a study, not a preset.
 * transform(ch, ctx) returns { chord, move? } per chord; ctx carries
 * { key, index, prog, isV, fn, diatonic }.
 * ================================================================== */
const STYLES = {
  callahan: {
    name: "Bill Callahan",
    line: "Smog — the room does the color",
    homes: [2, 4, 7],           // D, E, G — where the low voice sits
    bias: "down",
    tempo: { bpm: [58, 84], feel: "straight, unhurried — speak-level dynamics" },
    notes: "Callahan strips a chord to its name and lets the room do the color. Everything rings longer than feels safe. If a chord was fancy, it isn't now; if the bass walked, it still walks — stepwise bass is the one ornament that stays.",
    transform(ch, { isV, diatonic, key }) {
      // sus chords keep their suspension (that's structure, not color)
      if (/sus/.test(ch.quality)) return { chord: respellQuality(ch, ch.quality.includes("sus2") ? "sus2" : "sus4") };
      if (isV && ch.intervals.includes(10)) {
        return { chord: respellQuality(ch, "7"), move: null }; // the V keeps its pull
      }
      const plain = isMinorish(ch) ? "m" : "";
      const hadColor = ch.intervals.length > 3 || /maj7|7|9|11|13|6|add|dim|aug/.test(ch.quality);
      // stepwise slash bass survives; leaps drop the slash
      const keepBass = ch.bassSemitone !== null && (() => {
        const step = Math.min((ch.bassSemitone - ch.rootSemitone + 12) % 12, (ch.rootSemitone - ch.bassSemitone + 12) % 12);
        return step <= 2 && keyPcs(key).has(ch.bassSemitone);
      })();
      const next = respellQuality(ch, plain, { keepBass });
      return {
        chord: next,
        move: hadColor ? { from: chordSymbol(ch), to: chordSymbol(next), why: "dropped the color tones — let the room and the decay say that part" } : null,
      };
    },
  },

  smith: {
    name: "Elliott Smith",
    line: "fingerpicked, half-lit, one sad note added to everything",
    homes: [4, 9, 2, 7],        // E, A, D, G shapes under a mid capo
    bias: "none",
    capoFloor: 2,               // Smith lives capo'd — never suggest open
    tempo: { bpm: [76, 96], feel: "fingerpicked eighths; sing it twice, quietly, an octave apart" },
    notes: "Smith colors from inside the chord: the I grows a maj7, the minors grow 7ths, the V sharpens to V7. Nothing gets louder — it gets closer.",
    transform(ch, { key, isV, fn }) {
      if (/sus|dim|aug/.test(ch.quality)) return { chord: ch };
      if (isV) {
        const next = respellQuality(ch, "7");
        return { chord: next, move: ch.quality === "7" ? null : { from: chordSymbol(ch), to: chordSymbol(next), why: "the V gets its seventh back — the pull home is the hook" } };
      }
      if (isMinorish(ch) && !ch.intervals.includes(10)) {
        const next = respellQuality(ch, "m7");
        return { chord: next, move: { from: chordSymbol(ch), to: chordSymbol(next), why: "minor sevenths are the half-light — sadder without announcing it" } };
      }
      if (isMajorish(ch) && ch.rootSemitone === key.tonic && !/maj7|add9/.test(ch.quality)) {
        const next = respellQuality(ch, "maj7");
        return { chord: next, move: { from: chordSymbol(ch), to: chordSymbol(next), why: "home chord gets the major seventh — resolved, but with one eyebrow raised" } };
      }
      return { chord: ch };
    },
  },

  berman: {
    name: "David Berman",
    line: "Silver Jews — cowboy chords with one crooked corner",
    homes: [7, 0, 2, 9],        // G, C, D, A
    bias: "none",
    tempo: { bpm: [88, 112], feel: "boom-chick, loose on purpose — the words drive the van" },
    notes: "Berman plays the plainest chords in the room and keeps exactly one that doesn't belong. The crooked corner isn't a mistake — it's the line of the song wearing a chord.",
    transform(ch, { isV, diatonic }) {
      if (!diatonic) {
        // the crooked corner: quality flattens to a triad, the strange root STAYS
        const plain = respellQuality(ch, isMinorish(ch) ? "m" : "");
        return {
          chord: plain,
          move: { from: chordSymbol(ch), to: chordSymbol(plain), why: "the crooked corner stays crooked — plainer, but still the wrong-room chord that makes the song yours" },
        };
      }
      if (isV && ch.intervals.includes(10)) return { chord: respellQuality(ch, "7") };
      const plain = isMinorish(ch) ? "m" : "";
      const next = respellQuality(ch, plain);
      const changed = chordSymbol(next) !== chordSymbol(ch);
      return { chord: next, move: changed ? { from: chordSymbol(ch), to: chordSymbol(next), why: "back to the cowboy chord — the sentiment carries the sophistication" } : null };
    },
  },

  kozelek: {
    name: "Mark Kozelek",
    line: "Red House Painters — tuned low, played slow, left ringing",
    homes: [2, 4],              // D, E — drone country
    bias: "down",
    tuningHint: "Drop D (or DADGAD if you know it) — let the low strings drone through every change",
    tempo: { bpm: [50, 70], feel: "half asleep on purpose; repeat each line until it stops being words" },
    notes: "Kozelek reduces harmony to weather: two or three shapes, open strings ringing through all of them, everything slower than you think it should be. The add9 is the sound of a chord not fully waking up.",
    transform(ch) {
      if (/sus|dim|aug/.test(ch.quality)) return { chord: ch };
      const target = isMinorish(ch) ? "m" : "add9";
      const next = respellQuality(ch, target);
      const changed = chordSymbol(next) !== chordSymbol(ch);
      return {
        chord: next,
        move: changed && target === "add9" ? { from: chordSymbol(ch), to: chordSymbol(next), why: "majors take an add9 — the open-string shimmer that never quite resolves" } : null,
      };
    },
  },

  slowcore: {
    name: "Slowcore",
    line: "Codeine / Low — space is the loudest instrument",
    homes: [4, 2, 7, 9],
    bias: "down",
    tempo: { bpm: [40, 60], feel: "every chord decays to silence before the next one; play at the edge of audible" },
    notes: "Slowcore removes even the sevenths — unresolved plainness, held past comfort. The tension isn't in the chords, it's in how long you make the listener wait for them.",
    transform(ch) {
      if (/sus/.test(ch.quality)) return { chord: ch };
      const next = respellQuality(ch, isMinorish(ch) ? "m" : "");
      const changed = chordSymbol(next) !== chordSymbol(ch);
      return { chord: next, move: changed ? { from: chordSymbol(ch), to: chordSymbol(next), why: "no sevenths, no color — just the triad and the wait" } : null };
    },
  },

  campfire: {
    name: "Campfire",
    line: "three chords and the truth — playable tonight",
    homes: [7, 0, 2],           // G, C, D
    bias: "none",
    tempo: { bpm: [92, 120], feel: "big open strums; everyone can sing it by the second chorus" },
    notes: "The maximum reduction: every chord folds into the I, IV, V, or vi of the key. It stops being a transcription and becomes the version everyone can play — which is its own kind of true.",
    mapRoots: true,
    transform(ch, { key, fn }) {
      const minorHome = { tonic: (key.tonic + 9) % 12 };
      let targetRoot, suffix;
      if (fn === "T") {
        const useVi = isMinorish(ch);
        targetRoot = useVi ? minorHome.tonic : key.tonic;
        suffix = useVi ? "m" : "";
      } else if (fn === "S") { targetRoot = (key.tonic + 5) % 12; suffix = ""; }
      else if (fn === "D") { targetRoot = (key.tonic + 7) % 12; suffix = ""; }
      else {
        // chromatic stray: nearest of the four pillars by root distance
        const pillars = [
          { root: key.tonic, suffix: "" }, { root: (key.tonic + 5) % 12, suffix: "" },
          { root: (key.tonic + 7) % 12, suffix: "" }, { root: minorHome.tonic, suffix: "m" },
        ];
        let best = pillars[0], bestD = 99;
        for (const p of pillars) {
          const d = Math.min((p.root - ch.rootSemitone + 12) % 12, (ch.rootSemitone - p.root + 12) % 12);
          if (d < bestD) { bestD = d; best = p; }
        }
        targetRoot = best.root; suffix = best.suffix;
      }
      const sym = `${SHARP_NAMES[targetRoot]}${suffix}`;
      const built = parseChord(sym);
      const next = built ? { ...built, section: ch.section } : ch;
      const changed = chordSymbol(next) !== chordSymbol(ch);
      return { chord: next, move: changed ? { from: chordSymbol(ch), to: chordSymbol(next), why: "folded into the nearest pillar — the campfire only knows four chords and doesn't apologize" } : null };
    },
  },
};

export const COVER_STYLES = Object.entries(STYLES).map(([id, s]) => ({ id, name: s.name, line: s.line }));

/**
 * The engine. progression: parsed chords (with .section). key: {tonic, mode}.
 * Returns { chords, shift, targetKeyName, capo, tuningHint, tempo, notes,
 *           moves: [{ at, from, to, why }] } — chords are at CONCERT pitch
 * after the key shift, ready for the Lab/playback path.
 */
export function coverize(progression, key, styleId) {
  const style = STYLES[styleId];
  if (!style || !progression?.length) return null;

  const shift = keyShiftFor(key.tonic, style.homes, style.bias);
  const shiftedKey = { tonic: ((key.tonic + shift) % 12 + 12) % 12, mode: key.mode };
  const moves = [];

  const out = progression.map((orig, index) => {
    const ch = shift ? transposeChord(orig, shift) : orig;
    const ctx = {
      key: shiftedKey,
      index,
      isV: isDominantOf(ch, shiftedKey),
      fn: harmonicFunction(ch, shiftedKey.tonic, shiftedKey.mode),
      diatonic: isDiatonic(ch, shiftedKey),
    };
    const { chord, move } = style.transform(ch, ctx);
    if (move) moves.push({ at: index, ...move });
    return { ...chord, section: orig.section };
  });

  if (shift) {
    moves.unshift({
      at: null, from: null, to: null,
      why: `moved the whole song ${shift > 0 ? "up" : "down"} ${Math.abs(shift)} semitone${Math.abs(shift) === 1 ? "" : "s"} to ${SHARP_NAMES[shiftedKey.tonic]} ${shiftedKey.mode} — ${style.name} territory`,
    });
  }

  // capo advice on the transformed result, through the house advisor
  let capo = null;
  try {
    const best = suggestCapo(out)[0];
    if (best && best.fret > 0) capo = best.fret;
    if (style.capoFloor && (!capo || capo < style.capoFloor)) capo = style.capoFloor;
  } catch { /* advisor is advice, not load-bearing */ }
  if (capo) moves.push({ at: null, from: null, to: null, why: `capo ${capo} keeps the shapes open where this register wants to sit` });
  if (style.tuningHint) moves.push({ at: null, from: null, to: null, why: style.tuningHint });

  return {
    chords: out,
    shift,
    targetKeyName: `${SHARP_NAMES[shiftedKey.tonic]} ${shiftedKey.mode}`,
    capo,
    tuningHint: style.tuningHint || null,
    tempo: style.tempo,
    notes: style.notes,
    moves,
  };
}

/** A saveable chord sheet for the cover — sections preserved, advice up top. */
export function coverSheet(result, { title = "Untitled", artist = "", styleName = "" } = {}) {
  const head = [
    `${title}${artist ? ` — ${artist}` : ""} (${styleName} version)`,
    `Key: ${result.targetKeyName}${result.capo ? ` · Capo ${result.capo}` : ""}`,
    `Tempo: ${result.tempo.bpm[0]}–${result.tempo.bpm[1]} bpm · ${result.tempo.feel}`,
    result.tuningHint ? `Tuning: ${result.tuningHint}` : "",
  ].filter(Boolean);
  const lines = [];
  let section = null;
  let row = [];
  const flush = () => { if (row.length) { lines.push(row.join("  ")); row = []; } };
  for (const ch of result.chords) {
    if (ch.section !== section) {
      flush();
      section = ch.section;
      if (section) lines.push("", `[${section}]`);
    }
    row.push(chordSymbol(ch));
    if (row.length >= 8) flush();
  }
  flush();
  return `${head.join("\n")}\n${lines.join("\n")}\n`;
}
