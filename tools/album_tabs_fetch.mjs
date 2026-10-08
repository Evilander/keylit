// Import the requested five albums into the personal-use corpus.
// Usage: node tools/album_tabs_fetch.mjs [--sources ug,gotabs,forum,guitartabscc] [--versions 2]
//        [--max-minutes 20] [--dry-run] [--enrich-only]
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseSheet } from "../src/lib/theory.js";
import { findTabBlocks, parseTabBlock } from "../src/lib/tab.js";
import { canonicalTuning } from "../src/lib/tuning.js";
import { REQUESTED_ALBUMS, requestedTrack, albumCoverage, slug, titleKey } from "./requested_albums.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");
const execFileAsync = promisify(execFile);

const trimBlankLines = (text) => text.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");

export function decodePage(bytes, contentType = "") {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const head = buffer.subarray(0, 8192).toString("latin1");
  const charset = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
    || head.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || "utf-8";
  return new TextDecoder(charset, { fatal: true }).decode(buffer);
}

export function decodeEntities(value) {
  const names = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", rsquo: "'", lsquo: "'", ndash: "-", mdash: "-" };
  return String(value).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (entity, name) => names[name.toLowerCase()] ?? entity);
}

export function chartText(html) {
  return decodeEntities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|pre)>/gi, "\n")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<\/?(?:a|abbr|b|strong|em|i|u|span|pre|h[1-6]|p|div|code|font|small|table|tbody|thead|tr|td|th|section|article|sup|sub|ol|ul|li|button|textarea|img|input)\b[^>]*>/gi, ""))
    .replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n");
}

export function goTabsBody(html) {
  const match = html.match(/<pre\b[^>]*id="core"[^>]*>([\s\S]*?)(?:<div\b[^>]*id="thechords"|<\/pre>)/i);
  if (!match) throw new Error("Missing GoTabs preformatted chart");
  return trimBlankLines(chartText(match[1]));
}

export function goTabsListings(html, artist) {
  const byFormat = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*title="([^"]+)\s+(Chords|Tabs?)"[^>]*>/gi)) {
    const title = decodeEntities(match[2]);
    const track = requestedTrack(artist, title);
    if (!track) continue;
    const sourceUrl = new URL(match[1].replace(/^\//, ""), "https://www.gotabs.com/").href;
    const format = /^chords$/i.test(match[3]) ? "chords" : "tab";
    const key = `${track.title}::${format}`;
    if (!byFormat.has(key)) byFormat.set(key, { ...track, sourceUrl, format });
  }
  return [...byFormat.values()];
}

export function ugPageData(html) {
  const content = html.match(/data-content="([^"]+)"/);
  if (!content) throw new Error("Missing Ultimate Guitar page data");
  const page = JSON.parse(decodeEntities(content[1])).store?.page?.data;
  if (!page || typeof page !== "object") throw new Error("Missing Ultimate Guitar data object");
  return page;
}

export function classicTabBodies(html) {
  return [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)]
    .map((match) => trimBlankLines(chartText(match[1])))
    .filter((body) => usableChart(body));
}

export function classicTabBody(html) {
  const blocks = classicTabBodies(html);
  if (!blocks.length) throw new Error("No parseable preformatted tab in archive page");
  return blocks.sort((a, b) => b.length - a.length)[0];
}

export function splitAlbumChart(body, artist) {
  const starts = [...body.matchAll(/^[ \t]*Group\/Singer Name:\s*[^\n]+/gm)].map((match) => match.index);
  return starts.map((start, index) => {
    const section = body.slice(start, starts[index + 1] ?? body.length);
    const title = section.match(/^[ \t]*Song:\s*"([^"]+)"/m)?.[1];
    const track = title && requestedTrack(artist, title);
    return track && usableChart(section) ? { ...track, body: section } : null;
  }).filter(Boolean);
}

