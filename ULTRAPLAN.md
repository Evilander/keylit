# ULTRAPLAN — the corpus hunt, the honest UI reckoning, and the next passes

**Written 2026-07-22 by Fable 5 as a handoff.** The executing model will usually be Opus or
Sonnet — this document assumes you have **zero session context**. Read `CLAUDE.md` (repo root)
first, then `ROADMAP.md` for history. Everything here is scoped so you can pick up any single
section cold and ship it.

**The laws (non-negotiable, from CLAUDE.md — repeated because every one has been violated by
a careless pass at least once):**
- `src/lib/` stays pure: no React, audio, DOM, or network. TDD any change to parsing,
  voicing, key detection, or numbering — a wrong chord is worse than a missing feature.
  `piano-audit.test.js` is the standing 45-invariant gate; extend it when voicing/parsing moves.
- `public/corpus/` and the BerkeleyMono woff2 are gitignored and **never ship**. `.vercelignore`
  already excludes corpus from deploys. Keep it that way.
- Audio never leaves the machine. Never a generic column of identical cards. No invented
  taglines — heroes quote real songwriters (`lib/quotes.js`, primary-sourced only).
- No persistent footer keyboard dock (rejected 2026-07-12). KeyWheel dial stays FIXED
  (C at noon); the wedge travels — never reintroduce rotate-to-top.
- Tyler reads sharps (`chart-spelling.v2` default `"sharps"`). Reduced-motion and a11y are
  part of "done."

---

## Part 1 — The Tab Hunt

### 1a. What was harvested 2026-07-22 (this session)

Six artist families Tyler named, hunted via the two existing harvesters (`tools/ug_fetch.mjs`
with `--alts 3` so argued-about songs keep runner-up versions; `tools/songsterr_harvest.mjs`
for absolute-tuning ASCII tab). Pre-harvest baseline from `manifest.json`:

| Family | Before | UG catalog size | Notes |
|---|---|---|---|
| Silver Jews / Purple Mountains | 50 | 121 + 20 | the gap Tyler felt |
| Bill Callahan / Smog | 146 | — | already deep; alts + Songsterr fill |
| Father John Misty / J. Tillman | 88 | — | + Songsterr transcriptions |
| **Arcade Fire** | **1** | **438** | effectively absent before |
| Big Star / Chilton / Bell | 27 | — | + Songsterr |
| Big Thief / Lenker / Meek | 169 | — | alts + 40 Songsterr tabs |

Post-harvest numbers live in the session log; run the check yourself:
`node -e "const r=require('./public/corpus/manifest.json'); console.log(r.filter(x=>/arcade fire/i.test(x.artist)).length)"`

**Finishing moves for any future hunt (the checklist):**
1. Snapshot `public/corpus/manifest.json` before mass changes (the standing law).
2. `node tools/ug_fetch.mjs --artist "Name" --alts 3` (skips existing files — safe to re-run).
3. `node tools/songsterr_harvest.mjs --artist "Name"` (preferred source: absolute tunings).
4. `node tools/build_manifest.mjs` — normalizes artists/tunings, dedupes cross-source, rewrites the index.
5. Sanity: `npm test` (chartlines/tab suites touch corpus-shaped fixtures), then spot-open
   two new songs in the Library and confirm the tuning chip and grips look sane.
6. Wrong-artist pollution check: UG search matches loosely. If "Chris Bell" turned out to be
   a different Chris Bell, files are cleanly removable by id prefix
   (`public/corpus/ultimateguitar/chris-bell--*`) before rebuilding the manifest.

### 1b. THE FEATURE — Tab Hunt UI (Tyler's direct ask, 2026-07-22)

> "SUPER SIMPLE for users to go on a tab hunt. User simply types in the artist — the corpus
> tool runs and populates cleanly into keylit."

The seed already exists: `tools/ingest_server.mjs` is a localhost HTTP sink that writes songs
into the corpus. Grow it into a **Harvester daemon** and give the Library a hunt box.

**Design (dev/local only — the public deploy must never show it):**
- `tools/harvester_server.mjs` (extend ingest_server): endpoints
  `GET /health` → `{ok, corpusPath}` ·
  `POST /hunt {artist}` → kicks `ug_fetch` + `songsterr_harvest` + `build_manifest` as child
  processes, returns a job id ·
  `GET /hunt/:id` → `{stage: "ug"|"songsterr"|"manifest", written, skipped, failed, log: [last 20 lines]}`.
- Library room: when `fetch("http://localhost:7433/health")` succeeds (dev builds only —
  gate on `import.meta.env.DEV` so the probe never ships), show a **"Go on a hunt"**
  affordance beside search. Type an artist → live progress (per-stage, per-song ticks in the
  authored voice: "found 121 charts on the shelf at UG… keeping the argued versions") →
  when the manifest rebuild lands, re-fetch it and the new shelf slides into the list.
