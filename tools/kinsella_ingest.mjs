// kinsella_ingest.mjs — fold the recovered Kinsella-family stash and the web
// sweep into the corpus as source "kinsella". Run from repo root:
//   node tools/kinsella_ingest.mjs "<stagingRoot>" [--dry]
// where <stagingRoot> contains kinsella-stash/ (band folders, recovered
// files) and kinsella-web/ ("Band - Title.txt", each with a Source: line).
// The recovered stash wins when both have the same song (those files are the
// point of the exercise) unless the stash copy is a stub. Corpus stays
// deploy-excluded (personal use only). Rebuild the index afterward:
//   node tools/build_manifest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findTabBlocks } from "../src/lib/tab.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "corpus", "kinsella");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const staging = args.find((a) => !a.startsWith("--"));
if (!staging) { console.log('usage: node tools/kinsella_ingest.mjs "<stagingRoot>" [--dry]'); process.exit(1); }

const BAND_NAMES = {
  "capn jazz": "Cap'n Jazz", "cap'n jazz": "Cap'n Jazz",
  "joan of arc": "Joan of Arc",
  "owls": "Owls",
  "owen": "Owen",
  "ghosts and vodka": "Ghosts and Vodka",
  "make believe": "Make Believe",
  "american football": "American Football",
  "friend-enemy": "Friend/Enemy", "friend/enemy": "Friend/Enemy",
  "the love of everything": "The Love of Everything",
};
const canonBand = (raw) => BAND_NAMES[raw.trim().toLowerCase()] || raw.trim();

const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const SMALL = new Set(["of", "the", "and", "a", "an", "to", "in", "on", "for"]);
const titleCase = (s) => s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
const cleanTitle = (t) => {
  const trimmed = t.replace(/\.(txt|tab|crd)$/i, "").trim();
  // ALL-CAPS or all-lower filenames get civilized; mixed case is intentional
  return trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase() ? titleCase(trimmed) : trimmed;
};

function parseFile(fp, band, titleGuess) {
  let body;
  try { body = fs.readFileSync(fp, "utf8").replace(/\r\n/g, "\n"); } catch { return null; }
  if (!body.trim()) return null;
  let sourceUrl = null;
  // pull a "Source: http…" comment out of the body (any comment style)
  body = body.replace(/^[#/;*\s]*source:?\s*(https?:\/\/\S+).*$/im, (_, url) => { sourceUrl = url; return ""; }).trim();
  const capoM = body.match(/^\s*capo:?\s*(\d{1,2})/im);
  const keyM = body.match(/^\s*key:?\s*([A-G][#b]?m?(?:aj|in)?o?r?)\s*$/im);
  const format = findTabBlocks(body).length ? "tab" : "chords";
  return {
    band: canonBand(band),
    title: cleanTitle(titleGuess),
    body: `${body.trim()}\n`,
    sourceUrl,
    capo: capoM ? Number(capoM[1]) : null,
    key: keyM ? keyM[1] : null,
    format,
    chars: body.length,
  };
}

const picks = new Map(); // slugKey -> { rec, from }
const consider = (rec, from) => {
  if (!rec) return;
  const key = `${slug(rec.band)}--${slug(rec.title)}`;
  const prev = picks.get(key);
  if (!prev) { picks.set(key, { rec, from }); return; }
  // the recovered stash wins unless it's a stub next to a real chart
  const keepIncoming =
    (from === "stash" && !(rec.chars < 200 && prev.rec.chars >= 400)) ||
    (from === "web" && prev.from === "stash" && prev.rec.chars < 200 && rec.chars >= 400) ||
    (from === "web" && prev.from === "web" && rec.chars > prev.rec.chars);
  if (keepIncoming) picks.set(key, { rec, from });
  console.log(`  dupe: ${rec.band} — ${rec.title} (${from} vs ${prev.from}) → kept ${keepIncoming ? from : prev.from}`);
};

// ---- the recovered stash: band folders of text files ----
const stashDir = path.join(staging, "kinsella-stash");
if (fs.existsSync(stashDir)) {
  for (const band of fs.readdirSync(stashDir)) {
    const dir = path.join(stashDir, band);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(txt|tab|crd)$/i.test(f)) continue;
      consider(parseFile(path.join(dir, f), band, f), "stash");
    }
  }
}

// ---- the web sweep: "Band - Title.txt" ----
const webDir = path.join(staging, "kinsella-web");
if (fs.existsSync(webDir)) {
  for (const f of fs.readdirSync(webDir)) {
    if (!/\.txt$/i.test(f) || /^index/i.test(f)) continue;
    const m = f.match(/^(.+?)\s+-\s+(.+)\.txt$/i);
    if (!m) continue;
    consider(parseFile(path.join(webDir, f), m[1], m[2]), "web");
  }
}

console.log(`\n${picks.size} unique songs staged`);
const byBand = {};
for (const { rec } of picks.values()) byBand[rec.band] = (byBand[rec.band] || 0) + 1;
console.log(Object.entries(byBand).map(([b, n]) => `${b}: ${n}`).join(" · "));

if (DRY) { console.log("(dry run — nothing written)"); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
let written = 0;
for (const [key, { rec }] of picks) {
  const id = `kinsella--${key}`;
  const song = {
    id,
    artist: rec.band,
    title: rec.title,
    album: null,
    albumOrder: 9999,
    source: "kinsella",
    sourceUrl: rec.sourceUrl || null,
    tuning: "standard",
    capo: rec.capo,
    key: rec.key,
    format: rec.format,
    body: rec.body,
  };
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(song), "utf8");
  written++;
}
console.log(`wrote ${written} songs to public/corpus/kinsella — now run: node tools/build_manifest.mjs`);
