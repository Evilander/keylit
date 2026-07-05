// build_shed.mjs — assemble The Shed's shelf index: the practice/method/
// technique library that lives NEXT TO the song corpus (lesson books aren't
// charts; they get their own room). Curated list in this file — run after
// adding books:  node tools/build_shed.mjs
// Writes public/corpus/shed/index.json. Paths are verified; directories are
// expanded to their PDF contents. Text lessons under shed/texts/ open in-app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHED = path.join(ROOT, "public", "corpus", "shed");

// kind: method | technique | theory | reference | exercises | magazine | lesson
// `pages` names a directory under public/corpus/shed/pages/ holding the
// book's rendered page images (tools: PyMuPDF at 120dpi JPEG) — that's what
// makes a book actually READABLE in-app, tab and diagrams intact.
const SHELF = [
  { title: "Hal Leonard Guitar Method — Complete", kind: "method", instrument: "guitar",
    path: "D:\\Books\\Hal Leonard Guitar Method Complete.pdf", pages: "halleonard",
    note: "The standard three-book method in one volume — the straight staircase from open chords to reading." },
  { title: "The Country Fingerstyle Guitar Method — Levi Clay", kind: "method", instrument: "guitar",
    path: "D:\\Books\\The Country Fingerstyle Guitar Method - Levi Clay.epub",
    note: "Travis picking from the ground up — thumb independence, then the fancy stuff." },
  { title: "Country Guitar for Beginners — Levi Clay", kind: "method", instrument: "guitar",
    path: "D:\\Books\\Country Guitar for Beginners - Levi Clay.epub",
    note: "Chicken pickin', double stops, and the honest twang fundamentals." },
  { title: "Complete Technique for Modern Guitar — Joseph Alexander", kind: "technique", instrument: "guitar",
    path: "D:\\Books\\Complete Technique for Modern G - Joseph Alexander.epub",
    note: "Picking, legato, and rhythm mechanics as a daily routine." },
  { title: "Electric Guitar Technique Workout — Yiannis Papadopoulos", kind: "technique", instrument: "guitar",
    path: "D:\\Books\\The Electric Guitar Technique W - Yiannis Papadopoulos.epub",
    note: "Speed and accuracy drills for the electric player." },
  { title: "Guitar Techniques — Tapping No. 1 (Deivid Azevedo)", kind: "technique", instrument: "guitar",
    path: "D:\\Books\\Deivid Azevedo Guitar Techniques Tapping No1.pdf", pages: "tapping",
    note: "One-page tapping primer." },
  { title: "Guitar Technique Book — Chris Letchford", kind: "technique", instrument: "guitar",
    path: "B:\\Chris Letchford - Guitar Technique Book.pdf", pages: "letchford",
    note: "The Scale the Summit guitarist's 52-week routine — modern picking, tapping, and stretch drills." },
  { title: "Guitar Techniques magazine — 2010 run", kind: "magazine", instrument: "guitar",
    path: "D:\\Books\\Guitar Techniques 2010-all magazines", expand: true,
    note: "Thirteen issues of transcription-heavy lessons — a shelf of masterclasses." },
  { title: "Ultimate Guitar Workout", kind: "exercises", instrument: "guitar",
    path: "D:\\Books\\Ultimate Guitar Workshop\\Ultimate Guitar Workout.pdf", pages: "ugworkout",
    note: "The drill book of the Workshop pair.", textFile: "texts/ultimate-guitar-workbook.txt" },
  { title: "The Guitarist's Scale Book", kind: "reference", instrument: "guitar",
    path: "D:\\Books\\The Guitarist's Scale Book.pdf", pages: "scalebook",
    note: "Every scale you'll meet, fingered across the neck." },
  { title: "Guitar Chord Bible", kind: "reference", instrument: "guitar",
    path: "D:\\Books\\Guitar Chord Bible.pdf", pages: "chordbible",
    note: "The big grip catalog — when you need the fourth voicing of a 13th." },
  { title: "Fretboard Workbook", kind: "exercises", instrument: "guitar",
    path: "D:\\Books\\Fretboard workbook.pdf", pages: "fretworkbook",
    note: "Write-in drills for actually knowing the neck." },
  { title: "Music Principles for the Skeptical Guitarist, Vol. 2: The Fretboard — Bruce Emery", kind: "theory", instrument: "guitar",
    path: "D:\\Books\\Bruce Emery - Music Principles for The Skeptical Guitarist Volume Two - The Fretboard.pdf", pages: "skeptical",
    note: "Theory for players who ask why — the fretboard as the answer sheet." },
  { title: "The Complete Book of Improvisation, Composition & Funk Techniques — Harris & Fielder", kind: "theory", instrument: "both",
    path: "D:\\Books\\Howard C. Harris & William B. Fielder - The Complete Book Of Improvisation Composition And Funk Techniques.pdf", pages: "harrisfielder",
    note: "Old-school conservatory funk: lines, changes, and the discipline underneath the groove." },
  { title: "1001 Chord Progressions — J. Allen", kind: "reference", instrument: "both",
    path: "D:\\Books\\J. Allen - 1001 Chord Progressions_ An Encyclopedia of Common Chord Progressions in Modern Music.epub",
    note: "An encyclopedia of the moves — the Progression of the Day's extended family." },
  { title: "Piano Exercices — The Ultimate Collection (CD Sheet Music)", kind: "exercises", instrument: "piano",
    path: "D:\\Books\\Piano Exercices - The Ultimate Collection (CD Sheet Music)\\WORKS", expand: true,
    note: "Czerny-to-Hanon country: the whole finger-gym in one folder." },
  { title: "Improvising with Chord Tones — Jazz Guitar Method, Ch. 10", kind: "lesson", instrument: "guitar",
    path: "D:\\Books\\(Guitar Book) Jazz Guitar Method - Chapter 10 - Improvising With Chord Tones.pdf", pages: "jazzch10",
    note: "Chord-tone soloing: play the changes, not just the key.", textFile: "texts/improvising-with-chord-tones.txt" },
  { title: "Tips for Learning a New Tune", kind: "lesson", instrument: "both",
    path: "D:\\Books\\Guitar - Tips For Learning A New Tune + Practice Procedures For Memorizing Scales and Chords to Any Song.pdf", pages: "newtune",
    note: "One page of practice procedure — how to actually memorize a song.", textFile: "texts/learning-a-new-tune.txt" },
  { title: "Scales & Solo Ideas (the usenet classic)", kind: "lesson", instrument: "guitar",
    path: "D:\\Books\\scale_practice.tab",
    note: "A 1990s rec.music.makers hand-me-down that still teaches.", textFile: "texts/scale-practice.txt" },
];

