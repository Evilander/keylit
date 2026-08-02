// audit_capo.mjs — corpus-wide capo-metadata audit. Many charts declare a
// capo in the body text ("Capo on 3rd fret, chords relative") while the
// record's `capo` field is null — so the piano plays the shapes' pitch
// instead of the sounding pitch, and the Library never shows the capo tag.
// This tool classifies every capo mention and, with --fix, repairs the
// unambiguous ones. Run from repo root:
//   node tools/audit_capo.mjs           → report only
//   node tools/audit_capo.mjs --fix     → apply SAFE + CROSS fixes in place
//   node tools/audit_capo.mjs --review  → also list the REVIEW bucket
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSheet } from "../src/lib/theory.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");
const FIX = process.argv.includes("--fix");
const SHOW_REVIEW = process.argv.includes("--review");

const WORD_NUM = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11 };
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 };

const NEG = /\bno\s+capo\b|without\s+(a\s+)?capo|uncapo(?:ed|'d)|don'?t\s+(?:use|need|require)\s+(?:a\s+)?capo|doesn'?t\s+(?:use|need|require)\s+(?:a\s+)?capo|capo[ -]?less/i;
const JUNK = /^\W*capo\s+songs\W*$|^capo:?\s*none\.?$/i;
const RISK = /optional|or just|or capo|if you|you can|suggest|i prefer|prefer to|easier|alternative|instead of|live\b|version\s+\d|guitar\s*(?:1|2|one|two)\b|(?:1st|2nd)\s+guitar|guit\.?\s*[12]\b|two guitars|second guitar|lead guitar|except|solo|\?\)|unsure|i think|probably|maybe|might help|feel so inclined|capo songs|too much barre|transpose|disagree|only on (?:the )?(?:bottom|top)|partial capo|some strings|playing it without|works fine.*without|fits my voice|tip:/i;
const CONCERT = /\bconcert\b|sounding (?:chords|pitch)|chords (?:shown|written|named|below) are (?:the )?(?:actual|keyboard|sounding)|keyboard\/sounding|not relative to/i;
const RELATIVE = /relative to (?:the )?capo|in relation to the capo|as if (?:there (?:were|was) )?no capo|as if left open|capo as (?:the )?nut|fret 0 in this tab|chords are written as if/i;

// Hand-audited exclusions (2026-07-24): capo belongs to an ALTERNATIVE tuning
// or arrangement quoted in the text, not to the record's own tuning/chart.
const EXCLUDE = new Set([
  "kinsella/kinsella--american-football--letters-and-packages", // record: DADAC#E no capo; "or CGCGBD with a capo on II" is the alternative
  "kinsella/kinsella--owen--me",                                // record: open E; "EADF#DE or DGCECD,capo 2" are alternatives
  "ultimateguitar/owen--me",                                    // record: EADF#DE; capo 2 belongs to the DGCECD alternative
  "ultimateguitar/fleetwood-mac--gypsy",                        // body offers both "capo 3rd" and "no capo" arrangements
]);

// Hand-audited fixes from the REVIEW bucket (2026-07-24): the primary chart
// is unambiguously written in capo-relative shapes; the regex classifier
// demoted them on secondary mentions.
const HAND_FIX = new Map([
  ["ultimateguitar/arcade-fire--keep-the-car-running", 2],            // "Capo 2" primary; "No Capo Version" is a later alternate section
  ["hyperrust/neil-young--families", 5],                              // "Neil is playing this, with CAPO on 5th fret"; open-tuning alt follows
  ["ultimateguitar/ryan-adams--down-the-drain", 3],                   // "Capo: 3 fret"; the rest is UG transpose-button boilerplate
  ["ultimateguitar/jason-isbell--stockholm", 2],                      // "Standard, capo 2." — one line, poisoned by an "If you" clause
  ["gumbo/son-volt--mystifies-me", 1],                                // rhythm chart is capo-1 shapes; lead's capo 4 is a second guitar
  ["kinsella/kinsella--owen--nobodys-nothing", 4],                    // record tuning DADGBD matches the "DADGBD, capo 4" version
  ["kinsella/kinsella--owen--who-found-whose-hair-in-whose-bed", 3],  // record tuning matches "Capo 3rd fret, all notes relative to capo"
  ["songbooks/the-smiths--how-soon-is-now--smsc", 2],                 // "Chords shown as written; sounding chords in parentheses"
]);

