# CLAUDE.md — operating guide for Claude Code

You are taking over Keylit. This file is your contract. Read it, then read `ROADMAP.md`.

## What this is

A browser app that turns a text chord sheet into an interactive, playable piano view: lit keys, voice leading, Nashville/Roman numbers, transpose, sampled-piano playback. React + Vite, no backend yet. The headline future feature is **audio in** (drop an MP3, get the chords). The full plan is in `ROADMAP.md`.

## Commands

```bash
npm install
npm run dev          # dev server
npm run build        # production build
npm test             # vitest (run once)
npm run test:watch   # vitest watch
```

## Architecture (current)

**Pure logic — `src/lib/` (no React, audio, DOM, or network):**
- `theory.js` — chord/sheet parsing, transpose, naming, Nashville + Roman numerals, key detection (Krumhansl-Kessler), harmonic function (T/S/D), diatonic chords, capo advisor, and the tutor helpers `spellScale`, `degreeOf`, `pedalRelation`.
- `voicing.js` — voicings + voice leading + keyboard geometry (MIDI 36–72). Depends only on `theory.js`.
- `spelling.js` key-aware enharmonics · `suggest.js` reharmonization · `generate.js` progression templates · `scales.js` chord→scale · `midi.js` Standard MIDI File writer · `llm.js` AI-proxy client · `voice.js` the authored tutor voice (PERSONA, CONCEPTS, `reaction`, `buildSuggestionChips`).
- v0.8 additions (2026-07-15), all pure + tested: `click.js` metronome brains · `chartlines.js` shared chart-line classifier + `progressionAnchors` (playhead↔parseSheet mapping, validated fallback) · `backup.js` merge-import · `coverize.js` style translation (iron rules test-enforced) · `tension.js` L&K-2007-simplified tension + diagnosis · `tutor.js` BYO-key provider fleet + system prompt (network-touching, llm.js precedent) · `pitch.js` YIN with boundary/subharmonic guards + tessitura (NOT range) · `mirror.js` dialect fingerprint + negative space · `eartrain.js` song-sourced drills · `retab.js` beam-search re-fretting (round-trip law: render→reparse→same pitches; LIVE off the tuning dropdown since v0.8.1 — App computes `displaySheet`, `restampCapo` keeps prose capo honest) · `session.js` lock meter + density ladder · `harmonize.js` melody→explained chord candidates. `piano-audit.test.js` is the standing 45-invariant accuracy gate — extend it whenever voicing/parsing changes.
- v0.8.1 additions (2026-07-16), pure + tested: `tabplay.js` column-spacing→beat schedules ("Hear it" in TabKeys — spacing is the only rhythm ASCII carries, said out loud) · `tabfit.js` tab-home advisor (re-frets the transcription into ten setups via retab's beam cost, ranks like a hand — `TabHomes` chips in the Song room). Also: `parseTuning` allows unison courses (EBEEBE/Sonic Youth — strict ascent was an octave-sharp bug), string-number prefixes/legends never parse as frets, ONE section-header rule (`theory.isSectionLine`) shared with chartlines.

**UI — `src/`:**
- `App.jsx` — root state + the audio engine wiring + the layout. The **"Color-Shift"** shell (design handoff 2026-07-12): a 78px top bar (wordmark · room tabs · conditional engine pill · metronome glance · Tutor pill · key readout · theme pill; wraps below 1280px so rooms never hide) and **eleven rooms** (Library / Song / **Perform** / Piano / Theory / Learn / Write / Practice / **Voice** / Chordbook / The Shed). The shared `Keyboard` lives **inside the rooms that play it** (Piano / Learn / Chordbook / Perform-walk each mount a dark `.deck` slab) — Tyler explicitly rejected the handoff's persistent footer dock (2026-07-12); don't reintroduce it. Practice tabs: Drills / Play the song / The Session / Metronome / Bench Book / The Mirror. The Perform stage and its chart are ALWAYS dark (lamplight ignores the theme). `audio/metronome.js` is a singleton that keeps ticking across rooms; `audio/memos.js` is IndexedDB voice memos.
- `lib/tab.js` (tab→note events, tuning/capo/unwrap-aware) · `lib/tuning.js` (fretboard→MIDI) · `lib/fingering.js` (five-finger-position piano fingering) · `lib/capo.js` (capo/open-tuning advisor) — all pure, all tested.
- The key picker in Song TRANSPOSES the song (pitches move, numbers stay); the mode select is a relabel lens. `spellDegreePc` keeps flat degrees spelled flat (♭3 in C = E♭, never D#) — *unless* the chord-name dialect overrides it (below).
- **Chord-name dialect** (`keylit.chart-spelling.v2`, default `"sharps"` — Tyler reads the fretboard in sharps: G#, C#7, D#): every reading/playing surface (chart, rails, Piano chips, Library POTD, ChordLab, Chordbook, Grips) follows it; KEY names, the Theory room, and the Learn tutor stay conventionally spelled. Hover/tooltips reveal the key-signature "piano says A♭" name wherever the dialects disagree. The v1 storage key auto-persisted its default, so v1 `"guitar"` is deliberately NOT migrated.
- Deploy: Vercel static + `api/analyze.js` serverless; `.vercelignore` excludes `public/corpus` (personal-use tabs must never ship publicly).
- `ui/theme.js` (live `C` palette + Color-Shift tokens) · `ui/bench.css` (the material layer: cream paper, hairlines, pill controls, the dock slab) · `ui/Bench.jsx` (Faceplate/Deck/Readout/Vu/RoomTabs/SuggestionChips primitives) · `index.css` (self-hosted fonts + reset + reduced-motion). Voices: **Gloock** (display serif — no italic face, never fake one), **Onest** (UI sans), **Martian Mono** (all chords/numbers; Berkeley Mono is the licensed fallback).
- `components/` — `Keyboard` (the shared lit instrument), `NumbersRail` (live Nashville↔Roman↔Notes), `ScaleBuilder` + `DegreeFinder` (the Learn tutor), `ChordLab`, `CapoAdvisor`, `KeyWheel`, `SongTools`, `ImportModal`, `ChordBook` (the derived chord bible: `lib/chordbook.js` catalog × `chordShapes` search, grip lights the piano), `SongGrips` (the song's unique chords as tuning/capo-aware chord boxes above the chart).

Design rules (from the user): **never a generic column of identical cards**, and **no invented marketing taglines** — the Library hero speaks in attributed songwriter quotes (`lib/quotes.js`, one per app load). The look is **"Color-Shift"**: cream paper, editorial hairlines, pill controls, one dark element (the dock). The accents are *semantic*, not decorative — root/D=tangerine `#E4602F`, tone/T=cyan `#2E9BA6`, bass/S=gold `#D9A73E`, identical in both themes; keep the families stable.

Data model — a parsed chord is:

```js
{ raw, rootName, rootSemitone, quality, intervals, bassSemitone, bassName, section }
```

Voicings are arrays of MIDI note numbers. Pitch classes are `0–11` (C=0). The keyboard spans MIDI 36–72 (C2–C5).

## Prime directives

1. **Never regress music correctness.** `theory.js` and `voicing.js` are covered by tests — extend the tests with any change. If you touch parsing, voicing, key detection, or numbering, add cases first (TDD). A wrong chord is worse than a missing feature.
2. **Keep the logic layer pure.** No React, audio, network, or DOM in `src/lib/`. Anything stateful or side-effecting goes in components, hooks, or `src/audio/`.
3. **Audio stays client-side.** When you build the audio→chord pipeline, the user's audio must never be uploaded. Decode and run inference in the browser (or via an explicitly opt-in local helper). This is a hard product promise — see ROADMAP Phase 1.
4. **Graceful degradation.** Samples may fail to load, models are heavy, the AI proxy may be absent. Every such path must fall back without breaking the core tool, exactly as the synth fallback does today.
5. **Don't over-install.** Add a dependency only when the phase that needs it lands. Keep the bundle lean; lazy-load Tone and any model code.
6. **Accessibility + reduced motion** are part of "done," not a follow-up.

## Conventions

- Functional components, hooks, no class components (except where a small engine class is clearer, e.g. the audio engine).
- Pure functions in `lib/` are named plainly (`parseChord`, `smoothUpper`); components are PascalCase files.
- Prefer small, single-purpose modules. The current `App.jsx` is intentionally the exception to fix first.
- Commit per task with a message referencing the ROADMAP item (e.g. `feat(P1-M1): decode audio + Basic Pitch MIDI overlay`).

## Where to start

Do **Phase 0** in `ROADMAP.md` before anything ambitious: decompose `App.jsx`, extract the audio engine, add Tailwind, stand up the test suite + CI. It makes every later phase safe. Then proceed in order; each phase lists acceptance criteria — treat them as the definition of done.

## Gotchas already known

- `Tone.start()` must run inside a user gesture; audio is lazily initialised on first interaction (`initAudioOnce`). Don't move it to mount.
- React StrictMode double-invokes effects and disposes the Tone instrument in dev — `main.jsx` deliberately does not use StrictMode. If you re-add it, make the audio engine resilient to dispose/recreate.
- The sampler swaps in over the synth on load; code that plays notes must tolerate the instrument changing identity at runtime.
- Parser quality lookup is case-sensitive (`m7` minor vs `M7` major7). Keep it that way.
