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

**UI — `src/`:**
- `App.jsx` — root state + the inline Tone.js audio engine (sampler + synth fallback + reverb) + the layout. Organised into **three rooms** (Learn / Write / Play) around one shared `Keyboard`. *Still holds the audio engine — extracting it into `src/audio/` remains the open Phase-0 item.*
- `ui/theme.js` (palette + "Bench" tokens) · `ui/bench.css` (the analog-instrument material layer) · `ui/Bench.jsx` (Faceplate/Deck/Readout/Vu/RoomTabs/SuggestionChips primitives) · `index.css` (fonts + reset + reduced-motion).
- `components/` — `Keyboard` (the shared lit instrument), `NumbersRail` (live Nashville↔Roman↔Notes), `ScaleBuilder` + `DegreeFinder` (the Learn tutor), `ChordLab`, `CapoAdvisor`, `KeyWheel`, `SongTools`, `ImportModal`.

Design rule (from the user): **never a generic column of identical cards.** Keylit is "The Bench" — a warm analog instrument. T=teal, S=amber, D=coral is a *semantic* color system; keep it.

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