const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// EPUB chapter texts (tools/extract_epub_shed.py) keyed by book id.
const EPUB_CHAPTERS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(SHED, "epub_chapters.json"), "utf8")); }
  catch { return {}; }
})();
const EPUB_IDS = {
  "the-country-fingerstyle-guitar-method-levi-clay": "country-fingerstyle",
  "country-guitar-for-beginners-levi-clay": "country-beginners",
  "complete-technique-for-modern-guitar-joseph-alexander": "complete-technique",
  "electric-guitar-technique-workout-yiannis-papadopoulos": "electric-technique",
  "1001-chord-progressions-j-allen": "1001-progressions",
};

const out = [];
for (const item of SHELF) {
  const exists = fs.existsSync(item.path);
  if (!exists) { console.log(`  ! missing on disk: ${item.title}`); }
  const entry = { id: slug(item.title), ...item, exists };
  if (item.expand && exists && fs.statSync(item.path).isDirectory()) {
    entry.contents = fs.readdirSync(item.path)
      .filter((f) => /\.pdf$/i.test(f))
      .sort()
      .map((f) => ({ name: f.replace(/\.pdf$/i, ""), path: path.join(item.path, f) }));
  }
  if (item.textFile && !fs.existsSync(path.join(SHED, item.textFile))) {
    console.log(`  ! missing text: ${item.textFile}`);
    delete entry.textFile;
  }
  if (item.pages) {
    const pdir = path.join(SHED, "pages", item.pages);
    const count = fs.existsSync(pdir) ? fs.readdirSync(pdir).filter((f) => /\.jpe?g$/i.test(f)).length : 0;
    if (count) entry.pages = { dir: item.pages, count };
    else { console.log(`  ! no rendered pages: ${item.pages}`); delete entry.pages; }
  }
  const epubKey = EPUB_IDS[entry.id];
  if (epubKey && EPUB_CHAPTERS[epubKey]?.length) entry.chapters = EPUB_CHAPTERS[epubKey];
  out.push(entry);
}
fs.mkdirSync(SHED, { recursive: true });
fs.writeFileSync(path.join(SHED, "index.json"), JSON.stringify(out, null, 1), "utf8");
console.log(`shed index: ${out.length} shelf items (${out.filter((e) => e.exists).length} present) -> public/corpus/shed/index.json`);