// Extract every fret number a single line declares for the capo.
function fretsInLine(line) {
  const frets = new Set();
  let m;
  // "Capo 3" · "capo on the 4th fret" · "capoed at 5" · "capo'd 2"
  const digitRe = /\bcapo\w*\b[^0-9\n]{0,20}?(\d{1,2})(?:st|nd|rd|th)?/gi;
  while ((m = digitRe.exec(line))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 11) frets.add(n);
  }
  // "3rd fret capo" / "capoed on the fifth fret" / "capo second fret"
  const wordRe = /\bcapo\w*\b[^a-z0-9\n]{0,15}(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh)\b/gi;
  while ((m = wordRe.exec(line))) frets.add(WORD_NUM[m[1].toLowerCase()]);
  const preRe = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh)\s+fret\s+capo/gi;
  while ((m = preRe.exec(line))) frets.add(WORD_NUM[m[1].toLowerCase()]);
  // "Capo II" / "capo on IV" — roman numerals; separator must not swallow
  // the numeral's own capital letters (\W, not [^a-z]). Case-insensitive
  // prefix, but the numeral itself must be uppercase ("capo, I play" ≠ capo 1).
  const romanRe = /\bcapo\w*\b\W{0,6}(?:on\s+)?(VIII|VII|VI|IV|IX|III|II|V|I)\b/gi;
  while ((m = romanRe.exec(line))) {
    if (m[1] === m[1].toUpperCase()) frets.add(ROMAN[m[1].toUpperCase()]);
  }
  return [...frets];
}

function classify(rec) {
  const lines = String(rec.body || "").split("\n");
  const clean = new Set(), risky = new Set(), negated = new Set();
  let sawJunkOnly = true, sawNeg = false;
  const samples = [];
  for (const line of lines) {
    if (!/\bcapo\b/i.test(line)) continue;
    const t = line.trim();
    if (JUNK.test(t)) continue;
    sawJunkOnly = false;
    if (samples.length < 2) samples.push(t.slice(0, 100));
    const frets = fretsInLine(line);
    if (NEG.test(line)) { sawNeg = true; frets.forEach((f) => negated.add(f)); continue; }
    if (RISK.test(line)) { frets.forEach((f) => risky.add(f)); continue; }
    frets.forEach((f) => clean.add(f));
  }
  // a "concert pitch" disclaimer anywhere poisons clean declarations
  const concert = lines.some((l) => /\bcapo\b/i.test(l) && CONCERT.test(l));
  const relative = lines.some((l) => /\bcapo\b/i.test(l) && RELATIVE.test(l));
  for (const f of negated) { clean.delete(f); }
  return { clean: [...clean], risky: [...risky], sawJunkOnly, sawNeg, concert, relative, samples };
}

const slugBase = (s) =>
  String(s || "").toLowerCase().replace(/\s*\(?(ver|version)\s*\d+\)?\s*$/i, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// progression pitch-class multiset for cross-source comparison
function progKey(body, shift = 0) {
  const prog = parseSheet(body).progression || [];
  return prog.map((c) => String(((c.rootSemitone + shift) % 12 + 12) % 12)).sort().join(",");
}

const records = [];
for (const src of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, src);
  if (src.startsWith("_") || !fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let rec;
    try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (!rec.body) continue;
    records.push({ rec, file: path.join(dir, f), src });
  }
}

const safe = [], cross = [], review = [], alreadyOk = [];
let junkIgnored = 0, riskyOnly = 0, noMention = 0;

