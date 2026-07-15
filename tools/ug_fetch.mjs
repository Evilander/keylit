// ug_fetch.mjs — pull one artist's chord/tab charts from Ultimate Guitar into
// the local corpus (personal use only; public/corpus is gitignored and never
// ships). Songsterr is the preferred harvester (absolute tunings), but small
// catalogs it doesn't carry — Chris Cohen, deep Deerhoof — live on UG.
// Run from repo root:
//   node tools/ug_fetch.mjs --artist "Chris Cohen" [--artist-path /artist/…] [--dry] [--delay ms] [--alts N] [--chords-only] [--known-only] [--skip-existing-chords]
// Picks ONE chart per song by default: Chords beats Tabs, higher rating
// breaks ties; bass/drum/ukulele/video/pro versions are skipped. --alts N
// keeps up to N versions per song (extra ones titled "… (ver X)") — for
// catalogs where the community argues about the changes and the runner-up
// is sometimes the better transcription.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "corpus", "ultimateguitar");

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ARTIST = flag("--artist");
const ARTIST_PATH = flag("--artist-path");
const DRY = args.includes("--dry");
const CHORDS_ONLY = args.includes("--chords-only");
const KNOWN_ONLY = args.includes("--known-only");
const SKIP_EXISTING_CHORDS = args.includes("--skip-existing-chords");
const DELAY = +(flag("--delay") || 1100);
const ALTS = Math.max(1, +(flag("--alts") || 1));
if (!ARTIST) { console.log('usage: node tools/ug_fetch.mjs --artist "Name" [--artist-path /artist/…] [--dry] [--delay ms] [--chords-only] [--known-only] [--skip-existing-chords]'); process.exit(1); }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Every UG page embeds its data as HTML-escaped JSON in one attribute.
// UG 403s Node's fetch (TLS fingerprint) but serves curl fine — shell out.
async function pageData(url) {
  let html = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    html = execFileSync("curl", ["-s", "--compressed", "-A", UA, url],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const m = html.match(/data-content="([^"]+)"/);
    if (m) {
      const json = m[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
      return JSON.parse(json).store?.page?.data;
    }
    if (attempt < 3) await sleep(1500 * (attempt + 1));
  }
  throw new Error(`no data-content (${html.length}b): ${url}`);
}

let hit;
if (ARTIST_PATH) {
  const artistPage = await pageData(`https://www.ultimate-guitar.com${ARTIST_PATH}`);
  hit = {
    artist_name: artistPage?.artist?.name || ARTIST,
    tabs_cnt: artistPage?.artist?.tabscount || artistPage?.tabs_count || 0,
    artist_url: ARTIST_PATH,
  };
} else {
  const search = await pageData(`https://www.ultimate-guitar.com/search.php?search_type=band&value=${encodeURIComponent(ARTIST)}`);
  hit = (search?.results || []).find((r) => r.artist_name.toLowerCase() === ARTIST.toLowerCase()) || (search?.results || [])[0];
}
if (!hit) { console.log(`no UG artist for "${ARTIST}"`); process.exit(1); }
console.log(`artist: ${ARTIST}  [UG: ${hit.artist_name}]  (${hit.tabs_cnt} tabs)  ${hit.artist_url}`);

// Collect the full tab list across artist-page pagination.
const tabs = [];
for (let page = 1; page < 20; page++) {
  await sleep(DELAY);
  const d = await pageData(`https://www.ultimate-guitar.com${hit.artist_url}${page > 1 ? `?page=${page}` : ""}`);
  const rows = d?.other_tabs || d?.tabs || [];
  tabs.push(...rows);
  const totalPages = d?.pagination?.pages?.length || d?.pagination?.total || 1;
  if (page >= totalPages) break;
}