export function fullAlbumRecords(tracks, sourceUrl) {
  const records = [];
  for (const track of tracks) {
    const variants = [];
    const alternate = track.title === "Happy Alone" ? "D A D G B E" : track.title === "Genius" ? "D G D G B D" : null;
    if (alternate) {
      const leadStart = track.body.search(/^.*\*KINGS OF LEON - .* LEAD PARTS\*.*$/m);
      if (leadStart < 0 || !/Rhythm\s*\(Caleb\)\s*-\s*Standard\s*\/\s*Lead\s*\(Matthew\)/i.test(track.body)) throw new Error(`Missing explicit rhythm/lead distinction: ${track.title}`);
      const sourceLead = track.body.match(/Lead\s*\(Matthew\)\s*-\s*(?:Drop D|Open G):\s*\[([A-Ga-g#b]+)\]/)?.[1];
      if (!sourceLead || canonicalTuning(sourceLead).id !== canonicalTuning(alternate).id) throw new Error(`Unexpected source lead tuning: ${track.title}`);
      variants.push({ part: "rhythm", tuningRaw: "E A D G B E", body: track.body.slice(0, leadStart).replace(/^Tuning:.*$/m, "Tuning: Standard - [EADGBe]") });
      variants.push({ part: "lead", tuningRaw: alternate, body: `Song: "${track.title}"\nPart: Matthew Followill lead guitar\nTuning: ${alternate}\n\n${track.body.slice(leadStart)}` });
    } else {
      if (!/^Tuning:\s*Standard(?:\s|-|\[|$)/m.test(track.body)) throw new Error(`Missing original standard tuning declaration: ${track.title}`);
      variants.push({ part: null, tuningRaw: "E A D G B E", body: track.body });
    }
    for (const variant of variants) {
      if (!usableChart(variant.body, variant.tuningRaw)) throw new Error(`Unparseable album part: ${track.title} ${variant.part || "full"}`);
      const suffix = variant.part ? `-${variant.part}` : "";
      records.push({ ...track, body: variant.body, id: `kings-of-leon--${slug(track.title)}--guitartabscc-dean-hill${suffix}`,
        source: "guitartabscc", sourceUrl: `${sourceUrl}#${slug(track.title)}${suffix}`,
        tuning: canonicalTuning(variant.tuningRaw).id, tuningRaw: variant.tuningRaw, tuningSource: "meta",
        capo: null, key: null, format: "tab", arrangement: variant.part ? `Dean Hill full-album transcription, ${variant.part} guitar` : "Dean Hill full-album transcription, rhythm and lead parts",
        transcriber: "Dean Hill", fetchedAt: new Date().toISOString().slice(0, 10) });
    }
  }
  return records;
}

export function normalizedCapo(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 11 ? number : null;
}

export function usableChart(body, tuning = "standard", capo = null) {
  if (typeof body !== "string" || body.trim().length < 35) return false;
  if (parseSheet(body).progression.length > 0) return true;
  return findTabBlocks(body).some((block) => parseTabBlock(block.lines, { tuning, capo }).events.length > 0);
}

export function ugRecord(listing, page, track) {
  if (page.tab?.artist_name && slug(page.tab.artist_name) !== slug(track.artist)) throw new Error("Source artist does not match requested artist");
  if (page.tab?.song_name && titleKey(page.tab.song_name) !== titleKey(track.title)) throw new Error("Source song does not match requested song");
  const view = page.tab_view;
  const body = decodeEntities(String(view?.wiki_tab?.content ?? "")
    .replace(/\[\/?(?:ch|tab)\]/g, "")).replace(/\r\n/g, "\n");
  const metadata = view?.meta ?? {};
  const tuningRaw = metadata.tuning?.value || null;
  const tuning = canonicalTuning(tuningRaw || "standard").id;
  const capo = normalizedCapo(metadata.capo);
  if (!usableChart(body, tuningRaw || tuning, capo)) throw new Error("No parseable chords or tab events");
  const tabId = String(page.tab?.id || listing.id || listing.tab_url.match(/-(\d+)$/)?.[1] || "");
  if (!/^\d+$/.test(tabId)) throw new Error("Missing numeric source chart identity");
  return {
    ...track, id: `${slug(track.artist)}--${slug(track.title)}--ug-${tabId}`,
    source: "ultimateguitar", sourceUrl: listing.tab_url,
    tuning, tuningRaw, ...(tuningRaw ? { tuningSource: "meta" } : {}), capo,
    key: page.tab?.tonality_name || null,
    format: listing.type === "Chords" ? "chords" : "tab",
    sourceFormat: listing.type, sourceVersion: listing.version ?? null,
    sourceTitle: listing.song_name || page.tab?.song_name || track.title,
    arrangement: `${listing.type === "Chords" ? "Chord chart" : "Guitar tablature"}, community version ${listing.version || 1}`,
    transcriber: page.tab?.username || view?.contributor?.username || null,
    rating: listing.rating || null, votes: listing.votes || 0,
    fetchedAt: new Date().toISOString().slice(0, 10), body,
  };
}

export function pickUgCharts(listings, artist, versions = 2) {
  const groups = new Map();
  for (const entry of listings) {
    const track = requestedTrack(artist, entry.song_name);
    if (!track || !["Chords", "Tabs"].includes(entry.type) || !entry.tab_url?.startsWith("https://tabs.ultimate-guitar.com/")) continue;
    const key = `${titleKey(track.title)}::${entry.type}`;
    const options = groups.get(key) || [];
    if (!options.some((option) => option.tab_url === entry.tab_url)) options.push(entry);
    groups.set(key, options);
  }
  const picks = [];
  for (const options of groups.values()) {
    options.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.votes || 0) - (a.votes || 0));
    picks.push(...options.slice(0, versions));
  }
  return picks;
}

function corpusRecords() {
  const records = [];
  for (const source of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, source);
    if (source.startsWith("_") || !fs.statSync(dir).isDirectory()) continue;
    for (const filename of fs.readdirSync(dir)) {
      if (!filename.endsWith(".json") || !/^(coldplay|kings-of-leon)--/.test(filename)) continue;
      const file = path.join(dir, filename);
      try { records.push({ record: JSON.parse(fs.readFileSync(file, "utf8")), file }); } catch { /* Existing unrelated files are untouched. */ }
    }
  }
  return records;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const versions = Number(option("--versions", 2));
  const maxMinutes = Number(option("--max-minutes", 20));
  if (!Number.isInteger(versions) || versions < 1 || versions > 4 || !Number.isFinite(maxMinutes) || maxMinutes <= 0 || maxMinutes > 40) throw new Error("Use 1–4 versions and a 1–40 minute time limit");
  const sources = option("--sources", "ug,gotabs,forum,guitartabscc").split(",");
  if (sources.some((source) => !["ug", "gotabs", "forum", "guitartabscc"].includes(source))) throw new Error("Sources must be ug,gotabs,forum,guitartabscc");
  const dryRun = args.includes("--dry-run");
  const enrichOnly = args.includes("--enrich-only");
  const deadline = Date.now() + maxMinutes * 60_000;
  const stateDir = path.join(ROOT, "_state", "requested-albums");
  fs.mkdirSync(stateDir, { recursive: true });
  const report = { startedAt: new Date().toISOString(), written: [], skipped: [], errors: [], enriched: [] };
  const checked = new Set();
  const blockedHosts = new Set();
  let expired = false;
  const get = async (url) => {
    if (Date.now() >= deadline) { expired = true; throw new Error("Import time limit reached"); }
    const cache = path.join(stateDir, `${slug(url)}.html`);
    const rawCache = path.join(stateDir, `${slug(url)}.raw.html`);
    if (fs.existsSync(rawCache)) return decodePage(fs.readFileSync(rawCache));
    if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
    const host = new URL(url).hostname;
    if (blockedHosts.has(host)) throw new Error(`Source stopped after rate limit: ${host}`);
    if (checked.has(url)) throw new Error("Already attempted this source URL in this run");
    checked.add(url);
    await new Promise((resolve) => setTimeout(resolve, 350));
    let result;
    try {
      result = await execFileAsync(curlBinary(), ["-fsSL", "--compressed", "--max-time", "20", "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", url],
        { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: Math.min(25_000, Math.max(1, deadline - Date.now())), windowsHide: true });
    } catch (error) {
      if (/\b429\b/.test(error.stderr || error.message)) blockedHosts.add(host);
      throw error;
    }
    const html = decodePage(result.stdout);
    fs.writeFileSync(rawCache, result.stdout);
    fs.writeFileSync(cache, html, "utf8");
    return html;
  };
  const existing = corpusRecords();
  const haveUrls = new Set(existing.map(({ record }) => record.sourceUrl));
  const save = (record) => {
    if (haveUrls.has(record.sourceUrl)) { report.skipped.push(record.sourceUrl); return; }
    const dir = path.join(ROOT, record.source);
    const file = path.join(dir, `${record.id}.json`);
    if (fs.existsSync(file)) throw new Error(`Refusing to replace existing chart ${record.id}`);
    if (!dryRun) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(record), "utf8"); }
    report.written.push({ id: record.id, artist: record.artist, title: record.title, source: record.source, sourceUrl: record.sourceUrl, format: record.format });
    haveUrls.add(record.sourceUrl);
    console.log(`${dryRun ? "validated" : "saved"} ${record.source}: ${record.artist} — ${record.title} (${record.format})`);
  };
  const captureError = (url, error) => {
    report.errors.push({ url, error: error.message });
    console.log(`failed ${url}: ${error.message}`);
  };
  if (!enrichOnly && sources.includes("ug")) {
    for (const artist of [...new Set(REQUESTED_ALBUMS.map((album) => album.artist))]) {
      if (expired) break;
      const artistPath = artist === "Coldplay" ? "/artist/coldplay_1782" : "/artist/kings_of_leon_3751";
      const listings = [];
      try {
        let pages = 1;
        for (let page = 1; page <= pages && page <= 24; page++) {
          const url = `https://www.ultimate-guitar.com${artistPath}${page > 1 ? `?page=${page}` : ""}`;
          const data = ugPageData(await get(url));
          pages = data.pagination?.pages?.length || Number(data.pagination?.total) || 1;
          listings.push(...(data.other_tabs || data.tabs || []));
        }
        const picks = pickUgCharts(listings, artist, versions);
        console.log(`${artist}: ${listings.length} listings → ${picks.length} requested album charts`);
        for (const listing of picks) {
          if (expired || blockedHosts.has("tabs.ultimate-guitar.com")) break;
          if (haveUrls.has(listing.tab_url)) { report.skipped.push(listing.tab_url); continue; }
          try { save(ugRecord(listing, ugPageData(await get(listing.tab_url)), requestedTrack(artist, listing.song_name))); }
          catch (error) { captureError(listing.tab_url, error); }
        }
      } catch (error) { captureError(`https://www.ultimate-guitar.com${artistPath}`, error); }
    }
  }
  if (!enrichOnly && sources.includes("gotabs")) {
    for (const artist of [...new Set(REQUESTED_ALBUMS.map((album) => album.artist))]) {
      const indexUrl = `https://www.gotabs.com/${slug(artist)}`;
      try {
        const listings = goTabsListings(await get(indexUrl), artist);
        console.log(`${artist}: ${listings.length} GoTabs album arrangements`);
        for (const listing of listings) {
          if (expired) break;
          const url = listing.sourceUrl;
          if (haveUrls.has(url)) { report.skipped.push(url); continue; }
          try {
            const body = goTabsBody(await get(url));
            if (!usableChart(body)) throw new Error("No parseable GoTabs chart");
            const capoMatch = body.match(/\bcapo\s*(?:(?:on|at)\s*(?:the\s*)?)?(\d{1,2})\b/i);
            save({ ...listing, id: `${slug(artist)}--${slug(listing.title)}--gotabs-${listing.format}`,
              source: "gotabs", tuning: "standard", tuningRaw: null, capo: normalizedCapo(capoMatch?.[1]), key: null,
              arrangement: `Community guitar ${listing.format === "tab" ? "tablature" : "chord chart"}`,
              transcriber: body.match(/(?:tabbed|transcribed)\s+by\s*:?\s*([^\n]+)/i)?.[1]?.trim() || null,
              fetchedAt: new Date().toISOString().slice(0, 10), body });
          } catch (error) { captureError(url, error); }
        }
      } catch (error) { captureError(indexUrl, error); }
    }
  }
  if (!enrichOnly && sources.includes("forum") && !expired) {
    const url = "https://coldplaying.com/forums/topic/59000-shiver-chriss-chords-and-jonns-tabs/";
    try {
      const html = await get(url);
      const blocks = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)].map((match) => trimBlankLines(chartText(match[1])));
      const specs = [
        { name: "rhythm", index: 0, tuningRaw: "E A B G B D#", format: "chords" },
        { name: "lead", index: 1, tuningRaw: "E A D G B E", format: "tab" },
      ];
      for (const spec of specs) {
        const sourceUrl = `${url}#${spec.name}`;
        if (haveUrls.has(sourceUrl)) { report.skipped.push(sourceUrl); continue; }
        const body = blocks[spec.index] || "";
        if (!usableChart(body, spec.tuningRaw)) throw new Error(`No parseable ${spec.name} Shiver forum chart`);
        const declaration = spec.name === "rhythm" ? /Tuning:\s*E A B G B D#/i : /Tuning:\s*Standar[dt]/i;
        if (!declaration.test(body)) throw new Error(`Unexpected ${spec.name} Shiver tuning declaration`);
        save({ ...requestedTrack("Coldplay", "Shiver"), id: `coldplay--shiver--coldplaying-${spec.name}`,
          source: "coldplaying", sourceUrl, tuning: canonicalTuning(spec.tuningRaw).id,
          tuningRaw: spec.tuningRaw, tuningSource: "meta", capo: null, key: null,
          format: spec.format, arrangement: spec.name === "rhythm" ? "Chris Martin rhythm guitar; corrected forum version" : "Jonny Buckland lead-guitar parts; forum version",
          transcriber: "Zergio107", fetchedAt: new Date().toISOString().slice(0, 10), body });
      }
    } catch (error) { captureError(url, error); }
  }
  if (!enrichOnly && sources.includes("guitartabscc") && !expired) {
    let consecutiveFailures = 0;
    for (const album of REQUESTED_ALBUMS.filter((album) => album.artist === "Kings of Leon")) {
      for (const title of album.tracks) {
        if (expired || consecutiveFailures >= 3 || blockedHosts.has("www.guitartabs.cc")) break;
        const url = `https://www.guitartabs.cc/tabs/k/kings_of_leon/${slug(title).replaceAll("-", "_")}_tab.html`;
        if (haveUrls.has(url)) { report.skipped.push(url); continue; }
        try {
          const body = classicTabBody(await get(url));
          const capoMatch = body.match(/\bcapo\s*(?:(?:on|at)\s*(?:the\s*)?)?(\d{1,2})\b/i);
          save({ ...requestedTrack(album.artist, title), id: `kings-of-leon--${slug(title)}--guitartabscc`,
            source: "guitartabscc", sourceUrl: url, tuning: "standard", tuningRaw: null,
            capo: normalizedCapo(capoMatch?.[1]), key: null, format: "tab",
            arrangement: /\blive\b/i.test(body.slice(0, 500)) ? "Community guitar tablature; live version" : "Community guitar tablature",
            transcriber: body.match(/(?:tabbed|transcribed)\s+by\s*:?\s*([^\n]+)/i)?.[1]?.trim() || null,
            fetchedAt: new Date().toISOString().slice(0, 10), body });
          consecutiveFailures = 0;
        } catch (error) { captureError(url, error); consecutiveFailures++; }
      }
    }
    const curated = [
      ["Coldplay", "High Speed", "https://www.guitartabs.cc/tabs/c/coldplay/high_speed_tab.html", "guitartabscc"],
      ["Kings of Leon", "Day Old Blues", "https://www.guitartabs.cc/tabs/k/kings_of_leon/day_old_blues_tab_ver_2.html", "guitartabscc-v2"],
    ];
    for (const [artist, title, url, suffix] of curated) {
      if (expired || blockedHosts.has("www.guitartabs.cc")) break;
      if (haveUrls.has(url)) { report.skipped.push(url); continue; }
      try {
        const body = classicTabBody(await get(url));
        save({ ...requestedTrack(artist, title), id: `${slug(artist)}--${slug(title)}--${suffix}`,
          source: "guitartabscc", sourceUrl: url, tuning: "standard", tuningRaw: null,
          capo: null, key: null, format: "tab", arrangement: "Community guitar tablature",
          transcriber: body.match(/(?:tabbed|transcribed)\s+by\s*:?\s*([^\n]+)/i)?.[1]?.trim() || null,
          fetchedAt: new Date().toISOString().slice(0, 10), body });
      } catch (error) { captureError(url, error); }
    }
    const albumUrl = "https://www.guitartabs.cc/tabs/k/kings_of_leon/youth_and_young_manhood_tab.html";
    if (!expired && !blockedHosts.has("www.guitartabs.cc")) {
      try {
        const tracks = splitAlbumChart(classicTabBodies(await get(albumUrl)).join("\n\n"), "Kings of Leon");
        if (tracks.filter((track) => track.albumTrackKind === "main").length !== 11) throw new Error("Full-album source does not contain all 11 explicit song sections");
        for (const record of fullAlbumRecords(tracks, albumUrl)) save(record);
      } catch (error) { captureError(albumUrl, error); }
    }
  }
  for (const { record, file } of corpusRecords()) {
    const track = requestedTrack(record.artist, record.title);
    if (!track || Object.entries(track).every(([key, value]) => record[key] === value)) continue;
    if (!dryRun) {
      const backupDir = path.join(stateDir, "metadata-before", record.source);
      const backupFile = path.join(backupDir, path.basename(file));
      fs.mkdirSync(backupDir, { recursive: true });
      if (!fs.existsSync(backupFile)) fs.copyFileSync(file, backupFile);
      fs.writeFileSync(file, JSON.stringify({ ...record, ...track }), "utf8");
    }
    report.enriched.push(record.id);
  }
  report.finishedAt = new Date().toISOString();
  report.timeLimitReached = expired;
  report.rateLimitedHosts = [...blockedHosts];
  report.coverage = albumCoverage(corpusRecords().map(({ record }) => record));
  const reportPath = path.join(stateDir, `report-${report.startedAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ written: report.written.length, skipped: report.skipped.length,
    errors: report.errors.length, enriched: report.enriched.length,
    coverage: report.coverage.map(({ artist, album, expected, covered, missing }) => ({ artist, album, expected, covered, missing })), reportPath }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

export function curlBinary(platform = process.platform) { return platform === "win32" ? "curl.exe" : "curl"; }