- Concurrency: one hunt at a time; the daemon queues. Reuse the drivers, don't reimplement.
- **Acceptance:** with the daemon running, typing "Songs: Ohia" in the hunt box produces a
  browsable Songs: Ohia shelf without touching a terminal; with the daemon absent the Library
  is pixel-identical to today; `npm run build` output contains zero references to port 7433.

### 1c. Deeper hunts (from the archive-scout research agent)

A research agent swept for dedicated fan archives (dylanchords/sweetadeline-class sites) for
the six families. Its findings land at the end of this file (§6) — adapters for any verified
site follow the `tools/tabsites_fetch.mjs` adapter pattern (list page → song pages → `<pre>`
bodies, declared tunings kept verbatim for the evidence chain).

---

## Part 2 — The honest UI assessment (2026-07-22, all 11 rooms, 1440×900 + 834×1194)

Grades are honest, not kind. Screenshot evidence taken this session; zero console errors
anywhere — the defects are design, not crashes.

### Systemic defects (fix these before any room polish)

1. **The top bar silently hides rooms.** Eleven tabs + four status items overflow at 1440px;
   the strip scrolls horizontally with **no affordance** — The Shed is unreachable-by-sight
   on a common desktop width (clicking it in automation scrolled Library off the left edge,
   which is how this was caught). At 834px the last tab truncates to "THE". This is the worst
   kind of nav failure: invisible. See Part 3, item 1.
2. **The chart is buried in the Song room.** Open a song and you see: transpose row, guitar
   setup panel, rails, grips — the actual music starts below the fold. A musician opens a
   song to read the song.
3. **Dead canvas.** Practice (right ~40% empty), Piano (lower half), Voice (600px of empty
   black before the mic opens). The rooms read as half-furnished at desktop sizes.
4. **Theme pill is invisible to assistive tech** — automation couldn't locate it by any
   aria-label; it's the text "DAYLIGHT" only. Add `aria-label="theme"` semantics. (A11y is
   part of "done" and the a11y failure is what made it hard to find in testing too.)
5. **The Shed opens to a bare "Opening the shed…" string** on an empty page — no skeleton,
   no hint of what the room is. Slow-loading rooms need furniture first.

### Room-by-room (best to worst)

- **Theory — A.** The fixed dial + traveling wedge, the "Stay home / Pull home / Borrow
  color / Same chords, sadder door" rail with hear-it buttons, the wheel lesson. The app's
  best argument for itself. Leave it alone.
- **Perform — A−.** The always-dark stage with function-colored tokens is genuinely
  distinct. Minor: the cream frame around the stage wastes edge; fullscreen already exists.
- **Chordbook — A−.** Derived-grips bible with the Berman quote, search, family chips,
  piano echo. Second row of grips hangs a little loose; fine.
- **Piano — B+.** Strong readout, deck, arranger row… then nothing. The lower half should
  earn its keep (see Part 3, item 4: the waterfall lane).
- **Library — B.** Handsome Gloock shelf, quote hero, tuning chips, POTD card. But every row
  repeats its source URL in muted mono (`ultimate-guitar.com` × 995 artists — debug noise a
  musician never needs at shelf level), and below the hero it *is* a uniform list — the
  album-grouping treatment (Wilco precedent) should spread.
- **Song — B−.** Everything works; the *order* is wrong (defect 2). GUITAR SETUP eats prime
  real estate for a set-once panel. Rails overflow with a hard clip at the right edge — no
  fade, no scroll hint.
- **Learn — B−.** Solid two-column workshop cards. The lit scale keys render in a violet
  that belongs to no semantic family (root tangerine / tone cyan / bass gold) — if it's the
  reserved lesson hue, it's doing double duty as "scale degree" and reads off-palette.
- **Voice — B−.** Good stations, honest privacy line, but the dead black slab dominates
  pre-interaction (defect 3).
- **Practice — C+.** The drills work and the tab structure is right; the composition is
  sparse — big empty right region, drills feel unstyled next to Theory's rail. This room
  gets used daily; it deserves the Theory treatment.
- **Write — C+.** The weakest hierarchy in the app. Three competing headline zones (timer /
  song map / words), a near-blank section grid as the empty state, a chord palette that
  reads like a spreadsheet row. The Tweedy spine is genuinely good — the room just doesn't
  *look* like the ritual it teaches.
- **The Shed — C.** Bare loading string, no skeleton (defect 5).

---

## Part 3 — The UI pass plan (ordered; each item independently shippable)

