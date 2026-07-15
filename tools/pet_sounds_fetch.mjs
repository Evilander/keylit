// Curated Pet Sounds importer. It preserves the existing PVG reductions and
// adds full-album fan charts plus distinct guitar/ensemble reductions.
//
// Run from the repo root:
//   node tools/pet_sounds_fetch.mjs [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");
const ALBUM = "Pet Sounds";
const ALBUM_ORDER = 11; // The Beach Boys' eleventh studio album.
const FETCHED_AT = new Date().toISOString().slice(0, 10);

const TRACKS = [
  "Wouldn't It Be Nice",
  "You Still Believe in Me",
  "That's Not Me",
  "Don't Talk (Put Your Head on My Shoulder)",
  "I'm Waiting for the Day",
  "Let's Go Away for Awhile",
  "Sloop John B",
  "God Only Knows",
  "I Know There's an Answer",
  "Here Today",
  "I Just Wasn't Made for These Times",
  "Pet Sounds",
  "Caroline, No",
].map((title) => ({ title }));

const slug = (value) => value
  .normalize("NFKD")
  .replace(/[’']/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .toLowerCase();

const titleKey = (value) => slug(value).replace(/-awhile$/, "-a-while");
const trackByKey = new Map(TRACKS.map((track) => [titleKey(track.title), track]));

function decodeEntities(value) {
  const named = {
    amp: "&", apos: "'", copy: "(c)", gt: ">", ldquo: "\"", lsquo: "'",
    lt: "<", mdash: "-", nbsp: " ", ndash: "-", quot: "\"", rdquo: "\"", rsquo: "'",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

function cleanChartHtml(value) {
  return decodeEntities(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/\u200b/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\s*(?:Continua|Continúa|Continue) (?:depois|después|after) (?:do |del |the )?(?:anuncio|ad)\s*$/gim, "")
    .replace(/^\s*(?:Remover|Eliminar|Remove) (?:anuncios|ads)\s*$/gim, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function fetchHtml(url, encoding = "utf-8") {
  const response = await fetch(url, {
    headers: { "User-Agent": "Keylit/1.0 personal chord-sheet importer" },
  });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}

function preBlocks(html) {
  return [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)]
    .map((match) => cleanChartHtml(match[1]))
    .filter(Boolean);
}

function largestPre(html, url) {
  const blocks = preBlocks(html).sort((a, b) => b.length - a.length);
  if (!blocks[0]) throw new Error(`No chart <pre> found at ${url}`);
  return blocks[0];
}

function guitarTabsExplorerBody(html, url) {
  const blocks = [...html.matchAll(/<pre\b[^>]*class="[^"]*tab-container\s+chord-text[^"]*"[^>]*>([\s\S]*?)<\/pre>/gi)]
    .map((match) => match[1]
      .replace(/<span\b[^>]*class="section-badge"[^>]*>([\s\S]*?)<\/span>/gi, "[$1]")
      .replace(/<span\b[^>]*class="chord"[^>]*data-chord="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, "$1"))
    .map(cleanChartHtml)
    .filter(Boolean);
  if (!blocks.length) throw new Error(`No GuitarTabsExplorer chart found at ${url}`);
  return blocks.join("\n\n");
}

function goTabsBody(html, url) {
  const match = html.match(/<pre\b[^>]*id="core"[^>]*>([\s\S]*?)<div\b[^>]*id="thechords"/i);
  if (!match) throw new Error(`No GoTabs chart found at ${url}`);
  return cleanChartHtml(match[1].replace(/<\/pre>\s*$/i, ""));
}

function labelUnlabeledTabs(body) {
  const lines = body.split("\n");
  const isUnlabeledTabLine = (line) => {
    const value = line.trimStart();
    if (/^[A-Ga-g][#b]?\s*[|:]/.test(value)) return false;
    if ((value.match(/-/g) || []).length < 3 || !/^[-0-9|]/.test(value)) return false;
    const tabChars = (value.match(/[-0-9|:hpbsrxt/\\~^.()* ]/gi) || []).length;
    return tabChars / value.length >= 0.85;
  };
  const labelRun = (start, length, labels) => {
    for (let offset = 0; offset < length; offset++) {
      const line = lines[start + offset];
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const value = line.trimStart();
      lines[start + offset] = `${indent}${labels[offset]}${value.startsWith("|") ? "" : "|"}${value}`;
    }
  };
  for (let start = 0; start < lines.length;) {
    if (!isUnlabeledTabLine(lines[start])) {
      start++;
      continue;
    }
    let end = start;
    while (end < lines.length && isUnlabeledTabLine(lines[end])) end++;
    const length = end - start;
    if (length === 4) labelRun(start, 4, ["G", "D", "A", "E"]);
    else if (length === 6) labelRun(start, 6, ["e", "B", "G", "D", "A", "E"]);
    else if (length % 6 === 0) {
      for (let offset = 0; offset < length; offset += 6) {
        labelRun(start + offset, 6, ["e", "B", "G", "D", "A", "E"]);
      }
    } else if (length % 4 === 0) {
      for (let offset = 0; offset < length; offset += 4) {
        labelRun(start + offset, 4, ["G", "D", "A", "E"]);
      }
    }
    start = end;
  }
  return lines.join("\n");
}

function makeRecord(track, source, suffix, sourceUrl, body, options = {}) {
  const normalizedBody = labelUnlabeledTabs(body);
  if (normalizedBody.length < 80) throw new Error(`Chart is unexpectedly short: ${track.title} (${source})`);
  return {
    id: `the-beach-boys--${slug(track.title)}--${suffix}`,
    artist: "The Beach Boys",
    title: track.title,
    album: ALBUM,
    albumOrder: ALBUM_ORDER,
    source,
    sourceUrl,
    tuning: "standard",
    tuningRaw: "E A D G B E",
    tuningSource: "meta",
    capo: options.capo ?? null,
    key: options.key ?? null,
    format: options.format ?? "chords",
    transcriber: options.transcriber ?? null,
    arrangement: options.arrangement ?? null,
    fetchedAt: FETCHED_AT,
    body: normalizedBody,
  };
}

function writeRecord(record) {
  const dir = path.join(ROOT, record.source);
  const file = path.join(dir, `${record.id}.json`);
  if (!DRY_RUN) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record), "utf8");
  }
  console.log(`${DRY_RUN ? "would write" : "wrote"}: ${record.source}/${record.id}`);
}

async function francisGreeneCharts() {
  const url = "https://surfermoon.neocities.org/francis/pet_sounds.html";
  const html = await fetchHtml(url);
  const records = [];
  for (const section of html.split(/<hr\b[^>]*>/i)) {
    if (!/Chart prepared by Francis Greene/i.test(section)) continue;
    const heading = section.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
    if (!heading) continue;
    const headingText = cleanChartHtml(heading[1]);
    const track = trackByKey.get(titleKey(headingText));
    if (!track) continue; // Excludes the bonus chart "Trombone Dixie".
    const body = cleanChartHtml(section)
      .replace(/\.{2,}/g, (dots) => " ".repeat(dots.length))
      .replace(/[ \t]+$/gm, "");
    records.push(makeRecord(track, "surfermoon", "francis-greene", url, body, {
      format: "chords",
      transcriber: "Francis Greene",
      arrangement: "Full-album fan chord chart with lyric or form alignment",
    }));
  }
  if (records.length !== TRACKS.length) {
    throw new Error(`Expected ${TRACKS.length} Francis Greene charts, found ${records.length}`);
  }
  return records;
}

const SURFERMOON_ALTERNATES = [
  ["Wouldn't It Be Nice", "https://surfermoon.neocities.org/tabs/wouldnt_it_be_nice.html", "awr", "Andrew Rogers", "mixed", "Guitar intro, fills, tempo change, and coda"],
  ["Don't Talk (Put Your Head on My Shoulder)", "https://surfermoon.neocities.org/tabs/dont_talk.html", "awr", "Andrew Rogers", "chords", "Original-key chromatic harmony and descending bass movement"],
  ["God Only Knows", "https://surfermoon.neocities.org/tabs/god_only_knows.html", "awr", "Andrew Rogers", "mixed", "Winds, keyboard, and piano-doubled bass arranged for guitar"],
  ["Here Today", "https://surfermoon.neocities.org/tabs/here_today.html", "awr", "Andrew Rogers", "mixed", "Bass/piano figures and instrumental ostinato arranged for guitar"],
  ["I Just Wasn't Made for These Times", "https://surfermoon.neocities.org/tabs/i_just.html", "awr", "Andrew Rogers", "mixed", "Bass, harpsichord/flute, and theremin/winds arranged for guitars"],
  ["Pet Sounds", "https://surfermoon.neocities.org/tabs/pet_sounds.html", "rui-afonso", "Rui Afonso", "mixed", "Instrumental form, lead figure, and bass fragment"],
  ["Caroline, No", "https://surfermoon.neocities.org/tabs/caroline_no.html", "awr", "Andrew Rogers", "chords", "Harpsichord-derived extended harmony adapted to guitar"],
];

const GTE_ALTERNATES = [
  ["Let's Go Away for Awhile", "https://www.guitartabsexplorer.com/beach-boys/lets-go-away-for-awhile-chords", "gte-awr", "Andrew Rogers", "chords", "Timed instrumental chord road map with meter changes"],
];

const GOTABS_ALTERNATES = [
  ["You Still Believe in Me", "https://www.gotabs.com/beach-boys/you-still-believe-in-me-tab", "Keyboard voicings and intro explicitly arranged for guitar"],
  ["I Know There's an Answer", "https://www.gotabs.com/beach-boys/i-know-theres-an-answer-tab", "Organ, wind break, string bass, banjo, and bass harmonica arranged for guitar"],
];

async function curatedAlternates() {
  const records = [];
  for (const [title, url, suffix, transcriber, format, arrangement] of SURFERMOON_ALTERNATES) {
    const track = trackByKey.get(titleKey(title));
    records.push(makeRecord(track, "surfermoon", suffix, url, largestPre(await fetchHtml(url), url), {
      format, transcriber, arrangement,
    }));
  }
  for (const [title, url, suffix, transcriber, format, arrangement] of GTE_ALTERNATES) {
    const track = trackByKey.get(titleKey(title));
    records.push(makeRecord(track, "guitartabsexplorer", suffix, url, guitarTabsExplorerBody(await fetchHtml(url), url), {
      format, transcriber, arrangement,
    }));
  }
  for (const [title, url, arrangement] of GOTABS_ALTERNATES) {
    const track = trackByKey.get(titleKey(title));
    records.push(makeRecord(track, "gotabs", "gotabs-awr", url, goTabsBody(await fetchHtml(url, "windows-1252"), url), {
      format: "mixed",
      transcriber: "Andrew Rogers",
      arrangement,
    }));
  }

  const sloop = trackByKey.get(titleKey("Sloop John B"));
  const sloopUrl = "https://www.cifraclub.com/beach-boys/sloop-john-b/";
  records.push(makeRecord(sloop, "cifraclub", "cifraclub", sloopUrl, largestPre(await fetchHtml(sloopUrl), sloopUrl), {
    format: "mixed",
    key: "Ab",
    arrangement: "Flute and glockenspiel intro arranged for guitar with full chords",
  }));

  const petSounds = trackByKey.get(titleKey("Pet Sounds"));
  const petSoundsUrl = "https://www.bigchords.com/beach_boys_chords/pet_sounds_tab.html";
  records.push(makeRecord(petSounds, "bigchords", "bigchords-ida2jlen", petSoundsUrl, largestPre(await fetchHtml(petSoundsUrl), petSoundsUrl), {
    format: "mixed",
    transcriber: "ida2jlen",
    arrangement: "Detailed uncapoed lead tab; accompanying chord shapes use capo 1",
  }));
  return records;
}

function updatePvgAlbumMetadata() {
  const dir = path.join(ROOT, "songbooks");
  const files = fs.readdirSync(dir).filter((name) => /^the-beach-boys--.*--pspvg\.json$/.test(name));
  let updated = 0;
  for (const name of files) {
    const file = path.join(dir, name);
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    const track = trackByKey.get(titleKey(record.title));
    if (!track) continue;
    if (record.album === ALBUM && record.albumOrder === ALBUM_ORDER && record.title === track.title) continue;
    record.title = track.title;
    record.album = ALBUM;
    record.albumOrder = ALBUM_ORDER;
    if (!DRY_RUN) fs.writeFileSync(file, JSON.stringify(record), "utf8");
    updated++;
  }
  console.log(`${DRY_RUN ? "would update" : "updated"}: ${updated} existing PVG records`);
  return updated;
}

const records = [...await francisGreeneCharts(), ...await curatedAlternates()];
const ids = new Set(records.map((record) => record.id));
if (ids.size !== records.length) throw new Error("The curated Pet Sounds set contains duplicate IDs");
for (const record of records) writeRecord(record);
updatePvgAlbumMetadata();
console.log(`${DRY_RUN ? "validated" : "imported"}: ${records.length} fan charts across ${new Set(records.map((record) => record.source)).size} sources`);
