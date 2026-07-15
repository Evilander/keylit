// eartrain.js — ear training that drills THE SONGS YOU LOVE, not abstract
// intervals. Gordon's audiation principle and the contextual-training
// literature point the same way: hear the function IN ITS KEY, in music you
// care about, and the skill transfers. Every question is generated from an
// actual progression (the loaded song when there is one), plays real chords
// through the engine, and explains itself after you answer. Pure: the
// component supplies randomness and audio.
import { harmonicFunction, chordSymbol, parseChord, SHARP_NAMES } from "./theory.js";

const DEGREE_NAME = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
const isMinorish = (ch) => ch.intervals.includes(3) && !ch.intervals.includes(4);
const degOf = (ch, tonic) => ((ch.rootSemitone - tonic) % 12 + 12) % 12;
const degLabel = (ch, tonic) => `${DEGREE_NAME[degOf(ch, tonic)]}${isMinorish(ch) ? "m" : ""}`;

const cadence = (tonic) => [parseChord(SHARP_NAMES[tonic]), parseChord(SHARP_NAMES[(tonic + 7) % 12]), parseChord(SHARP_NAMES[tonic])];

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (rand, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** The default palette when nothing's on the stand — plain folk furniture. */
export const FALLBACK = { sheet: "C F G Am", keyName: "C major" };

export const LEVELS = [
  { id: 1, name: "bright or dark", need: 0 },
  { id: 2, name: "find the degree", need: 4 },
  { id: 3, name: "name the change", need: 9 },
  { id: 4, name: "how it lands", need: 15 },
];

export function levelFor(streakBest) {
  let l = LEVELS[0];
  for (const lv of LEVELS) if (streakBest >= lv.need) l = lv;
  return l;
}

/**
 * Build one question from a real progression in a key.
 * Returns { type, prompt, play: [chords…], options: [{label, correct}], explain }
 * or null when the progression can't support the level (caller falls back).
 */
export function mkQuestion(rand, { progression, key, level = 1 }) {
  const prog = (progression || []).filter((c) => c?.intervals);
  if (prog.length < 2 || !key) return null;
  const tonic = key.tonic;

  if (level === 1) {
    const ch = pick(rand, prog);
    const correct = isMinorish(ch) ? "minor (dark)" : "major (bright)";
    return {
      type: "quality",
      prompt: "One chord from the song. Bright or dark?",
      play: [ch],
      options: shuffle(rand, [
        { label: "major (bright)", correct: correct.startsWith("major") },
        { label: "minor (dark)", correct: correct.startsWith("minor") },
      ]),
      explain: `${chordSymbol(ch)} — the third ${isMinorish(ch) ? "sits low (minor): the dark one" : "sits high (major): the bright one"}.`,
    };
  }

  if (level === 2) {
    const degrees = [...new Map(prog.map((c) => [degLabel(c, tonic), c])).entries()];
    if (degrees.length < 2) return null;
    const [label, target] = pick(rand, degrees);
    const options = shuffle(rand, degrees.slice(0, 4).map(([l]) => ({ label: l, correct: l === label })));
    if (!options.some((o) => o.correct)) options[0] = { label, correct: true };
    return {
      type: "degree",
      prompt: "Home first (1 → 5 → 1), then one of the song's chords. Which degree is it?",
      play: [...cadence(tonic), target],
      options,
      explain: `${chordSymbol(target)} is the ${label} of this key — its job here is ${fnWord(harmonicFunction(target, tonic, key.mode))}.`,
    };
  }

  if (level === 3) {
    const i = Math.floor(rand() * (prog.length - 1));
    const a = prog[i], b = prog[i + 1];
    const truth = `${degLabel(a, tonic)} → ${degLabel(b, tonic)}`;
    const wrongs = new Set();
    for (let guard = 0; wrongs.size < 3 && guard < 24; guard++) {
      const x = pick(rand, prog), y = pick(rand, prog);
      const lab = `${degLabel(x, tonic)} → ${degLabel(y, tonic)}`;
      if (lab !== truth && degLabel(x, tonic) !== degLabel(y, tonic)) wrongs.add(lab);
    }
    if (wrongs.size < 1) return null;
    return {
      type: "change",
      prompt: "Two chords from the song, in order. Name the move.",
      play: [a, b],
      options: shuffle(rand, [{ label: truth, correct: true }, ...[...wrongs].map((label) => ({ label, correct: false }))]),
      explain: `${chordSymbol(a)} → ${chordSymbol(b)}: that's ${truth} — the move this song makes right there.`,
    };
  }

  // level 4 — how a phrase lands
  const landings = [];
  for (let i = 1; i < prog.length; i++) {
    const f1 = harmonicFunction(prog[i - 1], tonic, key.mode);
    const f2 = harmonicFunction(prog[i], tonic, key.mode);
    if (f2 === "T" && (f1 === "D" || f1 === "S")) landings.push({ pair: [prog[i - 1], prog[i]], kind: f1 === "D" ? "the front door (5 → 1)" : "the side door (4 → 1)" });
  }
  if (!landings.length) return null;
  const l = pick(rand, landings);
  return {
    type: "cadence",
    prompt: "A landing from the song. Which door did it come home through?",
    play: l.pair,
    options: shuffle(rand, [
      { label: "the front door (5 → 1)", correct: l.kind.startsWith("the front") },
      { label: "the side door (4 → 1)", correct: l.kind.startsWith("the side") },
    ]),
    explain: `${l.pair.map(chordSymbol).join(" → ")} — ${l.kind}. ${l.kind.startsWith("the front") ? "The leading tone pulls it shut." : "No leading tone — it settles instead of resolving. The gospel landing."}`,
  };
}

const fnWord = (f) => (f === "T" ? "rest (home)" : f === "S" ? "motion (away)" : f === "D" ? "pull (leaning home)" : "color from outside the key");