1. **Top bar: overflow is a design decision, not an accident.**
   Recommended: group the eleven rooms into four wings with the room strip as a second tier
   only when a wing has siblings — `PLAY` (Library · Song · Perform · Piano), `STUDY`
   (Theory · Learn · Chordbook), `MAKE` (Write · Practice · Voice), `SHED`. Alternative
   (smaller change): keep the flat strip, add a `⋯` overflow menu that absorbs rightmost
   tabs when width demands, plus scroll-edge fades. Either way: nothing hidden without an
   affordance, nothing truncated, keyboard-reachable. **Acceptance:** at 1280/1440/1920 and
   834 portrait, every room is discoverable and the strip never clips a label mid-word.
2. **Song room: the chart leads.** Chart top-of-fold; GUITAR SETUP collapses to a one-line
   summary chip ("Standard · no capo · Guitar♯ names") that expands on demand; rails become
   horizontally scrollable with edge fades; grips already fold. **Acceptance:** on a fresh
   1440×900 load of any Library song, the first chart line is visible without scrolling.
3. **Practice room composition.** Two-column: drill stage left, right rail = streak/history
   (the practice log already exists in storage from the Bench Book work) + a "cold songs"
   shelf + the metronome glance. Style the drill cards with the Theory room's card language.
4. **Piano room lower half: the waterfall lane** (BRAINSTORM 5.2, endorsed). An optional
   falling-note lane above the deck during Play-through/Play-along — upcoming chord tones
   descend in function colors so hands pre-shape. Respect reduced-motion (fall becomes a
   static two-chord preview strip). This also fixes the dead space.
5. **Write room hierarchy.** When the desk is empty, the One Song Timer IS the room —
   center it, one sentence of Tweedy, one button. Section chips become visual blocks (the
   word ladder and pads appear once a sketch exists). Chord palette buttons become mini
   grips (the `SongGrips` box language, small). **Acceptance:** a first-time visitor can
   tell in five seconds what this room wants from them: write one song, badly, now.
6. **The Shed + Voice furniture.** Shed: skeleton shelf + one-line room description while
   the index loads (and lazy-chunk it — see Part 4 §perf). Voice: the trace panel shows a
   ghosted demo trace + the three-station map until the mic opens.
7. **Library shelf noise.** Source URLs move from the row to the expanded artist view.
   Rows gain the album-grouping affordance where albums are known (Wilco precedent).
8. **Small honest fixes:** theme pill aria-label; Learn's violet scale-lights reconciled
   with the palette (either the reserved lesson hue everywhere lessons light keys, or
   degree-role colors — pick one story); rail overflow fades (item 2 covers Song; NumbersRail
   is also used in Learn).
9. **Music Stand Mode** (BRAINSTORM 5.1, endorsed, bigger): portrait-tablet layout that
   collapses chrome, scales the chart, docks a low-profile keyboard. Ship after 1–8; it
   inherits their fixes. The 834px screenshot shows the bones already almost work.

**Deliberately NOT endorsed from BRAINSTORM.md:** MPE/aftertouch (no hardware in the loop
yet), Karplus-Strong bass (the MonoSynth is fine until the Session's musical gaps close),
double-flat academic spelling mode (conflicts with the sharps dialect Tyler actually reads;
revisit only as a Theory-room-only lens).

---

## Part 4 — Feature optimization plan (streamline by musician workflow)

The app has ~30 features across 11 rooms; the next win is not another feature, it's making
the four workflows *flow*. Each subsection: current friction → the streamline.

### Writing
- **Friction:** the Write desk doesn't know about the song you were just studying; Coverize
  and the Mirror live rooms away from where you write; Hum-to-Harmony is in the desk but the
  Session (where a sketch becomes a groove) is in Practice.
- **Streamline:** a "take it to the desk" action on any loaded song (seeds the sketch with
  its key + progression as section one); the Mirror's negative-space suggestion surfaces as
  ONE chip on the desk ("a move you never make: try ♭VI here"); "jam this sketch" hands the
  sketch's chords to the Session with one click. Files: `WriteDesk.jsx`, `SessionRoom.jsx`,
  `App.jsx` routing state — no new lib code needed; every piece exists.

### Practicing
- **Friction:** practice memory (Bench Book log) exists but is invisible outside its tab;
  drills don't know what you're bad at; two tempo authorities exist (metronome singleton vs
  engine bpm) and rooms don't share one.
- **Streamline:** **one clock** — a single tempo/transport state in App that metronome,
  arranger, Session, and Perform's click all read (the singleton already survives room
  changes; make it the authority and have engine `playEvents` derive from it). Practice
  right-rail shows the log + cold shelf (Part 3 item 3). Drills weight toward recent misses
  (the drill results already stream through state; persist per-drill accuracy next to the
  practice log — same storage pattern).
- **Acceptance:** set 96bpm anywhere, hear 96bpm everywhere; the cold shelf reorders after
  a logged run; a missed drill degree shows up again within the next five prompts.