// Rank each song's versions: Chords > Tabs; rating breaks ties inside a
// type. Keep the top ALTS of them.
const TYPE_RANK = { Chords: 2, Tabs: 1 };
const bySong = new Map();
for (const t of tabs) {
  const rank = TYPE_RANK[t.type];
  if (!rank) continue; // bass/drums/uke/video/pro/official
  if (CHORDS_ONLY && t.type !== "Chords") continue;
  const key = slug(t.song_name);
  const score = rank * 1000 + (t.rating || 0) * 10 + Math.min(t.votes || 0, 9) / 10;
  if (!bySong.has(key)) bySong.set(key, []);
  bySong.get(key).push({ ...t, score });
}
const manifestPath = path.join(ROOT, "public", "corpus", "manifest.json");
const artistRows = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      .filter((r) => r.artist?.toLowerCase() === ARTIST.toLowerCase())
  : [];
const knownTitles = new Set(artistRows.map((r) => slug(r.title)));
const existingChordTitles = SKIP_EXISTING_CHORDS
  ? new Set(artistRows.filter((r) => r.format === "chords").map((r) => slug(r.title)))
  : new Set();
// Never re-download a version that's already in the corpus under any id.
const haveUrls = new Set(
  fs.existsSync(OUT)
    ? fs.readdirSync(OUT).filter((f) => f.endsWith(".json"))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")).sourceUrl; } catch { return null; } })
        .filter(Boolean)
    : [],
);
const picks = [];
for (const versions of bySong.values()) {
  versions.sort((a, b) => b.score - a.score);
  versions.slice(0, ALTS).forEach((t, i) => {
    const title = slug(t.song_name);
    if (!existingChordTitles.has(title) && (!KNOWN_ONLY || knownTitles.has(title))) picks.push({ ...t, alt: i });
  });
}
console.log(`${tabs.length} listed → ${picks.length} charts to fetch (${bySong.size} songs, up to ${ALTS} versions each)`);

let written = 0, skipped = 0, failed = 0;
for (const t of picks) {
  if (haveUrls.has(t.tab_url)) { skipped++; continue; }
  const ver = t.alt > 0 ? ` (ver ${t.version || t.alt + 1})` : "";
  let id = `${slug(ARTIST)}--${slug(t.song_name + ver)}`;
  let fp = path.join(OUT, `${id}.json`);
  if (fs.existsSync(fp)) {
    const existing = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (existing.sourceUrl === t.tab_url || existing.format === "chords" || t.type !== "Chords") {
      skipped++;
      continue;
    }
    id += "--chords";
    fp = path.join(OUT, `${id}.json`);
    if (fs.existsSync(fp)) { skipped++; continue; }
  }
  if (DRY) { console.log(`  would fetch: ${t.song_name} (${t.type})`); continue; }
  await sleep(DELAY);
  try {
    const d = await pageData(t.tab_url);
    const view = d?.tab_view;
    let body = view?.wiki_tab?.content || "";
    if (!body.trim()) throw new Error("empty chart body");
    body = body.replace(/\[\/?(ch|tab)\]/g, "").replace(/\r\n/g, "\n");
    const meta = view?.meta || {};
    const rec = {
      id, artist: ARTIST, title: t.song_name + ver,
      album: d?.tab?.album_name || null, albumOrder: 9999,
      source: "ultimateguitar", sourceUrl: t.tab_url,
      tuning: "standard", tuningRaw: meta.tuning?.value || null,
      capo: meta.capo || null, key: d?.tab?.tonality_name || null,
      format: t.type === "Chords" ? "chords" : "tab",
      transcriber: d?.tab?.username || null,
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(fp, JSON.stringify({ ...rec, body }), "utf8");
    console.log(`  ✓ ${t.song_name}  (${t.type}${meta.capo ? `, capo ${meta.capo}` : ""}${meta.tuning?.value ? `, ${meta.tuning.value}` : ""})`);
    written++;
  } catch (e) {
    console.log(`  ✗ ${t.song_name}: ${e.message}`);
    failed++;
  }
}
console.log(`written ${written} · skipped ${skipped} · failed ${failed}`);
