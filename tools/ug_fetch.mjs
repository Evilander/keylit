// ug_fetch.mjs — pull one artist's chord/tab charts from Ultimate Guitar into
// the local corpus (personal use only; public/corpus is gitignored and never
// ships). Songsterr is the preferred harvester (absolute tunings), but small
// catalogs it doesn't carry — Chris Cohen, deep Deerhoof — live on UG.
// Run from repo root:
//   node tools/ug_fetch.mjs --artist "Chris Cohen" [--artist-path /artist/…] [--dry] [--delay ms] [--alts N] [--chords-only] [--known-only] [--skip-existing-chords]
// --limit N bounds new requests. --list-json FILE --list-only saves discovery;
// --from-list FILE reuses it without making listing requests.
// Picks ONE chart per format by default; higher rating breaks ties.
// Bass/drum/ukulele/video/pro versions are skipped. --alts N
// keeps up to N versions per song AND format (extra ones titled "… (ver X)") — for
// catalogs where the community argues about the changes and the runner-up
// is sometimes the better transcription.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "corpus", "ultimateguitar");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const titleKey = (s) => slug(s.replace(/\s*\(ver(?:sion)?\s*\d+\)\s*$/i, ""));
const artistKey = (s) => slug(s || "").replace(/^the-/, "");

export function parsePageData(html) {
  const m = html.match(/data-content="([^"]+)"/);
  if (!m) throw new Error(`no data-content (${html.length}b)`);
  const json = m[1].replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&amp;/g, "&");
  const data = JSON.parse(json).store?.page?.data;
  if (!data) throw new Error("missing page data");
  return data;
}

export function matchArtist(results, artist) {
  return results.find((r) => artistKey(r.artist_name) === artistKey(artist)) || null;
}

