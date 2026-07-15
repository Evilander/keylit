// mirror.js — the Dialect Mirror: a persistent model of the player's OWN
// harmonic habits, spoken back in plain language. The lineage is the
// apprenticeship master who tracked each student's pacing through a shared
// grammar (partimento; Gjerdingen 2007, Sanguinetti 2012) — the genuinely
// new part is the fingerprint itself (composer-attribution MIR methods —
// chord-transition n-grams, cadence frequencies — turned from classification
// into REFLECTION), and the negative space: the moves never made, which no
// human teacher can see because no human holds your complete record.
//
// The mirror SPEAKS (sentences), it doesn't chart. And it always offers
// exactly ONE adjacent-possible move, as playable chords — never a lecture.
// Pure: evidence in, sentences out (prime directive 2).
import { parseChord, harmonicFunction, SHARP_NAMES } from "./theory.js";

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const isMinorish = (ch) => ch.intervals.includes(3) && !ch.intervals.includes(4);
const degreeOfRoot = (ch, tonic) => ((ch.rootSemitone - tonic) % 12 + 12) % 12;

/**
 * Fingerprint a body of work: [{ progression, key }] — sketches, kept songs.
 * Returns null under 20 chords of evidence (a mirror that guesses is a liar).
 */
export function fingerprint(works) {
  const rows = (works || []).filter((w) => w?.progression?.length && w.key);
  const total = rows.reduce((n, w) => n + w.progression.length, 0);
  if (total < 20) return null;

  const fn = { T: 0, S: 0, D: 0, "?": 0 };
  const qual = { major: 0, minor: 0, seventh: 0, extended: 0, sus: 0, dim: 0 };
  const keys = new Map();          // "G major" -> count (per work, not per chord)
  const bigrams = new Map();       // "IV→I" style degree transitions
  let borrowed = 0;
  let slashes = 0;
  let cadAuthentic = 0;            // D → T
  let cadPlagal = 0;               // S → T
  let minorKeyWorks = 0;
  const degreesSeen = new Set();   // semitone degrees used (root vs tonic)

  const DEGREE_NAME = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];

  for (const w of rows) {
    const { tonic, mode } = w.key;
    const scale = new Set((mode === "minor" ? MINOR_SCALE : MAJOR_SCALE).map((s) => (s + tonic) % 12));
    const kName = `${SHARP_NAMES[tonic]} ${mode}`;
    keys.set(kName, (keys.get(kName) || 0) + 1);
    if (mode === "minor") minorKeyWorks++;

    let prevFn = null;
    let prevDeg = null;
    for (const ch of w.progression) {
      const f = harmonicFunction(ch, tonic, mode);
      fn[f] = (fn[f] || 0) + 1;

      if (isMinorish(ch)) qual.minor++; else qual.major++;
      if (ch.intervals.includes(10) || ch.intervals.includes(11)) qual.seventh++;
      if (ch.intervals.length > 4) qual.extended++;
      if (/sus/.test(ch.quality)) qual.sus++;
      if (ch.intervals.includes(6) && !ch.intervals.includes(7)) qual.dim++;

      const deg = degreeOfRoot(ch, tonic);
      degreesSeen.add(deg);
      const pcs = ch.intervals.map((i) => (ch.rootSemitone + i) % 12);
      if (!pcs.every((p) => scale.has(p))) borrowed++;
      if (ch.bassSemitone !== null && ch.bassSemitone !== ch.rootSemitone) slashes++;

      if (prevFn === "D" && f === "T") cadAuthentic++;
      if (prevFn === "S" && f === "T") cadPlagal++;
      if (prevDeg !== null && prevDeg !== deg) {
        const bg = `${DEGREE_NAME[prevDeg]}→${DEGREE_NAME[deg]}`;
        bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
      }
      prevFn = f;
      prevDeg = deg;
    }
  }

  const topBigrams = [...bigrams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topKey = [...keys.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total,
    works: rows.length,
    fn,
    qual,
    keys: [...keys.entries()],
    topKey: topKey ? topKey[0] : null,
    topBigrams,
    borrowedRate: borrowed / total,
    slashRate: slashes / total,
    cadAuthentic,
    cadPlagal,
    minorKeyWorks,
    degreesSeen,
  };
}

/* ---- the adjacent possible: ranked doors, offered one at a time ---- */
// Each move: does the fingerprint show it missing? Then it's a door. The
// chords are built IN THE PLAYER'S home key so the offer is playable now.
const chordAt = (tonic, deg, suffix = "") => parseChord(`${SHARP_NAMES[((tonic + deg) % 12 + 12) % 12]}${suffix}`);

