// build_manifest.mjs — the canonical browse-index builder. Run from repo root:
//   node tools/build_manifest.mjs
// - normalizes messy artist names (all-caps PDF entries, known misspellings)
// - normalizes each song's tuning to a canonical id/name via the engine, so
//   "C G C F A D" and "dropC" fold together for the Library's tuning filter
// - rewrites changed song files in place and writes public/corpus/manifest.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTuning, canonicalTuning, detectDeclaredTuning } from "../src/lib/tuning.js";
import { findTabBlocks, parseTabBlock } from "../src/lib/tab.js";
import { TUNING_OVERRIDES } from "./tuning_overrides.mjs";

const normKey = (a, t) => `${a}::${t}`.toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9:]+/g, " ").trim();
const OVERRIDE_MAP = new Map(TUNING_OVERRIDES.map(([a, t, id]) => [normKey(a, t), id]));

// The strongest per-song evidence: the tab's own string labels (C|G|C|E|G|C).
// Only FULL 6-line systems count — 4-line riff excerpts label a string subset
// (e.g. D G B E = the top four of standard), not the instrument's tuning.
function labelsTuning(body) {
  for (const b of findTabBlocks(body || "")) {
    if (b.lines.length !== 6) continue;
    const pb = parseTabBlock(b.lines);
    if (pb.tuningFromLabels) return canonicalTuning(pb.tuning.id);
  }
  return null;
}

// Site-wide tuning conventions the per-song metadata never states.
// sweetadeline.net documents that Elliott Smith plays a whole step down
// (owner-confirmed); a song's own declaration always wins over this.
const SOURCE_DEFAULT_TUNING = { sweetadeline: "dStandard" };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");