export function selectTabs(tabs, { alts = 1, chordsOnly = false, knownOnly = false, skipExistingChords = false, artistRows = [] } = {}) {
  const known = new Set(artistRows.map((r) => titleKey(r.title)));
  const chords = new Set(artistRows.filter((r) => r.format === "chords" || r.format === "mixed").map((r) => titleKey(r.title)));
  const groups = new Map(), seen = new Set();
  for (const t of tabs) {
    if (!["Chords", "Tabs"].includes(t.type) || !t.song_name || !t.tab_url || seen.has(t.tab_url)) continue;
    if (chordsOnly && t.type !== "Chords") continue;
    const title = titleKey(t.song_name);
    if (knownOnly && !known.has(title)) continue;
    if (skipExistingChords && t.type === "Chords" && chords.has(title)) continue;
    const url = new URL(t.tab_url);
    if (url.protocol !== "https:" || url.hostname !== "tabs.ultimate-guitar.com") throw new Error("invalid UG chart URL");
    seen.add(t.tab_url);
    const key = `${title}/${t.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const picks = [];
  for (const versions of groups.values()) {
    versions.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (Number(b.votes) || 0) - (Number(a.votes) || 0));
    versions.slice(0, alts).forEach((t, alt) => picks.push({ ...t, alt }));
  }
  return picks;
}

export function outputId(artist, tab, exists) {
  const ver = tab.alt > 0 ? ` (ver ${tab.version || tab.alt + 1})` : "";
  const base = `${slug(artist)}--${slug(tab.song_name + ver)}`;
  if (!exists(base)) return base;
  const suffix = slug(String(tab.id || new URL(tab.tab_url).pathname.split("/").pop()));
  return `${base}--${tab.type === "Chords" ? "chords" : "tab"}-${suffix}`;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const ARTIST = flag("--artist");
  const ARTIST_PATH = flag("--artist-path");
  const DRY = args.includes("--dry");
  const CHORDS_ONLY = args.includes("--chords-only");
  const KNOWN_ONLY = args.includes("--known-only");
  const SKIP_EXISTING_CHORDS = args.includes("--skip-existing-chords");
  const numeric = (name, fallback, minimum) => {
    const raw = flag(name), value = raw === null ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
    return value;
  };
  const DELAY = numeric("--delay", 1100, 0);
  const ALTS = numeric("--alts", 1, 1);
  const LIMIT = numeric("--limit", 1000, 0);
  if (!ARTIST) { console.log('usage: node tools/ug_fetch.mjs --artist "Name" [--artist-path /artist/…] [--dry] [--delay ms] [--chords-only] [--known-only] [--skip-existing-chords]'); process.exit(1); }

  // Every UG page embeds its data as HTML-escaped JSON in one attribute.
  // UG 403s Node's fetch (TLS fingerprint) but serves curl fine — shell out.
  async function pageData(url) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const html = execFileSync("curl", ["-fsSL", "--compressed", "--connect-timeout", "10", "--max-time", "35", "-A", UA, url],
          { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 40000, windowsHide: true });
        return parsePageData(html);
      } catch (e) {
        lastError = e;
        if (e.status === 22 || e instanceof SyntaxError || ![6, 7, 28].includes(e.status) || attempt === 2) break;
        await sleep(1500 * (attempt + 1));
      }
    }
    const error = new Error(`${lastError.message.split("\n")[0]}: ${url}`);
    error.rateLimited = /\b429\b/.test(String(lastError.stderr || ""));
    throw error;
  }

  let cached = null;
  if (flag("--from-list")) {
    cached = JSON.parse(fs.readFileSync(flag("--from-list"), "utf8"));
    if (artistKey(cached.artist) !== artistKey(ARTIST) || !Array.isArray(cached.tabs)) throw new Error("cached listing artist/data mismatch");
  }
  let hit;
  if (cached) {
    hit = cached.hit;
  } else if (ARTIST_PATH) {
    if (!/^\/artist\/[a-z0-9_-]+\/?$/i.test(ARTIST_PATH)) throw new Error("invalid UG artist path");
    const artistPage = await pageData(`https://www.ultimate-guitar.com${ARTIST_PATH}`);
    hit = {
      artist_name: artistPage?.artist?.name || ARTIST,
      tabs_cnt: artistPage?.artist?.tabscount || artistPage?.tabs_count || 0,
      artist_url: ARTIST_PATH,
    };
  } else {
    const search = await pageData(`https://www.ultimate-guitar.com/search.php?search_type=band&value=${encodeURIComponent(ARTIST)}`);
    hit = matchArtist(search?.results || [], ARTIST);
  }
  if (!hit) throw new Error(`no exact UG artist for "${ARTIST}"; use --artist-path for a verified alias`);
  if (artistKey(hit.artist_name) !== artistKey(ARTIST)) throw new Error(`artist mismatch: ${hit.artist_name}`);
  const artistUrl = new URL(hit.artist_url, "https://www.ultimate-guitar.com");
  if (artistUrl.hostname !== "www.ultimate-guitar.com" || !/^\/artist\/[a-z0-9_-]+\/?$/i.test(artistUrl.pathname)) throw new Error("invalid UG artist URL");
  console.log(`artist: ${ARTIST}  [UG: ${hit.artist_name}]  (${hit.tabs_cnt} tabs)  ${hit.artist_url}`);

  // Collect the full tab list across artist-page pagination.
  const tabs = cached?.tabs || [];
  const seen = new Set();
  let truncated = cached?.truncated || false;
  for (let page = 1; !cached && page <= 50; page++) {
    await sleep(DELAY);
    const url = new URL(artistUrl);
    if (page > 1) url.searchParams.set("page", page);
    const d = await pageData(url.href);
    const rows = d?.other_tabs || d?.tabs || [];
    if (!Array.isArray(rows)) throw new Error("unexpected artist listing");
    let added = 0;
    for (const t of rows) {
      const key = t.tab_url || t.id;
      if (key && !seen.has(key)) { seen.add(key); tabs.push(t); added++; }
    }
    const p = d?.pagination || {};
    const totalPages = Math.max(1, Number(p.total) || 0, ...(p.pages || []).map((x) => Number(x.number ?? x.page ?? x) || 0));
    if (!rows.length || !added || page >= totalPages) break;
    if (page === 50) truncated = true;
  }
  if (flag("--list-json")) {
    fs.mkdirSync(path.dirname(flag("--list-json")), { recursive: true });
    fs.writeFileSync(flag("--list-json"), JSON.stringify({ artist: ARTIST, hit, truncated, fetchedAt: new Date().toISOString(), tabs }), "utf8");
  }
  if (truncated) console.log("warning: discovery stopped at 50 pages; coverage is partial");
  if (args.includes("--list-only")) { console.log(`${tabs.length} charts listed`); return; }

  // Rank each song's versions within each format; keep the top ALTS.
  const manifestPath = path.join(ROOT, "public", "corpus", "manifest.json");
  const artistRows = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
        .filter((r) => r.artist?.toLowerCase() === ARTIST.toLowerCase())
    : [];
  // Never re-download a version that's already in the corpus under any id.
  const haveUrls = new Set(
    fs.existsSync(OUT)
      ? fs.readdirSync(OUT).filter((f) => f.endsWith(".json"))
          .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")).sourceUrl; } catch { return null; } })
          .filter(Boolean)
      : [],
  );
  // Include new records not yet present in a rebuilt manifest.
  if (fs.existsSync(OUT)) for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith(".json"))) {
    try { const row = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); if (artistKey(row.artist) === artistKey(ARTIST)) artistRows.push(row); } catch { /* skip malformed legacy files */ }
  }
  const picks = selectTabs(tabs, { alts: ALTS, chordsOnly: CHORDS_ONLY, knownOnly: KNOWN_ONLY, skipExistingChords: SKIP_EXISTING_CHORDS, artistRows });
  console.log(`${tabs.length} listed → ${picks.length} selected, up to ${ALTS} per format; new-chart limit ${LIMIT}`);

  let written = 0, skipped = 0, failed = 0, attempted = 0, consecutiveFailures = 0;
  for (const t of picks) {
    if (haveUrls.has(t.tab_url)) { skipped++; continue; }
    if (attempted >= LIMIT) break;
    const ver = t.alt > 0 ? ` (ver ${t.version || t.alt + 1})` : "";
    const id = outputId(ARTIST, t, (s) => fs.existsSync(path.join(OUT, `${s}.json`)));
    const fp = path.join(OUT, `${id}.json`);
    if (fs.existsSync(fp)) { skipped++; continue; }
    attempted++;
    if (DRY) { console.log(`  would fetch: ${t.song_name} (${t.type})`); continue; }
    await sleep(DELAY);
    try {
      const d = await pageData(t.tab_url);
      if (d?.tab?.artist_name && artistKey(d.tab.artist_name) !== artistKey(hit.artist_name)) throw new Error(`chart artist mismatch: ${d.tab.artist_name}`);
      const view = d?.tab_view;
      let body = view?.wiki_tab?.content || "";
      if (!body.trim()) throw new Error("empty chart body");
      // page JSON double-escapes: after &amp;→& the body still carries literal
      // &gt;/&lt; where transcribers drew arrows (kinsella-web agent's find, 2026-07-15)
      body = body.replace(/\[\/?(ch|tab)\]/g, "").replace(/\r\n/g, "\n")
        .replace(/&gt;/g, ">").replace(/&lt;/g, "<");
      const meta = view?.meta || {};
      const rec = {
        id, artist: ARTIST, title: t.song_name + ver,
        album: d?.tab?.album_name || null, albumOrder: 9999,
        source: "ultimateguitar", sourceUrl: t.tab_url,
        tuning: meta.tuning?.value || "standard", tuningRaw: meta.tuning?.value || null,
        capo: meta.capo ?? null, key: d?.tab?.tonality_name || null,
        format: t.type === "Chords" ? "chords" : "tab",
        transcriber: d?.tab?.username || null,
        fetchedAt: new Date().toISOString().slice(0, 10),
      };
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(fp, JSON.stringify({ ...rec, body }), { encoding: "utf8", flag: "wx" });
      haveUrls.add(t.tab_url);
      console.log(`  ✓ ${t.song_name}  (${t.type}${meta.capo ? `, capo ${meta.capo}` : ""}${meta.tuning?.value ? `, ${meta.tuning.value}` : ""})`);
      written++;
      consecutiveFailures = 0;
    } catch (e) {
      console.log(`  ✗ ${t.song_name}: ${e.message}`);
      failed++;
      consecutiveFailures++;
      if (e.rateLimited || consecutiveFailures >= 3) {
        console.log(e.rateLimited ? "stopped: UG rate limit; preserve results and try after the source recovers" : "stopped: three consecutive chart failures");
        break;
      }
    }
  }
  console.log(`written ${written} · skipped ${skipped} · failed ${failed}`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