export const MOVES = [
  {
    id: "borrowed-iv",
    name: "the borrowed iv",
    missing: (fp) => !fp.topBigrams.some(([bg]) => bg.includes("→4")) || fp.borrowedRate < 0.02,
    line: "Major key, minor 4 chord — one accidental of difference, ten times the ache. Play the 4 major, then sink its middle finger a fret before coming home.",
    chords: (tonic) => [chordAt(tonic, 5), chordAt(tonic, 5, "m"), chordAt(tonic, 0)],
  },
  {
    id: "flat-seven",
    name: "the flat 7 (♭VII)",
    missing: (fp) => !fp.degreesSeen.has(10),
    line: "The backdoor home: a major chord one whole step under your tonic. It arrives like a screen door closing — resolution without ceremony.",
    chords: (tonic) => [chordAt(tonic, 0), chordAt(tonic, 10), chordAt(tonic, 5), chordAt(tonic, 0)],
  },
  {
    id: "minor-key",
    name: "a minor home",
    missing: (fp) => fp.minorKeyWorks === 0,
    line: "Every sketch you've kept lives in a major key. Write ONE from a minor home — same chords you already know, different center of gravity.",
    chords: (tonic) => [chordAt(tonic, 9, "m"), chordAt(tonic, 5), chordAt(tonic, 0), chordAt(tonic, 7)],
  },
  {
    id: "deceptive",
    name: "the deceptive landing",
    missing: (fp) => fp.cadAuthentic >= 3 && fp.cadPlagal + fp.cadAuthentic > 0 && fp.total > 0 && !fp.topBigrams.some(([bg]) => bg === "5→6"),
    line: "You resolve honestly every time. Once a song, let the 5 lie: aim it home and land on the 6 minor instead. The ear forgives you two bars later and loves you for it.",
    chords: (tonic) => [chordAt(tonic, 0), chordAt(tonic, 7), chordAt(tonic, 9, "m")],
  },
  {
    id: "slash-walk",
    name: "the walking bass",
    missing: (fp) => fp.slashRate < 0.02,
    line: "Your bass always jumps to roots. Walk it once: home, then the 5 over its own 3, then the 6 minor — three chords, one floor stepping straight down. Callahan keeps whole songs aloft on this.",
    chords: (tonic) => [
      chordAt(tonic, 0),
      parseChord(`${SHARP_NAMES[((tonic + 7) % 12 + 12) % 12]}/${SHARP_NAMES[((tonic + 11) % 12 + 12) % 12]}`),
      chordAt(tonic, 9, "m"),
    ],
  },
  {
    id: "sus-release",
    name: "the suspended breath",
    missing: (fp) => fp.qual.sus === 0,
    line: "You've never held a suspension. A sus4 is a chord holding its breath; releasing it to the plain major is the cheapest tension-and-release in the book.",
    chords: (tonic) => [chordAt(tonic, 7, "sus4"), chordAt(tonic, 7), chordAt(tonic, 0)],
  },
];

/** The one door to offer today: first ranked move the fingerprint lacks. */
export function adjacentPossible(fp) {
  if (!fp) return null;
  const tonicName = fp.topKey ? fp.topKey.split(" ")[0] : "C";
  const tonic = Math.max(0, SHARP_NAMES.indexOf(tonicName));
  for (const m of MOVES) {
    if (!m.missing(fp)) continue;
    const chords = m.chords(tonic).filter(Boolean);
    if (chords.length < 2) continue;
    return { id: m.id, name: m.name, line: m.line, chords, keyName: tonicName };
  }
  return null;
}

/* ---- the speech: sentences, not charts ---- */
export function mirrorLines(fp, practice = null) {
  if (!fp) return [];
  const lines = [];
  const pct = (n, d) => Math.round((n / Math.max(1, d)) * 100);

  if (fp.topKey) {
    const share = pct(fp.keys.find(([k]) => k === fp.topKey)?.[1] || 0, fp.works);
    lines.push(share >= 60
      ? `You live in ${fp.topKey} — ${share}% of what you've kept calls it home. Comfort or rut: only you know.`
      : `${fp.topKey} is your most-visited home, but you move around — a wanderer's songbook.`);
  }

  const minShare = pct(fp.qual.minor, fp.qual.minor + fp.qual.major);
  lines.push(minShare <= 20
    ? `Your chords run ${100 - minShare}% major. The brightness is a signature — or an untouched drawer of shadow, depending on the day.`
    : minShare >= 45
      ? `Nearly half your chords are minor — you write in low light.`
      : `You balance major against minor about ${100 - minShare}/${minShare} — neither sunshine nor gloom owns you.`);

  if (fp.cadAuthentic + fp.cadPlagal >= 3) {
    lines.push(fp.cadPlagal > fp.cadAuthentic
      ? `You come home through the 4 (plagal) more than the 5 — the gospel door, the Berman lean. Softer landings, less ceremony.`
      : `You come home through the 5 — the classical front door. It always works; it's also the one everyone expects.`);
  }

  if (fp.topBigrams.length) {
    const [bg, n] = fp.topBigrams[0];
    lines.push(`Your signature move is ${bg} — you've made it ${n} times. A move repeated is a style; a move never varied is a ceiling.`);
  }

  lines.push(fp.borrowedRate < 0.02
    ? `Everything you write stays inside the key. Discipline — or the fence you haven't tested.`
    : `About ${Math.max(1, Math.round(fp.borrowedRate * 100))}% of your chords are borrowed from outside the key — you already color outside the lines.`);

  if (fp.qual.seventh / fp.total > 0.3) {
    lines.push(`A third of your chords carry sevenths — you write in half-light, not primary colors.`);
  }

  if (practice?.count >= 5) {
    lines.push(`${practice.count} practice entries this season${practice.topTitle ? `, and "${practice.topTitle}" owns ${practice.topCount} of them — that's devotion or avoidance` : ""}.`);
  }

  return lines;
}
