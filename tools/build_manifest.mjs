// build_manifest.mjs — the canonical browse-index builder. Run from repo root:
//   node tools/build_manifest.mjs
// - normalizes messy artist names (all-caps PDF entries, known misspellings)
// - normalizes each song's tuning to a canonical id/name via the engine, so
//   "C G C F A D" and "dropC" fold together for the Library's tuning filter
// - rewrites changed song files in place and writes public/corpus/manifest.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTuning } from "../src/lib/tuning.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");

const FIX = {
  "CHERYL CROW": "Sheryl Crow",
  "Dan Folgerberg": "Dan Fogelberg",
  "ALLMAN BROS": "The Allman Brothers Band",
  "BRIAN MAY (QUEEN)": "Queen",
  "GUESS WHO": "The Guess Who",
  "RED HOT CHILI PEPPERS – ACOUSTIC": "Red Hot Chili Peppers",
  "RED HOT CHILI PEPPERS - ACOUSTIC": "Red Hot Chili Peppers",
  "SAM AND DAVE": "Sam & Dave",
  "THE EAGLES": "Eagles",
  "BEATLES": "The Beatles",
  "SIMON & GARFUNKEL": "Simon & Garfunkel",
  "THE DOOBIE BROTHERS": "The Doobie Brothers",
};
const SMALL = new Set(["of", "the", "and", "a", "an", "to", "in", "on", "for"]);
const titleCase = (s) => s.toLowerCase().split(/\s+/).map((w, i) => (w === "&" ? "&" : i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
const normArtist = (a) => (!a ? a : FIX[a] ? FIX[a] : a === a.toUpperCase() && /[A-Z]/.test(a) ? titleCase(a) : a);

let fixedArtists = 0;
const out = [];
for (const src of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, src);
  if (src.startsWith("_") || !fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const fp = path.join(dir, f);
    let s;
    try { s = JSON.parse(fs.readFileSync(fp, "utf8")); } catch { continue; }
    if (!s.id || !s.title) continue;
    const na = normArtist(s.artist);
    if (na !== s.artist) { s.artist = na; fs.writeFileSync(fp, JSON.stringify(s), "utf8"); fixedArtists++; }
    const t = getTuning(s.tuning);
    out.push({
      id: s.id, artist: s.artist || null, title: s.title,
      album: s.album || null, albumOrder: s.albumOrder ?? 9999,
      source: s.source || src, sourceUrl: s.sourceUrl || null,
      tuning: s.tuning || "standard", tuningId: t.id, tuningName: t.name,
      capo: s.capo || null, key: s.key || null, format: s.format || "chords",
    });
  }
}
fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(out), "utf8");
const tunings = {};
out.forEach((s) => { if (s.tuningId !== "standard") tunings[s.tuningName] = (tunings[s.tuningName] || 0) + 1; });
console.log("artist names fixed:", fixedArtists);
console.log("manifest:", out.length, "songs,", new Set(out.map((s) => s.artist || "Various")).size, "artists");
console.log("alt tunings:", Object.entries(tunings).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, c]) => `${n} (${c})`).join(" · "));