// Owner explicitly excluded these — keep them out of the browse index no matter
// what lands on disk (a stray scraper kept re-adding Duster). "Palace" alone
// is the London indie band, NOT Will Oldham (Palace Brothers / Palace Music
// are his and stay) — owner asked it out, 2026-07-05.
const EXCLUDE_ARTISTS = new Set(["Duster", "Damien Jurado", "Palace"]);
const EXCLUDE_ID = /^(duster|damien-jurado|palace)--/;

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
let retuned = 0;
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
    if (EXCLUDE_ID.test(s.id) || EXCLUDE_ARTISTS.has(s.artist)) continue;
    const na = normArtist(s.artist);
    let dirty = na !== s.artist;
    if (dirty) s.artist = na;

    // ---- tuning resolution: labels > declared-in-text > metadata > site
    // convention. `tuningSource` records the winner so a convention applied
    // by an earlier pass never masquerades as per-song truth again.
    const source = s.source || src;
    const conv = SOURCE_DEFAULT_TUNING[source] || null;
    const cur = canonicalTuning(s.tuning);
    const polluted = !s.tuningSource && conv && cur.id === conv; // earlier blanket pass
    let t = cur;
    // Evidence-derived tags re-derive EVERY run — recorded sources exist
    // precisely so better evidence rules can heal old results. Only a
    // stamped "meta" survives untouched. Unstamped files (fresh ingests)
    // ALWAYS resolve once: scraper metadata can lie (a transcriber picks
    // "D Tuning" in the dropdown while the chart says G-G-C-G-B-E — Kurt
    // Vile's Blackberry Song), and the sheet itself outranks it.
    const rederive = s.tuningSource && s.tuningSource !== "meta";
    const ovr = OVERRIDE_MAP.get(normKey(s.artist || "", s.title || ""));
    if (cur.id === "standard" || polluted || rederive || ovr || !s.tuningSource) {
      // Owner's rule: the sheet itself always wins. Precedence: the
      // transcription's string labels > its own text declaration > scraper
      // metadata > documented per-song overrides (for sheets that say
      // NOTHING) > site convention.
      const lab = labelsTuning(s.body);
      let pickT = null, pickSrc = null;
      // Unstamped files scan the BODY only: tuningRaw is the meta claim and
      // already speaks through rawT below — it must not pose as "declared".
      const scanText = polluted || !s.tuningSource ? (s.body || "") : [s.tuningRaw, s.body].filter(Boolean).join("\n");
      const dec = detectDeclaredTuning(scanText);
      // tuningRaw is only scraper-original on unstamped files; stamped files
      // carry a spelling my own pass wrote, which is not evidence. Some
      // sources stored the claim in `tuning` with no tuningRaw at all — the
      // record's own current value IS the meta claim then, not silence.
      const rawT = (!polluted && !s.tuningSource)
        ? (s.tuningRaw ? canonicalTuning(s.tuningRaw) : (cur.id !== "standard" ? cur : null))
        : null;
      if (lab && lab.id !== "standard") {
        pickT = lab; pickSrc = "labels";
      } else if (dec && dec !== "standard") {
        pickT = canonicalTuning(dec); pickSrc = "declared";
      } else if (dec === "standard" && !(rawT && rawT.id !== "standard")) {
        // A vague "standard" in prose blocks conventions/overrides, but it
        // never overturns a CONCRETE non-standard claim from the tab page's
        // own metadata (Mr Tillman: sidebar says DGCFAD, prose says
        // "standard" — the sidebar is the more deliberate statement).
        pickT = getTuning("standard"); pickSrc = "declared";
      } else if (rawT && rawT.id !== "standard" && (rawT.family !== "custom" || rawT.notes?.length === 6)) {
        // Named claims always count; CUSTOM claims count when they are a
        // real six-string spelling (Kozelek's CGCFGD is a tuning, "A D A D"
        // label junk is not — parseTuning already rejected the latter).
        pickT = rawT; pickSrc = "meta";
      } else if (ovr) {
        pickT = canonicalTuning(ovr); pickSrc = "override";
      } else if (conv) {
        pickT = canonicalTuning(conv); pickSrc = "convention";
      } else {
        pickT = getTuning("standard"); pickSrc = "meta";
      }
      if (pickT.id !== cur.id) retuned++;
      if (pickT.id !== s.tuning || s.tuningSource !== pickSrc) {
        s.tuning = pickT.id;
        s.tuningRaw = pickT.spelling; // resolvable by the tab→piano player
        s.tuningSource = pickSrc;
        dirty = true;
      }
      t = pickT;
    }
    if (dirty) fs.writeFileSync(fp, JSON.stringify(s), "utf8");
    out.push({
      id: s.id, artist: s.artist || null, title: s.title,
      album: s.album || null, albumOrder: s.albumOrder ?? 9999,
      source: s.source || src, sourceUrl: s.sourceUrl || null,
      tuning: s.tuning || "standard", tuningId: t.id, tuningName: t.name,
      capo: s.capo || null, key: s.key || null, format: s.format || "chords",
    });
  }
}
// Owner call: Ultimate Guitar beats hyperrust on accuracy for Neil Young —
// when the same song exists in both, index only the UG version. Hyperrust
// still carries the deep cuts UG doesn't have.
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ugNeil = new Set(out.filter((r) => r.source === "ultimateguitar" && r.artist === "Neil Young").map((r) => normTitle(r.title)));
const indexed = out.filter((r) => !(r.source === "hyperrust" && r.artist === "Neil Young" && ugNeil.has(normTitle(r.title))));
if (indexed.length !== out.length) console.log("hyperrust Neil rows superseded by UG:", out.length - indexed.length);
out.length = 0;
out.push(...indexed);

fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(out), "utf8");
const tunings = {};
out.forEach((s) => { if (s.tuningId !== "standard") tunings[s.tuningName] = (tunings[s.tuningName] || 0) + 1; });
console.log("artist names fixed:", fixedArtists, "| songs retuned from chart text/conventions:", retuned);
console.log("manifest:", out.length, "songs,", new Set(out.map((s) => s.artist || "Various")).size, "artists");
console.log("alt tunings:", Object.entries(tunings).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, c]) => `${n} (${c})`).join(" · "));
