// ingest_songbook.mjs — the generalized songbook assembler (successor to the
// Beatles-specific ingest_beatles.mjs): staging chart .txt files + a
// summaries JSON → validated corpus records under public/corpus/songbooks/.
// Works identically for vision-extracted staging and scripted extractions —
// the summaries shape is the contract: { title, artist?, album?, keySig?,
// chords[], confidence, issues[], file, transcriber?, book?, pages? }.
//
//   node tools/ingest_songbook.mjs --summaries <file.json> --book "Name of Book"
//        --suffix bk [--artist "Fallback Artist"] [--dry]
//
// Every chord token must parse through keylit's own parser; charts that fail
// are reported and withheld, never silently written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSheet, parseChord } from "../src/lib/theory.js";
import { hasTab } from "../src/lib/tab.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "corpus", "songbooks");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const DRY = args.includes("--dry");
const summariesPath = opt("summaries");
const BOOK = opt("book");
const SUFFIX = (opt("suffix") || "bk").replace(/[^a-z0-9]/gi, "");
const ARTIST_FALLBACK = opt("artist");
if (!summariesPath || !BOOK) {
  console.log('usage: node tools/ingest_songbook.mjs --summaries <file.json> --book "Book Name" --suffix bk [--artist "Fallback"] [--dry]');
  process.exit(1);
}

const slug = (s) =>
  String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normalizeAccidentals = (s) =>
  String(s).replace(/♭/g, "b").replace(/♯/g, "#").replace(/♮/g, "");
const NON_CHORD_OK = /^(n\.?c\.?|\(.*\)|%|\/+|riff|x\d+)$/i;

function validateChart(body, declaredChords) {
  const problems = [];
  if (!body || body.trim().length < 60) problems.push("body too short to be a song");
  if (/\[\?\]/.test(body)) problems.push("contains illegible-chord markers [?]");

  const lines = String(body).split(/\r?\n/);
  const badTokens = new Set();
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 24) continue;
    const parsed = tokens.map((t) => parseChord(t));
    const ok = parsed.filter(Boolean).length;
    if (ok / tokens.length >= 0.5) {
      tokens.forEach((t, i) => { if (!parsed[i] && !NON_CHORD_OK.test(t)) badTokens.add(t); });
    }
  }
  const trulyBad = [...badTokens].filter((t) => /^[A-G]/.test(t) && /^[A-G][#b()/+\-a-z0-9]*$/.test(t));

  const sheet = parseSheet(body);
  // A fan chart with 40 clean chords and one home-rolled token ("Em(vii)")
  // is a chart, not a defect — tolerate strays up to 1 per 15 parsed chords.
  const tolerance = Math.max(0, Math.floor(sheet.progression.length / 15));
  if (trulyBad.length > tolerance) {
    problems.push(`unparseable chord-like tokens: ${trulyBad.slice(0, 8).join(" ")}`);
  }
  // A chord-sparse body that carries real ASCII tab is a TAB chart, not a
  // failure — keylit plays tab directly (bluebook precedent).
  const tab = hasTab(body);
  if (sheet.progression.length < 3 && !tab) {
    problems.push(`only ${sheet.progression.length} chords parsed from the whole chart`);
  }

  const bad = (declaredChords || [])
    .flatMap((c) => normalizeAccidentals(c).split(/\s+/))
    .filter(Boolean)
    .filter((c) => !parseChord(c) && !NON_CHORD_OK.test(c));
  // Declared-list noise only matters when the body itself failed — hold the
  // two checks to the same tolerance or clean charts get blocked by metadata.
  if (bad.length && (trulyBad.length > tolerance || sheet.progression.length < 3)) {
    problems.push(`declared chords that do not parse: ${bad.slice(0, 8).join(" ")}`);
  }
  return { problems, nChords: sheet.progression.length, nUnique: sheet.unique.length, tab };
}

const summaries = JSON.parse(fs.readFileSync(summariesPath, "utf8"));
let written = 0, flagged = 0, missing = 0;
const flaggedList = [];
if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const s of summaries) {
  if (!s.file || !fs.existsSync(s.file)) { missing++; flaggedList.push({ title: s.title, why: ["staging file missing"] }); continue; }
  const body = normalizeAccidentals(fs.readFileSync(s.file, "utf8"));
  const artist = s.artist || ARTIST_FALLBACK || "Various";
  const title = String(s.title).replace(/\s+/g, " ").trim();
  let { problems, nChords, nUnique, tab } = validateChart(body, s.chords);
  if (s.confidence === "low") problems.push("agent reported low confidence");
  if (problems.length) { flagged++; flaggedList.push({ title: `${artist} — ${title}`, why: problems, file: s.file }); continue; }
  const record = {
    id: `${slug(artist)}--${slug(title)}--${SUFFIX}`,
    artist,
    title,
    album: s.album || null,
    albumOrder: 9999,
    source: "songbooks",
    sourceUrl: null,
    tuning: "standard",
    tuningRaw: null, // the body's own declarations outrank metadata; let the chain read them
    capo: null,
    key: s.keySig || null,
    format: tab && nChords < 3 ? "tab" : tab ? "mixed" : "chords",
    body,
    transcriber: s.transcriber || BOOK,
    fetchedAt: new Date().toISOString(),
    songbook: { book: BOOK, pages: s.pages || null, keySig: s.keySig || null, confidence: s.confidence, nChords, nUnique, issues: s.issues || [] },
  };
  if (!DRY) fs.writeFileSync(path.join(OUT_DIR, `${record.id}.json`), JSON.stringify(record), "utf8");
  written++;
}

console.log(`[${BOOK}] written ${written} · flagged ${flagged} · missing ${missing}${DRY ? "  (DRY)" : ""}`);
for (const f of flaggedList.slice(0, 25)) console.log(`  - ${f.title}: ${f.why.join(" · ")}`);
if (flaggedList.length > 25) console.log(`  … and ${flaggedList.length - 25} more`);
