// songsterr_harvest.mjs — harvest Songsterr's community-transcribed tabs into
// the local corpus, and audit the existing corpus against Songsterr's
// per-track tuning evidence. Run from repo root:
//
//   node tools/songsterr_harvest.mjs --artist "Alex G"           harvest → public/corpus/songsterr/
//   node tools/songsterr_harvest.mjs --artist "Alex G" --dry     plan only (no files written)
//   node tools/songsterr_harvest.mjs --audit                     tuning audit, EVERY corpus artist
//   node tools/songsterr_harvest.mjs --audit --artist "Alex G"   audit one artist
//   flags: --limit N · --force (rewrite existing) · --delay ms (default 1000)
//          --refresh (bypass response cache)
//
// Why Songsterr: its tabs are Guitar-Pro-style transcriptions with an ABSOLUTE
// per-track tuning (MIDI numbers), actively revised and moderated — much closer
// to how songs are actually played than chords-over-lyrics sites. The body this
// tool emits is real monospaced ASCII tab with string labels, so keylit's
// evidence chain (build_manifest.mjs) resolves the tuning at its strongest
// tier ("labels") and src/lib/tab.js can light the piano from the frets.
//
// Endpoints (reverse-engineered from the public web app, personal use only —
// public/corpus is gitignored and never ships):
//   GET /api/songs?pattern={q}&size=N              search (tracks + tunings inline)
//   GET /api/artist/{artistId}/search?size=N       full catalog → { records: [...] }
//   GET /api/meta/{songId}                         current revisionId + image + tracks
//   GET https://dqsljvtekg760.cloudfront.net/{songId}/{revisionId}/{image}/{partId}.json
//       note data: measures → voices → beats → notes {string, fret, dead?}
//       (string 0 = HIGHEST; tuning array is high→low; gzip; alt hosts on 403)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALITIES, buildChord } from "../src/lib/theory.js";
import { getTuning, tuningSpelling } from "../src/lib/tuning.js";
import { findTabBlocks, parseTabBlock } from "../src/lib/tab.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = path.join(ROOT, "public", "corpus");
const OUT_DIR = path.join(CORPUS, "songsterr");
const CACHE_DIR = path.join(CORPUS, "_state", "songsterr_cache");
const AUDIT_DIR = path.join(ROOT, "docs", "audit");

const API = "https://www.songsterr.com";
const CDN = ["dqsljvtekg760", "d34shlm8p2ums2", "d3cqchs6g3b5ew"];
const PART_CDN = ["d3rrfvx08uyjp1", "dodkcbujl0ebx", "dj1usja78sinh"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) keylit-personal-corpus";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};
const DELAY = Number(opt("delay", 1000));
const LIMIT = Number(opt("limit", Infinity)) || Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pc = (m) => ((m % 12) + 12) % 12;

/* ---- polite HTTP with an on-disk cache ---------------------------------- */

let lastRequestAt = 0;
async function fetchJson(url, { cacheKey } = {}) {
  const key = cacheKey || url.replace(/[^a-z0-9]+/gi, "_").slice(-140);
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  if (!flag("refresh") && fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  }
  const wait = lastRequestAt + DELAY - Date.now();
  if (wait > 0) await sleep(wait);
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      lastRequestAt = Date.now();
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(data), "utf8");
      return data;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (attempt + 1) ** 2);
    }
  }
  throw new Error(`fetch failed after retries: ${url} (${lastErr})`);
}

/* ---- catalog ------------------------------------------------------------- */

// Corpus artist name → extra names Songsterr may file the same artist under.
const ARTIST_ALIASES = {
  "alex g": ["alex giannascoli", "(sandy) alex g", "sandy alex g"],
  "bonnie prince billy": ["bonnie 'prince' billy", "bonnie ‘prince’ billy", "will oldham"],
  "songs: ohia": ["songs ohia", "jason molina"],
};

