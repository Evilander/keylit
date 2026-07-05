// audit_parse.mjs — corpus-wide playability audit. Every chart in the
// library must light the piano somehow: chords through parseSheet, tab
// through parseTab (with the record's tuning) → MIDI. This walks all of
// public/corpus and reports, per source, anything that would open as a
// dead page. Run from repo root:  node tools/audit_parse.mjs [--dead]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSheet } from "../src/lib/theory.js";
import { parseTab, tabEventsToMidi, hasTab } from "../src/lib/tab.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");
const SHOW_DEAD = process.argv.includes("--dead");

const perSource = new Map();
const dead = [];
let total = 0;

for (const src of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, src);
  if (src.startsWith("_") || src === "shed" || !fs.statSync(dir).isDirectory()) continue;
  const stat = { songs: 0, chordOnly: 0, tabbed: 0, tabNotes: 0, chords: 0, dead: 0, tabTuningMiss: 0 };
  perSource.set(src, stat);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let s;
    try { s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (!s.body) continue;
    total++;
    stat.songs++;

    const sheet = parseSheet(s.body);
    const nChords = sheet.progression?.length || 0;
    stat.chords += nChords;

    let nTabNotes = 0;
    if (hasTab(s.body)) {
      const parsed = parseTab(s.body, { tuning: s.tuning || "standard", capo: s.capo || 0 });
      nTabNotes = tabEventsToMidi(parsed).reduce((n, a) => n + a.length, 0);
      if (nTabNotes > 0) {
        stat.tabbed++;
        stat.tabNotes += nTabNotes;
        // a tab whose record tuning disagrees with its own string labels
        // would sound wrong on the piano — count label/record mismatches
        const labeled = parsed.blocks.find((b) => b.tuningFromLabels);
        if (labeled && s.tuning && labeled.tuning.id !== s.tuning && s.tuningSource === "labels") stat.tabTuningMiss++;
      }
    }
    if (nChords > 0 && nTabNotes === 0) stat.chordOnly++;
    if (nChords === 0 && nTabNotes === 0) {
      stat.dead++;
      dead.push(`${src}/${s.id}`);
    }
  }
}

console.log("source          songs  chords-only  tab-playable  dead  tab-tuning-miss  avg-chords");
for (const [src, s] of [...perSource.entries()].sort((a, b) => b[1].songs - a[1].songs)) {
  if (!s.songs) continue;
  console.log(
    src.padEnd(15), String(s.songs).padStart(5), String(s.chordOnly).padStart(12),
    String(s.tabbed).padStart(13), String(s.dead).padStart(5),
    String(s.tabTuningMiss).padStart(16),
    String(Math.round(s.chords / s.songs)).padStart(11),
  );
}
console.log(`\ntotal ${total} · dead ${dead.length} (${(dead.length / total * 100).toFixed(1)}%)`);
if (SHOW_DEAD) dead.forEach((d) => console.log("  dead:", d));
