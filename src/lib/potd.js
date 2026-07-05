// potd.js — the Progression of the Day. Pure and deterministic: the same
// date deals the same hand everywhere, no clock reads in here (the caller
// passes the date string). A curated deck of progressions that earned their
// names, each with one bandmate line about WHY it works — the daily nudge
// toward playing something before browsing something.
import { MAJOR_SCALE, buildChord } from "./theory.js";
import { spellPc, spellChord } from "./spelling.js";

// Nashville-ish tokens: optional b/#, degree 1-7, optional quality suffix
// from theory's QUALITIES keys ("m", "7", "maj7", "m7", "m7b5", "dim"...).
export const PROGRESSIONS = [
  { id: "axis", name: "The Axis", style: "pop", nashville: ["1", "5", "6m", "4"],
    line: "Four chords that carried half the radio: home, tension, the sad cousin, the lift — in that order it never resolves so hard you stop listening." },
  { id: "doowop", name: "The Doo-Wop Turn", style: "50s", nashville: ["1", "6m", "4", "5"],
    line: "The '50s corner-streetlight changes. The 6 minor is the sigh, the 4-5 walks you back to the door — every slow dance knows the way." },
  { id: "pachelbel", name: "The Canon Walk", style: "folk", nashville: ["1", "5", "6m", "3m", "4", "1", "4", "5"],
    line: "Pachelbel's bass line, three centuries on retainer: it just walks downstairs one diatonic step at a time, and gravity does the songwriting." },
  { id: "andalusian", name: "The Andalusian Descent", style: "flamenco", nashville: ["6m", "5", "4", "3"],
    line: "Four steps down and every one raises the stakes — minor home, then the floor keeps dropping until the 3 major glares back up at you." },
  { id: "twofive", name: "The ii–V–I", style: "jazz", nashville: ["2m7", "57", "1maj7"],
    line: "Jazz's handshake. The 2 leans on the 5, the 5 aims its tritone at home, and the maj7 landing is the softest chair in the building." },
  { id: "blues12", name: "The Twelve-Bar", style: "blues", nashville: ["17", "17", "17", "17", "47", "47", "17", "17", "57", "47", "17", "57"],
    line: "Twelve bars, three chords, one argument: leave home twice, come back twice, and let the turnaround talk you into going again." },
  { id: "creep", name: "The Creep Move", style: "alt", nashville: ["1", "3", "4", "4m"],
    line: "Major 3 where a minor should sit, then the 4 collapses to minor — the borrowed-gloom double feature. Radiohead didn't invent it; they weaponized it." },
  { id: "royal", name: "The Royal Road", style: "pop", nashville: ["4maj7", "57", "3m7", "6m"],
    line: "Japan's favorite four: starts AWAY from home and never quite gets back, which is exactly why it feels like longing with a backbeat." },
  { id: "backdoor", name: "The Backdoor", style: "soul", nashville: ["4", "b77", "1"],
    line: "When the front door (the 5) is too obvious, come in through the flat-7: it resolves home just as sweetly, with none of the salesmanship." },
  { id: "mixolift", name: "The Mixolydian Lift", style: "rock", nashville: ["1", "b7", "4", "1"],
    line: "The flat-7 is rock's whole trick: borrow one chord from the key next door and suddenly the 1 sounds like a fist in the air." },
  { id: "linecliche", name: "The Line Cliché", style: "torch", nashville: ["6m", "6mmaj7", "6m7", "67"],
    line: "One inner voice walking down a fret at a time while the chord holds its breath — the sound of a slow zoom in an old movie." },
  { id: "plagal", name: "The Amen Swing", style: "gospel", nashville: ["1", "4", "1", "4", "1", "5", "4", "1"],
    line: "Church by way of the garage: the 4 answering the 1 is the oldest call-and-response there is; the lone 5 is just there to raise the roof once." },
  { id: "minordrop", name: "The Relative Drop", style: "indie", nashville: ["1", "3m", "6m", "4"],
    line: "Slide from home through the 3 minor and the floor tilts melancholy before the 6m even lands — the long way into sadness reads as honesty." },
  { id: "circle", name: "The Circle Pull", style: "standards", nashville: ["67", "27", "57", "1"],
    line: "Dominoes in fifths: every chord is the 5 of the next, so once you tip the 6, the song plays itself home." },
  { id: "sus-release", name: "The Sus & Release", style: "heartland", nashville: ["1", "1sus4", "1", "4", "1", "5sus4", "5", "1"],
    line: "The sus4 is an itch and the triad is the scratch — heartland rock runs on nothing but this breathing in and out over an open chord." },
  { id: "picardy", name: "The Long Night, Bright Door", style: "ballad", nashville: ["6m", "4", "1", "5", "6m", "4", "1", "17"],
    line: "Lives in the minor all verse, then the final 1 turns dominant and kicks the door open — endings that refuse to sit down." },

  // ---- the after-hours tier: bizarre-but-works, for the days you need a spark
  { id: "waltz-descent", name: "The Waltz Descent", style: "after-hours", spice: 3,
    nashville: ["6m", "3/#5", "5", "2/#4", "4", "1"],
    line: "Elliott's staircase: the bass walks down in half steps while every chord above it is somehow legal — a major III where no major III belongs, and it aches exactly right." },
  { id: "sneaky-two", name: "The Sneaky ii of Nowhere", style: "after-hours", spice: 3,
    nashville: ["1", "7m7b5", "37", "6m", "4m6", "1"],
    line: "A half-diminished and a dominant that have no business here set up the 6 minor like it was planned all along — then the borrowed iv6 walks you home down the back stairs." },
  { id: "borrowed-dusk", name: "The Borrowed Dusk", style: "after-hours", spice: 2,
    nashville: ["1", "17", "4", "4m", "1", "b6", "b7", "1"],
    line: "Major going on minor going on somewhere else: the 4 collapsing to 4 minor is the sunset, and the flat-6/flat-7 run home is the streetlights coming on." },
  { id: "mediant-jump", name: "The Chromatic Mediant", style: "after-hours", spice: 2,
    nashville: ["1", "b3", "4", "b6", "1"],
    line: "Chords a third apart that share almost nothing and don't care — the film-score cut: same scene, different planet, no modulation paperwork filed." },
  { id: "parallel-door", name: "The Parallel Door", style: "after-hours", spice: 2,
    nashville: ["1", "1m", "b6maj7", "4m", "5sus4", "5"],
    line: "Flip your own tonic minor mid-phrase and the whole key wobbles — the flat-6 maj7 underneath is the softest wrong-room feeling in harmony." },
  { id: "planing", name: "The Glass Elevator", style: "after-hours", spice: 3,
    nashville: ["4maj7", "3m7", "b3maj7", "2m7", "b2maj7", "1maj7"],
    line: "Maj7 shapes sliding down by half and whole steps like it's all one chord in different light — planing: the rules leave the room and taste takes over." },
  { id: "double-agent", name: "The Double Agent", style: "after-hours", spice: 2,
    nashville: ["1", "67", "27", "57", "b6", "b7", "1"],
    line: "Three dominants deep into the circle, then instead of cashing in, it side-steps to the flat-6 — the con was never the resolution, it was the detour." },
];

