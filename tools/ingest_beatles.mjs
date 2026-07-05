// ingest_beatles.mjs — assemble vision-transcribed charts from the Hal Leonard
// "The Beatles Complete" songbooks (staging .txt files + a summaries JSON from
// the extraction run) into corpus records. Validation-first: every chord line
// is re-parsed through keylit's own parser, and a chart only lands in the
// corpus when its chords parse and its structure looks like a real song.
//
//   node tools/ingest_beatles.mjs --staging <dir> --summaries <file.json> [--dry]
//
// Output: public/corpus/beatlescomplete/the-beatles--{title}.json
// Flagged charts (unparseable chords, [?] markers, suspicious shape) are
// reported and NOT written — they go back for a human/agent re-read.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSheet, parseChord } from "../src/lib/theory.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "corpus", "beatlescomplete");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const DRY = args.includes("--dry");

const stagingDir = opt("staging");
const summariesPath = opt("summaries");
if (!stagingDir || !summariesPath) {
  console.log("usage: node tools/ingest_beatles.mjs --staging <dir> --summaries <file.json> [--dry]");
  process.exit(1);
}

const summaries = JSON.parse(fs.readFileSync(summariesPath, "utf8"));
const slug = (s) =>
  String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The ebook TOC (and occasionally the engraving OCR) uses non-canonical
// titles; normalize the known offenders so the Library reads clean.
const TITLE_FIX = new Map([
  ["dizze miss lizzie", "Dizzy Miss Lizzy"],
  ["doctor robot", "Doctor Robert"],
  ["she love you", "She Loves You"],
  ["savory truffle", "Savoy Truffle"],
  ["ob-ha-di, ob-la-da", "Ob-La-Di, Ob-La-Da"],
  ["ob-la-di ob-la-da", "Ob-La-Di, Ob-La-Da"],
  ["it wont' be long", "It Won't Be Long"],
  ["i want you (she so heavy)", "I Want You (She's So Heavy)"],
  ["sgt. pepper's lonely hears club band", "Sgt. Pepper's Lonely Hearts Club Band"],
  ["i should have know better", "I Should Have Known Better"],
  ["everybody's try to be my baby", "Everybody's Trying To Be My Baby"],
  ["day in the life, a", "A Day In The Life"],
  ["hard day's night, a", "A Hard Day's Night"],
  ["don't' bother me", "Don't Bother Me"],
  ["words of love", "Words Of Love"],
  ["p.s. i love you", "P.S. I Love You"],
  ["you know my name(look up the number)", "You Know My Name (Look Up The Number)"],
  ["when i'm sixty four", "When I'm Sixty-Four"],
]);
const fixTitle = (t) => TITLE_FIX.get(String(t).trim().toLowerCase()) || String(t).trim();

// Chord tokens the validator accepts beyond parseChord: N.C. (no chord) and
// bare repeat marks that engravings use.
const NON_CHORD_OK = /^(n\.?c\.?|\(.*\)|%|\/+)$/i;

// Engravings use typographic accidentals; the parser speaks ASCII.
const normalizeAccidentals = (s) =>
  String(s).replace(/♭/g, "b").replace(/♯/g, "#").replace(/♮/g, "");

// Songs the engraving itself prints without chord symbols (Indian-notation
// pieces) — a chord chart would be an invention, so they are skipped.
const SKIP_TITLES = new Set(["within you without you", "within you, without you"]);

// Personally verified sparse charts (a drone piece with one true chord).
const SPARSE_OK = new Set(["love you to"]);

function validateChart(body, declaredChords) {
  const problems = [];
  if (!body || body.trim().length < 80) problems.push("body too short to be a song");
  if (/\[\?\]/.test(body)) problems.push("contains illegible-chord markers [?]");

  // Every token on chord-looking lines must parse. parseSheet's own 50% rule
  // decides which lines are chord lines; we hold those to 100%.
  const lines = String(body).split(/\r?\n/);
  const badTokens = new Set();
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 24) continue;
    const parsed = tokens.map((t) => parseChord(t));
    const ok = parsed.filter(Boolean).length;
    if (ok / tokens.length >= 0.5) {
      tokens.forEach((t, i) => {
        if (!parsed[i] && !NON_CHORD_OK.test(t)) badTokens.add(t);
      });
    }
  }
  // Lyric words on mostly-chord lines surface here too; only flag tokens that
  // LOOK like chord symbols (start with a note letter) but fail to parse.
  const trulyBad = [...badTokens].filter((t) => /^[A-G]/.test(t));
  if (trulyBad.length) problems.push(`unparseable chord-like tokens: ${trulyBad.slice(0, 8).join(" ")}`);

  const sheet = parseSheet(body);
  if (sheet.progression.length < 4) problems.push(`only ${sheet.progression.length} chords parsed from the whole chart`);

  // Cross-check the agent's own chord inventory (some agents pack two
  // symbols into one slot — judge each whitespace-separated token). A bad
  // declared entry with a fully-clean body is metadata noise, not a defect.
  const bad = (declaredChords || [])
    .flatMap((c) => normalizeAccidentals(c).split(/\s+/))
    .filter(Boolean)
    .filter((c) => !parseChord(c) && !NON_CHORD_OK.test(c));
  if (bad.length && (trulyBad.length || sheet.progression.length < 4)) {
    problems.push(`declared chords that do not parse: ${bad.slice(0, 8).join(" ")}`);
  }

  return { problems, nChords: sheet.progression.length, nUnique: sheet.unique.length };
}

let written = 0, flagged = 0, missing = 0;
const flaggedList = [];
if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const s of summaries) {
  const file = s.file && fs.existsSync(s.file)
    ? s.file
    : path.join(stagingDir, path.basename(s.file || ""));
  if (!s.file || !fs.existsSync(file)) { missing++; flaggedList.push({ title: s.title, why: ["staging file missing"] }); continue; }
  const body = normalizeAccidentals(fs.readFileSync(file, "utf8"));
  const title = fixTitle(s.title);
  const titleKey = title.toLowerCase();
  if (SKIP_TITLES.has(titleKey)) { flagged++; flaggedList.push({ title, why: ["no chord symbols in the engraving — skipped by design"] }); continue; }
  let { problems, nChords, nUnique } = validateChart(body, s.chords);
  if (s.confidence === "low") problems.push("agent reported low confidence");
  if (SPARSE_OK.has(titleKey)) {
    problems = problems.filter((p) => !/only \d+ chords|low confidence/.test(p));
  }
  if (problems.length) {
    flagged++;
    flaggedList.push({ title, why: problems, file });
    continue;
  }
  const record = {
    id: `the-beatles--${slug(title)}`,
    artist: "The Beatles",
    title,
    album: null,
    albumOrder: 9999,
    source: "beatlescomplete",
    sourceUrl: null,
    tuning: "standard",
    tuningRaw: "E A D G B E",
    capo: null,
    key: s.keySig || null,
    format: "chords",
    body,
    transcriber: "Hal Leonard — The Beatles Complete",
    fetchedAt: new Date().toISOString(),
    beatlesComplete: { keySig: s.keySig || null, confidence: s.confidence, nChords, nUnique, issues: s.issues || [] },
  };
  if (!DRY) fs.writeFileSync(path.join(OUT_DIR, `${record.id}.json`), JSON.stringify(record), "utf8");
  written++;
}

console.log(`written ${written} · flagged ${flagged} · missing staging ${missing}${DRY ? "  (DRY)" : ""}`);
if (flaggedList.length) {
  console.log("\nFlagged for re-read:");
  for (const f of flaggedList) console.log(`  - ${f.title}: ${f.why.join(" · ")}`);
}