const normArtist = (s) =>
  String(s || "").toLowerCase().replace(/['‘’"().:]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Strip performance qualifiers so "East Coast (accurate)" and "N64 (Ver 2)"
// group with their canonical titles.
const TITLE_NOISE = /\((?:accurate|full|ver\.?\s*\d+|version\s*\d+|live|acoustic|demo|instrumental|solo|intro|cover|fingerstyle|simplified|easy)[^)]*\)/gi;
// Songsterr now carries machine-made transcriptions, self-labelled in the
// title ("The Plan (AI)", "Temporarily Blind (AI Generated for a Bro)").
// Stripped for GROUPING only — so they compete with the human transcription
// of the same song instead of landing as a separate "song" — and ranked last
// below. A kept AI chart keeps the marker in its displayed title.
const AI_MARK = /\(\s*ai\s*\)|\(\s*ai[- ]generated[^)]*\)|\bai[- ]generated\b/i;
const AI_MARK_G = new RegExp(AI_MARK.source, "gi");
const isAiTranscription = (title) => AI_MARK.test(String(title || ""));
const normTitle = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(TITLE_NOISE, " ")
    .replace(AI_MARK_G, " ")
    .replace(/['‘’"“”().,!?:;]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Known same-song title variants (Songsterr vs corpus slugs).
const TITLE_SYNONYMS = new Map([
  ["n64", "nintendo 64"],
  ["track 10 halloween", "halloween"],
]);
const canonTitle = (s) => {
  const n = normTitle(s);
  return TITLE_SYNONYMS.get(n) || n;
};

async function artistCatalog(artistName) {
  const wanted = new Set([normArtist(artistName), ...(ARTIST_ALIASES[normArtist(artistName)] || []).map(normArtist)]);
  const search = await fetchJson(`${API}/api/songs?pattern=${encodeURIComponent(artistName)}&size=100`);
  const ids = new Map(); // artistId → hit count
  for (const s of search || []) {
    if (wanted.has(normArtist(s.artist))) ids.set(s.artistId, (ids.get(s.artistId) || 0) + 1);
  }
  if (!ids.size) return { records: [], artistIds: [] };
  const artistIds = [...ids.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const records = [];
  for (const id of artistIds) {
    const PAGE = 200;
    for (let from = 0; from < 1000; from += PAGE) {
      const cat = await fetchJson(
        `${API}/api/artist/${id}/search?size=${PAGE}&from=${from}`,
        { cacheKey: `artist_${id}_search_${from}` }
      );
      const page = cat?.records || [];
      for (const r of page) {
        if (wanted.has(normArtist(r.artist))) records.push(r);
      }
      if (page.length < PAGE) break;
    }
  }
  return { records, artistIds };
}

/* ---- track + transcription choice ---------------------------------------- */

const isGuitarTrack = (t) =>
  !t.isEmpty && !t.isVocalTrack &&
  (/guitar/i.test(t.instrument || "") || /guitar/i.test(t.name || "")) &&
  !/bass/i.test(t.instrument || "") &&
  Array.isArray(t.tuning) && t.tuning.length >= 4 && t.tuning.length <= 8;

const bestGuitarViews = (rec) =>
  Math.max(0, ...(rec.tracks || []).filter(isGuitarTrack).map((t) => t.views || 0));

// One transcription per song: a human transcription always beats a machine
// one; community "(accurate)" forks outrank raw popularity (they exist
// because the popular one was wrong); then views.
function pickTranscriptions(records) {
  const byTitle = new Map();
  for (const rec of records) {
    if (rec.isJunk || !rec.hasPlayer) continue;
    if (!(rec.tracks || []).some(isGuitarTrack)) continue;
    const key = canonTitle(rec.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(rec);
  }
  const picks = new Map();
  for (const [key, recs] of byTitle) {
    recs.sort((a, b) => {
      const aiA = isAiTranscription(a.title) ? 1 : 0;
      const aiB = isAiTranscription(b.title) ? 1 : 0;
      if (aiA !== aiB) return aiA - aiB;
      const accA = /\(accurate\)/i.test(a.title) ? 1 : 0;
      const accB = /\(accurate\)/i.test(b.title) ? 1 : 0;
      if (accA !== accB) return accB - accA;
      return bestGuitarViews(b) - bestGuitarViews(a);
    });
    picks.set(key, recs[0]);
  }
  return picks;
}

/* ---- note data ------------------------------------------------------------ */

async function fetchTrackNotes(songId, revisionId, image, partId) {
  const urls = image
    ? CDN.map((h) => `https://${h}.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`)
    : PART_CDN.map((h) => `https://${h}.cloudfront.net/part/${revisionId}/${partId}`);
  let lastErr;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, { cacheKey: `notes_${songId}_${revisionId}_${partId}` });
      if (data && data.measures) return data;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`no note data for song ${songId} part ${partId} (${lastErr || "empty"})`);
}

/* ---- chord derivation ------------------------------------------------------
 * Per measure: duration-weighted pitch-class histogram over every sounded
 * (non-dead) note, then template-match keylit's own chord vocabulary so the
 * derived names use the exact same intervals the app plays. Bass-aware:
 * a strong non-root bass that is a chord tone becomes a slash. Conservative:
 * a sparse or ambiguous measure gets NO label rather than a guessed one. */

const CHORD_TEMPLATES = ["", "m", "5", "7", "m7", "maj7", "sus4", "sus2", "add9", "6", "m6", "9", "m7b5", "dim"];

function measureHistogram(measure, tuningHighToLow) {
  const hist = new Array(12).fill(0);
  let total = 0, bassMidi = Infinity, bassW = 0;
  for (const voice of measure.voices || []) {
    for (const beat of voice.beats || []) {
      if (beat.rest) continue;
      const [num, den] = beat.duration || [1, 8];
      const w = num / (den || 8);
      for (const note of beat.notes || []) {
        if (note.rest || note.dead || note.fret == null) continue;
        const open = tuningHighToLow[note.string];
        if (open == null) continue;
        const midi = open + note.fret;
        hist[pc(midi)] += w;
        total += w;
        if (midi < bassMidi) { bassMidi = midi; bassW = w; }
        else if (pc(midi) === pc(bassMidi)) bassW += w;
      }
    }
  }
  return { hist, total, bassPc: bassMidi === Infinity ? null : pc(bassMidi) };
}

function chordForMeasure(measure, tuningHighToLow) {
  const { hist, total, bassPc } = measureHistogram(measure, tuningHighToLow);
  if (total < 0.4) return null; // a couple of passing notes is not a chord
  const present = hist.map((w, i) => ({ pcv: i, w })).filter((x) => x.w > 0);
  if (present.length < 2) return null;

  let best = null;
  for (const { pcv: root, w: rootW } of present) {
    if (rootW / total < 0.08) continue;
    for (const key of CHORD_TEMPLATES) {
      const tpl = QUALITIES[key].intervals.map((iv) => pc(root + iv));
      const tplSet = new Set(tpl);
      let matched = 0, covered = 0;
      for (const { pcv, w } of present) if (tplSet.has(pcv)) matched += w;
      for (const t of tplSet) if (hist[t] > 0) covered++;
      if (covered < Math.min(tplSet.size, 2)) continue;
      const coverage = covered / tplSet.size;      // how much of the chord is heard
      const purity = matched / total;              // how much of the audio is chord
      if (purity < 0.72) continue;
      let score = purity * 1.2 + coverage
        + (bassPc === root ? 0.22 : 0)
        + (hist[root] / total) * 0.35
        + (tplSet.size === 2 ? -0.18 : 0)          // power chord only when nothing richer fits
        - tplSet.size * 0.015;                     // simpler names on ties
      if (!best || score > best.score) best = { score, root, key, tplSet };
    }
  }
  if (!best) return null;
  const slash = bassPc !== null && bassPc !== best.root && best.tplSet.has(bassPc) ? bassPc : null;
  return buildChord(best.root, best.key, slash).raw;
}

/* ---- ASCII tab rendering ----------------------------------------------------
 * String 0 (Songsterr) = highest = TOP row, which is exactly the convention
 * src/lib/tab.js expects ("highOnTop"). Labels are the open-string names, so
 * build_manifest.mjs resolves the tuning from the tab itself — evidence tier 1.
 * Columns are beat-indexed (each beat gets a fixed-width cell), bars end in
 * "|", dead notes render as x, and each system carries its chord line above. */

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MEASURES_PER_SYSTEM = 4;

function stringLabels(tuningHighToLow) {
  return tuningHighToLow.map((m, i) => {
    const name = SHARP[pc(m)];
    return i === 0 ? name.toLowerCase() : name;
  });
}

function renderSong(notesJson) {
  const tuning = notesJson.tuning; // high → low, absolute MIDI
  const nStrings = tuning.length;
  const labels = stringLabels(tuning);
  const labelW = Math.max(...labels.map((l) => l.length));

  // Per measure: chord, section marker, and per-beat cells.
  const measures = (notesJson.measures || []).map((m) => {
    const beats = m.voices?.[0]?.beats || [];
    const cells = beats.map((beat) => {
      const perString = new Array(nStrings).fill(null);
      if (!beat.rest) {
        for (const note of beat.notes || []) {
          if (note.rest || note.fret == null || perString[note.string] !== null) continue;
          perString[note.string] = note.dead ? "x" : String(note.fret);
        }
      }
      const width = Math.max(3, ...perString.filter(Boolean).map((s) => s.length + 1));
      return { perString, width };
    });
    return {
      cells,
      chord: chordForMeasure(m, tuning),
      marker: m.marker?.text?.trim() || null,
      empty: cells.every((c) => c.perString.every((s) => s === null)),
    };
  });

  // Trim pure-silence measures from both ends (count-in / trailing rest bars).
  let start = 0, end = measures.length;
  while (start < end && measures[start].empty && !measures[start].marker) start++;
  while (end > start && measures[end - 1].empty) end--;
  const song = measures.slice(start, end);

  const out = [];
  let system = [];

  const flushSystem = () => {
    if (!system.length) return;
    // chord line, aligned to each measure's first column
    let chordLine = " ".repeat(labelW + 1);
    let rows = labels.map((l) => l.padEnd(labelW) + "|");
    for (const m of system) {
      let mWidth = m.cells.reduce((s, c) => s + c.width, 0) || 3;
      chordLine += (m.chord ? m.chord : "").padEnd(mWidth + 1).slice(0, mWidth + 1);
      for (let r = 0; r < nStrings; r++) {
        let row = "";
        for (const cell of m.cells) {
          const v = cell.perString[r];
          row += (v === null ? "" : v).padEnd(cell.width, "-");
        }
        rows[r] += (row || "-".repeat(3)).padEnd(mWidth, "-") + "|";
      }
    }
    if (chordLine.trim()) out.push(chordLine.trimEnd());
    out.push(...rows);
    out.push("");
    system = [];
  };

  for (const m of song) {
    if (m.marker) {
      flushSystem();
      out.push(`[${m.marker}]`);
    }
    system.push(m);
    if (system.length >= MEASURES_PER_SYSTEM) flushSystem();
  }
  flushSystem();

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/* ---- corpus writing --------------------------------------------------------- */

const slug = (s) =>
  String(s).toLowerCase().replace(/['‘’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function corpusRecord({ artist, rec, meta, track, body, author }) {
  const lowToHigh = [...track.tuning].reverse();
  return {
    // "--sst" keeps the id distinct from a same-titled ultimate-guitar chart:
    // the chord-and-lyrics sheet and the note-accurate tab are different
    // artifacts, and the Library should offer both side by side.
    id: `${slug(artist)}--${slug(rec.title.replace(TITLE_NOISE, " ").trim())}--sst`,
    artist,
    title: rec.title.replace(TITLE_NOISE, " ").replace(/\s+/g, " ").trim(),
    album: null,
    albumOrder: 9999,
    source: "songsterr",
    sourceUrl: `https://www.songsterr.com/a/wsa/${slug(artist)}-${slug(rec.title)}-tab-s${rec.songId}`,
    tuning: tuningSpelling(lowToHigh) === "E A D G B E" ? "standard" : tuningSpelling(lowToHigh),
    tuningRaw: tuningSpelling(lowToHigh),
    capo: null, // Songsterr transcriptions are absolute-pitch; no capo concept
    key: null,
    format: "tab",
    body,
    transcriber: author || null,
    fetchedAt: new Date().toISOString(),
    songsterr: {
      songId: rec.songId,
      revisionId: meta.revisionId,
      track: track.name || track.instrument || "Guitar",
      trackViews: track.views || 0,
      difficulty: track.difficulty ?? null,
    },
  };
}

// Round-trip guard: the emitted body must parse through keylit's own tab.js
// with the tuning recovered from the labels and every event's MIDI derivable
// from the Songsterr tuning. A body that fails is a bug, not a corpus file.
function selfTest(record, trackTuningHighToLow) {
  const blocks = findTabBlocks(record.body);
  if (!blocks.length) return "no tab blocks found";
  const expected = [...trackTuningHighToLow].reverse();
  const parsed = parseTabBlock(blocks[0].lines);
  if (blocks[0].lines.length === expected.length && !parsed.tuningFromLabels) return "labels did not resolve";
  const got = parsed.tuning.notes;
  for (let i = 0; i < Math.min(got.length, expected.length); i++) {
    if (pc(got[i]) !== pc(expected[i])) return `label pc mismatch on string ${i}: ${got[i]} vs ${expected[i]}`;
  }
  return null;
}

/* ---- sounding-pitch comparison (the audit's heart) ---------------------------
 * Corpus rows say "tuning X, capo N" (written); Songsterr says absolute MIDI.
 * Same SOUND = same per-string pitch (allowing a uniform octave shift). A
 * mismatch vector like "+1 ×6" means the corpus is a half step flat of how
 * the song is actually played — exactly the Alex G complaint. */

function soundingFromCorpus(tuningId, capo) {
  const t = getTuning(tuningId || "standard");
  if (!t?.notes) return null;
  return t.notes.map((m) => m + (Number(capo) || 0));
}

function compareSounding(corpusLowToHigh, songsterrHighToLow) {
  if (!corpusLowToHigh || !songsterrHighToLow) return null;
  const ss = [...songsterrHighToLow].reverse();
  if (ss.length !== corpusLowToHigh.length) return { verdict: "string-count", delta: null };
  const delta = ss.map((m, i) => m - corpusLowToHigh[i]);
  const uniform = delta.every((d) => d === delta[0]);
  if (delta.every((d) => d === 0)) return { verdict: "match", delta };
  if (uniform && Math.abs(delta[0]) % 12 === 0) return { verdict: "match-octave", delta };
  return { verdict: "MISMATCH", delta };
}

/* ---- harvest mode ------------------------------------------------------------ */

async function harvestArtist(artistName) {
  console.log(`\n=== Harvest: ${artistName} ===`);
  const { records } = await artistCatalog(artistName);
  console.log(`catalog: ${records.length} Songsterr records`);
  const picks = pickTranscriptions(records);
  console.log(`unique songs with a guitar track: ${picks.size}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = { written: [], skipped: [], failed: [] };
  let n = 0;
  for (const [key, rec] of [...picks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n >= LIMIT) break;
    n++;
    const outPath = path.join(OUT_DIR, `${slug(artistName)}--${slug(rec.title.replace(TITLE_NOISE, " ").trim())}--sst.json`);
    if (fs.existsSync(outPath) && !flag("force")) { results.skipped.push(key); continue; }
    try {
      const meta = await fetchJson(`${API}/api/meta/${rec.songId}`, { cacheKey: `meta_${rec.songId}` });
      if (!meta?.image) throw new Error("no image hash in meta");
      const guitars = (meta.tracks || []).map((t, i) => ({ ...t, partId: i })).filter(isGuitarTrack);
      if (!guitars.length) throw new Error("no guitar track in meta");
      guitars.sort((a, b) => (b.views || 0) - (a.views || 0));
      const track = guitars[0];
      const notes = await fetchTrackNotes(rec.songId, meta.revisionId, meta.image, track.partId);
      const body = renderSong(notes);
      const record = corpusRecord({ artist: artistName, rec, meta, track, body, author: meta.author?.name });
      const err = selfTest(record, notes.tuning);
      if (err) throw new Error(`self-test: ${err}`);
      if (!flag("dry")) fs.writeFileSync(outPath, JSON.stringify(record), "utf8");
      results.written.push({ key, title: rec.title, tuning: record.tuningRaw, views: track.views, songId: rec.songId });
      console.log(`  ✓ ${rec.title}  [${record.tuningRaw}]  (${track.name}, ${track.views} views)${flag("dry") ? "  DRY" : ""}`);
    } catch (e) {
      results.failed.push({ key, title: rec.title, error: String(e.message || e) });
      console.log(`  ✗ ${rec.title} — ${e.message || e}`);
    }
  }
  console.log(`\nwritten ${results.written.length} · skipped ${results.skipped.length} · failed ${results.failed.length}`);
  return results;
}

/* ---- audit mode --------------------------------------------------------------- */

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8"));
}

async function auditArtists(only) {
  const manifest = loadManifest();
  const artists = [...new Set(manifest.map((r) => r.artist))]
    .filter((a) => !only || normArtist(a) === normArtist(only))
    .sort();
  console.log(`Auditing ${artists.length} artist(s) against Songsterr…`);

  const rows = [];
  for (const artist of artists) {
    let catalog;
    try {
      catalog = await artistCatalog(artist);
    } catch (e) {
      console.log(`  ! ${artist}: catalog failed (${e.message})`);
      continue;
    }
    const picks = pickTranscriptions(catalog.records);
    const corpusRows = manifest.filter((r) => r.artist === artist);
    let matched = 0;
    for (const row of corpusRows) {
      const rec = picks.get(canonTitle(row.title));
      if (!rec) { rows.push({ artist, title: row.title, verdict: "no-songsterr", corpus: `${row.tuningName || row.tuning} capo ${row.capo || 0}`, songsterr: "", delta: "", views: 0, url: "" }); continue; }
      matched++;
      const guitars = (rec.tracks || []).filter(isGuitarTrack).sort((a, b) => (b.views || 0) - (a.views || 0));
      const track = guitars[0];
      const cmp = compareSounding(soundingFromCorpus(row.tuningId || row.tuning, row.capo), track.tuning);
      rows.push({
        artist, title: row.title,
        verdict: cmp?.verdict || "?",
        corpus: `${row.tuningName || row.tuning}${row.capo ? ` capo ${row.capo}` : ""}`,
        songsterr: tuningSpelling([...track.tuning].reverse()),
        delta: cmp?.delta ? cmp.delta.join(",") : "",
        views: track.views || 0,
        url: `https://www.songsterr.com/a/wsa/x-tab-s${rec.songId}`,
      });
    }
    const bad = rows.filter((r) => r.artist === artist && r.verdict === "MISMATCH").length;
    console.log(`  ${artist}: ${corpusRows.length} corpus · ${matched} matched on Songsterr · ${bad} tuning mismatches`);
  }

  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const tsv = ["artist\ttitle\tverdict\tcorpus\tsongsterr\tdelta\tviews\turl",
    ...rows.map((r) => [r.artist, r.title, r.verdict, r.corpus, r.songsterr, r.delta, r.views, r.url].join("\t"))].join("\n");
  const tsvPath = path.join(AUDIT_DIR, `songsterr-audit-${stamp}.tsv`);
  fs.writeFileSync(tsvPath, tsv, "utf8");

  const mismatches = rows.filter((r) => r.verdict === "MISMATCH").sort((a, b) => b.views - a.views);
  const md = [
    `# Songsterr tuning audit — ${stamp}`,
    "",
    `Corpus songs checked: ${rows.length} · matched on Songsterr: ${rows.filter((r) => r.verdict !== "no-songsterr").length} · sounding-pitch mismatches: ${mismatches.length}`,
    "",
    "A mismatch means the corpus chart's (tuning + capo) does NOT sound at the pitch the Songsterr transcription plays at. Delta is per-string semitones (Songsterr − corpus), low string first; \"+1×6\" = corpus a half step flat.",
    "",
    "| # | Artist | Title | Corpus says | Songsterr plays | Δ | Views |",
    "|---|--------|-------|-------------|-----------------|---|-------|",
    ...mismatches.map((r, i) => `| ${i + 1} | ${r.artist} | ${r.title} | ${r.corpus} | ${r.songsterr} | ${r.delta} | ${r.views} |`),
    "",
  ].join("\n");
  const mdPath = path.join(AUDIT_DIR, `songsterr-audit-${stamp}.md`);
  fs.writeFileSync(mdPath, md, "utf8");
  console.log(`\naudit written: ${tsvPath}\n               ${mdPath}`);
  return { rows, mismatches };
}

/* ---- main ----------------------------------------------------------------------- */

const artistArg = opt("artist", null);
if (flag("audit")) {
  await auditArtists(artistArg);
} else if (artistArg) {
  await harvestArtist(artistArg);
} else {
  console.log("usage: node tools/songsterr_harvest.mjs --artist \"Name\" [--dry|--force|--limit N] | --audit [--artist \"Name\"]");
  process.exit(1);
}
