# The Beatles Complete (Hal Leonard, Vols 1+2) → corpus translation — 2026-07-05

Source: two EPUB songbooks (890 scanned engraving pages, 207 songs) translated
by vision into corpus chord charts under `public/corpus/beatlescomplete/`
(gitignored, personal use). Every chart validated through keylit's own parser
(`tools/ingest_beatles.mjs`): all chord tokens must parse, structure must look
like a song.

## Result

| bucket | count | notes |
|--------|-------|-------|
| charts in corpus | **183** | 66 chords-over-lyrics + 117 harmony-only (chords, keys, sections, bar counts) |
| skipped by design | 1 | Within You Without You — the engraving prints no chord symbols (Indian notation) |
| not translatable by model output | 23 | the most famous of the catalog: the output content filter blocks reproducing them even as chord-only charts; covered instead by Songsterr note-level tabs (source `songsterr`) and the physical book |

The 23 without songbook charts: All My Loving · The Ballad Of John And Yoko ·
Baby You're A Rich Man · Birthday · Blue Jay Way · Cry Baby Cry · Day Tripper ·
Fixing A Hole · Getting Better · Hello Goodbye · Help! · Helter Skelter ·
Here Comes The Sun · Honey Pie · I Am The Walrus · I'll Follow The Sun ·
I'm So Tired · Let It Be · Piggies · Sgt. Pepper's Lonely Hearts Club Band ·
She Loves You · When I'm Sixty-Four · You Can't Do That

## Notation dialect learned (now in `src/lib/theory.js`, test-pinned)

The Hal Leonard engravings use an older chord dialect the parser now speaks:
`m7-5`/`7-9` (minus = flat) · `m(+7)`/`m(#7)`/`mmaj7` (minor-major-seventh) ·
`(no3)`/`(no3rd)` (power voicing) · `(add2)` · note-name additions like
`Dm(addE)` / `F#m(addD)` (the Julia chord) · `Dmsus` (printed verbatim in
Drive My Car) · typographic accidentals (♭ ♯ ♮) normalized at ingest.

## Known limits

- Harmony-only charts carry no lyric text (copyright); bar counts and roadmap
  expansions (D.S./Coda) are the transcribing agent's best reading — per-chart
  caveats are stored in each record's `beatlesComplete.issues`.
- The ebook's own TOC typos were fixed at ingest (Dizzy Miss Lizzy, Doctor
  Robert, Savoy Truffle, She Loves You, …); one TOC page-mapping error
  (Girl / For You Blue boundary) was found and corrected against the pages.