### Jamming
- **Friction:** the Session is the app's jam room but starting one takes navigation; the
  Perform stage and the Session don't know each other; no way to jam a setlist.
- **Streamline:** "Session this" on Song/Perform (one click, current song, current key);
  setlist → Session chains songs with the lock meter persisting; the top-bar metronome
  glance becomes a mini transport (play/stop + bpm) wherever a clock is running.

### Learning
- **Friction:** the lesson layer (TheoryGuide, WheelLesson, Learn workshops, tutor) is rich
  but has no through-line — nothing says "you've met the wheel, now meet tension."
- **Streamline:** a lightweight "next door" pointer at the end of each lesson surface
  (WheelLesson's final step already CTAs to Practice drills — extend the pattern: Theory→
  Tension, Tension→Coverize, Learn scale→Chordbook of that key). No curriculum engine, no
  progress database — just doors. It matches the product line: teaches from inside your
  taste, never one curriculum for everyone.

### Performance/efficiency (the engineering pass)
- **`App.jsx` at 1,597 lines** — the standing exception. Extract per-room components the
  mechanical way (state stays in App, rooms receive props) — target ≤600 lines, zero
  behavior change, tests green after every extraction.
- **CSS-variable theming** (BRAINSTORM 4.1, endorsed): `C` object mutation + full-tree
  re-render on theme flip becomes `data-kl-theme` + `var(--kl-*)`. Do it AFTER the App.jsx
  decomposition (smaller diff surface), verify with a paint flash test in both directions.
- **Lazy-load rooms:** the 868kB chunk warning is real; The Shed (PDF shelf) and Voice
  (pitch code) are the obvious `React.lazy` splits. Tone is already lazy. **Acceptance:**
  main chunk under 500kB; room switch under 150ms on the dev box.
- **Keyboard hotkeys:** 1–9/0/− switch rooms, `?` overlays the map (musicians mid-practice
  don't mouse). Respect inputs/textareas focus.

---

## Part 5 — Suggested sequencing (waves, each independently valuable)

| Wave | Contents | Why first |
|---|---|---|
| 1 | Part 3 items 1, 2, 8 (top bar, Song order, small fixes) | The nav bug hides a room; the Song order is daily friction |
| 2 | Tab Hunt UI (Part 1b) | Tyler's direct ask; the daemon reuses everything |
| 3 | Part 4 practicing+jamming streamlines (one clock, Session-this, right rail) | Compounds daily use |
| 4 | App.jsx decomposition → CSS-var theme → lazy chunks | Debt paid before the big visual work |
| 5 | Part 3 items 3, 4, 5, 6, 7 (room compositions, waterfall) | The polish pass on a sound base |
| 6 | Music Stand Mode + writing streamlines | The tablet story |

Commit style per repo convention: `feat(P-item): …` referencing this file, tests first for
any lib change. When a wave lands, update this file's checkboxes and the memory index.

---

## §6 — Archive-scout findings (research agent, 2026-07-22)

One verified dedicated archive across all six families; the rest bottom out at UG/Songsterr.

- **Big Star — FOUND and HARVESTED: `zenandjuice.com/music/bigstar/chords/`.** OLGA-era
  raw-`.txt` ASCII tabs (rec.music-attributed, notation legends, real six-line staffs).
  Adapter added to `tools/tabsites_fetch.mjs` (`--site zenandjuice`) with a 16-title
  allowlist so the site's Velvet Crush bonus section and other power-pop dirs can't leak in.
  All 16 written 2026-07-22, album-tagged (#1 Record / Radio City / Third). The same site
  hosts Teenage Fanclub, Matthew Sweet, Lemonheads, Jellyfish dirs — future hunts can widen
  the allowlist per artist if Tyler wants the power-pop shelf.
- **Silver Jews/Berman — no archive online.** The best lead is offline: Berman printed
  **"Silver Chords" — chord progressions for every song — in the *Lookout Mountain, Lookout
  Sea* liner notes.** If Tyler owns the album, transcribing that insert is first-party
  Berman ground truth no website has. Otherwise UG is the ceiling (harvested).
- **Callahan/Smog — none.** One unverifiable maybe (`turnknobtoagitate.net/bill-callahan`,
  TLS-broken, likely reviews not tabs); worth one manual curl, expect nothing.
- **FJM, Big Thief — none dedicated** (multi-artist marketplaces and a lyrics-only fan site).
- **Arcade Fire — dead lead:** `arcadefiretube.com` existed (NME-referenced fansite), domain
  now squatted. web.archive.org was fetch-blocked for the agent; a manual Wayback check via
  curl could confirm whether it ever hosted tabs. Low odds; the 200+ UG charts harvested
  today are the real coverage.