// Optional b/#, degree 1-7, quality suffix, optional slash-bass DEGREE
// ("3/#5" = the III chord over a sharp-5 bass — the inversion moves).
const TOKEN = /^(b|#)?([1-7])([^/]*)(?:\/(b|#)?([1-7]))?$/;

// Guitar-and-piano-friendly keys, weighted toward where players actually live.
const KEYS = [7, 0, 2, 9, 4, 5, 10, 3];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

function buildFromToken(token, tonic) {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const [, acc, deg, qual, bAcc, bDeg] = m;
  const degreeSemi = (a, d) => {
    let s = tonic + MAJOR_SCALE[Number(d) - 1];
    if (a === "b") s -= 1;
    if (a === "#") s += 1;
    return ((s % 12) + 12) % 12;
  };
  const bass = bDeg ? degreeSemi(bAcc, bDeg) : null;
  return buildChord(degreeSemi(acc, deg), qual || "", bass);
}

/**
 * The day's deal. Pure: pass "YYYY-MM-DD". `opts.pick`/`opts.tonic` exist for
 * tests and for a "deal me another" affordance — omit them for the real day.
 */
export function progressionOfTheDay(dateStr, opts = {}) {
  const h = hash(String(dateStr));
  const prog = opts.pick
    ? PROGRESSIONS.find((p) => p.id === opts.pick) || PROGRESSIONS[0]
    : PROGRESSIONS[h % PROGRESSIONS.length];
  const tonic = opts.tonic != null
    ? ((opts.tonic % 12) + 12) % 12
    : KEYS[(Math.imul(h, 2654435761) >>> 7) % KEYS.length]; // avalanche: near dates, far keys
  const key = { tonic, mode: "major" };
  const chords = prog.nashville.map((t) => buildFromToken(t, tonic)).filter(Boolean);
  const spelled = chords.map((ch) => spellChord(ch, key) || ch.raw);
  return {
    id: prog.id,
    name: prog.name,
    style: prog.style,
    line: prog.line,
    nashville: prog.nashville,
    key,
    keyName: `${spellPc(tonic, key)} major`,
    chords,
    sheet: spelled.join("  "),
  };
}