for (const { rec, file, src } of records) {
  const c = classify(rec);
  const hasMention = c.clean.length || c.risky.length || c.samples.length;
  if (!hasMention) { noMention++; continue; }
  if (c.sawJunkOnly) { junkIgnored++; continue; }
  if (EXCLUDE.has(src + "/" + rec.id)) {
    review.push({ src, id: rec.id, recCapo: rec.capo ?? null, textCapo: [...c.clean, ...c.risky].join("/"), why: "hand-audited: capo belongs to an alternative tuning/arrangement", samples: c.samples });
    continue;
  }
  if (rec.capo == null && HAND_FIX.has(src + "/" + rec.id)) {
    safe.push({ rec, file, src, fret: HAND_FIX.get(src + "/" + rec.id), relative: true, samples: ["hand-audited"] });
    continue;
  }

  if (rec.capo != null) {
    const text = [...c.clean, ...c.risky];
    if (!text.length || text.includes(rec.capo)) alreadyOk.push(`${src}/${rec.id} capo=${rec.capo}`);
    else review.push({ src, id: rec.id, recCapo: rec.capo, textCapo: text.join("/"), why: "record/text disagree", samples: c.samples });
    continue;
  }

  if (c.clean.length === 1 && !c.concert && (!c.sawNeg || c.relative)) {
    safe.push({ rec, file, src, fret: c.clean[0], relative: c.relative, samples: c.samples });
  } else if (c.clean.length === 1 && (c.concert || c.sawNeg)) {
    review.push({ src, id: rec.id, recCapo: null, textCapo: c.clean.join("/"), why: c.concert ? "chart claims concert-pitch chords" : "negation/'no capo' alternative present", samples: c.samples });
  } else if (c.clean.length === 0 && c.risky.length > 0) {
    riskyOnly++;
    review.push({ src, id: rec.id, recCapo: null, textCapo: c.risky.join("/"), why: "risky context (optional/2-guitar/unsure)", samples: c.samples });
  } else if (c.clean.length > 1) {
    review.push({ src, id: rec.id, recCapo: null, textCapo: c.clean.join("/"), why: "multiple conflicting frets", samples: c.samples });
  } else if (c.concert && c.clean.length) {
    review.push({ src, id: rec.id, recCapo: null, textCapo: c.clean.join("/"), why: "chart claims concert-pitch chords", samples: c.samples });
  }
}

// ---- cross-source pass: same song, sibling declares capo, identical written
// shapes → the null-capo sibling is playing flat. If the shapes differ by
// exactly the capo's semitones the sibling is concert-written: leave it.
const fixedIds = new Set(safe.map((s) => s.src + "/" + s.rec.id));
const groups = new Map();
for (const { rec, src } of records) {
  const key = slugBase(rec.artist) + "|" + slugBase(rec.title);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ rec, src });
}
for (const [key, members] of groups) {
  if (members.length < 2) continue;
  const declared = members.filter((m) => m.rec.capo != null || fixedIds.has(m.src + "/" + m.rec.id));
  const nulls = members.filter((m) => m.rec.capo == null && !fixedIds.has(m.src + "/" + m.rec.id));
  if (!declared.length || !nulls.length) continue;
  for (const n of nulls) {
    const veto = classify(n.rec);
    if (veto.concert || (veto.sawNeg && !veto.relative)) continue; // the record's own text disagrees
    for (const d of declared) {
      const fret = d.rec.capo ?? safe.find((s) => s.src === d.src && s.rec.id === d.rec.id)?.fret;
      if (!fret) continue;
      if (progKey(n.rec.body) !== progKey(d.rec.body)) continue; // different shapes: no evidence
      const entry = records.find((r) => r.rec === n.rec);
      cross.push({ rec: n.rec, file: entry.file, src: n.src, fret, via: `${d.src}/${d.rec.id}` });
      fixedIds.add(n.src + "/" + n.rec.id);
      break;
    }
  }
}

console.log(`songs ${records.length} · no mention ${noMention} · junk-only ${junkIgnored} · already consistent ${alreadyOk.length}`);
console.log(`SAFE fixes ${safe.length} · CROSS fixes ${cross.length} · REVIEW ${review.length}`);

for (const s of safe) console.log(`  SAFE  ${s.src}/${s.rec.id}  → capo ${s.fret}${s.relative ? " (relative-confirmed)" : ""}  "${s.samples[0] || ""}"`);
for (const s of cross) console.log(`  CROSS ${s.src}/${s.rec.id}  → capo ${s.fret}  (same shapes as ${s.via})`);

if (FIX) {
  let n = 0;
  for (const s of [...safe, ...cross]) {
    const rec = JSON.parse(fs.readFileSync(s.file, "utf8"));
    rec.capo = s.fret;
    fs.writeFileSync(s.file, JSON.stringify(rec), "utf8");
    n++;
  }
  console.log(`\napplied ${n} fixes`);
}

if (SHOW_REVIEW) {
  console.log("\n--- REVIEW (not touched) ---");
  for (const r of review) console.log(`  ${r.src}/${r.id}  rec=${r.recCapo} text=${r.textCapo}  [${r.why}]  "${r.samples[0] || ""}"`);
}
