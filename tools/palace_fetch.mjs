// palace_fetch.mjs — scrape www.palace.free.fr (the French Will Oldham tab
// archive: 247 charts across the whole Palace / Bonnie "Prince" Billy
// catalog) into the local corpus (personal use only; gitignored, never ships).
// Run from repo root:
//   node tools/palace_fetch.mjs [--dry] [--delay ms] [--limit N]
//
// Page anatomy (latin-1!): orange <font size=6> title; French <i> notes above
// the table (capo lives here); a two-column <table> — lyrics left, measures
// right ("| Eb | Ab Eb" per lyric line). We interleave chords-over-lyrics
// when the columns align line-for-line, else emit the chart column alone.
// Artist follows the Oldham era of the album printed under each index link.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "corpus", "palacefree");
const BASE = "http://www.palace.free.fr";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? +args[i + 1] : null; };
const DELAY = flag("--delay") ?? 600;
const LIMIT = flag("--limit") ?? Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const get = (url) => execFileSync("curl", ["-s", "-A", "Mozilla/5.0", url], { encoding: "latin1", maxBuffer: 8 * 1024 * 1024 });

// Era attribution: Oldham's billing moved with the years; a few albums buck
// the year rule and get pinned by name.
const ARTIST_OVERRIDE = {
  "lost blues and other songs": "Palace Music",
  "joya": "Will Oldham",
  "little joya": "Will Oldham",
  "western music": "Will Oldham",
  "guarapero / lost blues 2": "Will Oldham",
  "all most heaven": "Will Oldham",
  "ode music": "Will Oldham",
  "black / rich music": "Will Oldham",
  "blue lotus feet": "Will Oldham",
};
function artistFor(album, year) {
  const o = ARTIST_OVERRIDE[album.toLowerCase()];
  if (o) return o;
  if (year <= 1994) return "Palace Brothers";
  if (year <= 1996) return "Palace Music";
  if (year <= 1998) return "Will Oldham";
  return "Bonnie Prince Billy";
}

const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#?\w+;/g, "").trim();

// "capo à la 1ère frette" / "capo à la 3ème frette" → 1 / 3
function capoFrom(text) {
  const m = text.match(/capo[^0-9]*(\d+)/i);
  return m ? +m[1] : null;
}

function tdLines(td) {
  return td.split(/<br\s*\/?>/i).map((l) => strip(l));
}

function convert(html, meta) {
  const noteMatches = [...html.matchAll(/<i>([^<]{10,300})<\/i>/g)]
    .map((m) => strip(m[1]))
    .filter((t) => !/^(Mesure|Pour ce titre)?\s*$/.test(t));
  const capo = capoFrom(noteMatches.join(" "));

  const tds = [...html.matchAll(/<td[^>]*valign="top"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  let body = "";
  if (tds.length >= 2) {
    const lyr = tdLines(tds[0]);
    const cho = tdLines(tds[1]).map((l) => l.replace(/\|/g, " ").replace(/\s+/g, " ").trim());
    const n = Math.max(lyr.length, cho.length);
    const lines = [];
    for (let i = 0; i < n; i++) {
      const c = cho[i] || "", l = (lyr[i] || "").trim();
      // "/ Intro /" style section markers → [Intro]
      const sec = l.match(/^\/\s*(.+?)\s*\/$/);
      if (sec) { lines.push("", `[${sec[1]}]`); if (c) lines.push(c); continue; }
      if (c) lines.push(c);
      if (l) lines.push(l);
      if (!c && !l) lines.push("");
    }
    body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    // single-column or <pre> pages: take the page text as-is
    const pre = html.match(/<pre>([\s\S]*?)<\/pre>/i);
    body = strip(pre ? pre[1] : (html.split(/<table>/i)[1] || ""));
  }
  if (!body || body.length < 40) return null;

  const head = [`${meta.title} — ${meta.artist}`, `${meta.album} (${meta.year})`];
  if (capo) head.push(`Capo ${capo}`);
  if (noteMatches.length) head.push(...noteMatches.map((t) => `NB: ${t}`));
  return { body: head.join("\n") + "\n\n" + body, capo };
}

const index = get(`${BASE}/Tabs.htm`);
const re = /<a href="tab\/([^"]+)"><b>(.*?)<\/b><\/a><br>\s*<font size="1"><i>(.*?)<\/i><\/font>/g;
const songs = [];
let m;
while ((m = re.exec(index))) {
  const [, href, rawTitle, rawAlbum] = m;
  const title = strip(rawTitle);
  const am = strip(rawAlbum).match(/^(.*?)\s*-\s*(\d{4})$/);
  const album = am ? am[1].trim() : strip(rawAlbum);
  const year = am ? +am[2] : 1999;
  songs.push({ href, title, album, year, artist: artistFor(album, year) });
}
console.log(`index: ${songs.length} tabs`);

fs.mkdirSync(OUT, { recursive: true });
let written = 0, skipped = 0, failed = 0;
for (const s of songs.slice(0, LIMIT)) {
  const id = `${slug(s.artist)}--${slug(s.title)}`;
  const fp = path.join(OUT, `${id}.json`);
  if (fs.existsSync(fp)) { skipped++; continue; }
  if (DRY) { console.log(`  would fetch: ${s.artist} — ${s.title} [${s.album} ${s.year}]`); continue; }
  await sleep(DELAY);
  try {
    const html = get(`${BASE}/tab/${s.href}`);
    const conv = convert(html, s);
    if (!conv) throw new Error("no chart content");
    const rec = {
      id, artist: s.artist, title: s.title,
      album: s.album, albumOrder: s.year,
      source: "palacefree", sourceUrl: `${BASE}/tab/${s.href}`,
      tuning: "standard", tuningRaw: null,
      capo: conv.capo, key: null, format: "chords",
      transcriber: "palace.free.fr", fetchedAt: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(fp, JSON.stringify({ ...rec, body: conv.body }), "utf8");
    console.log(`  ✓ ${s.artist} — ${s.title}${conv.capo ? ` (capo ${conv.capo})` : ""}`);
    written++;
  } catch (e) {
    console.log(`  ✗ ${s.title}: ${e.message}`);
    failed++;
  }
}
console.log(`written ${written} · skipped ${skipped} · failed ${failed}`);
