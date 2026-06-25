# Keylit — Roadmap

**Handoff for Claude Code.** Read `CLAUDE.md` first. Execute phases in order. Each phase lists concrete tasks and an acceptance bar that is the definition of done. Don't skip Phase 0.

## Vision

Turn Keylit from a *chord-sheet visualizer* into a **guitar-brain-to-piano-hands instrument**: drop **text or audio**, and get an interactive, playable, exportable piano arrangement with real harmonic insight — fast, offline-capable, and private (audio never leaves the machine).

The single most valuable new capability is **audio in** (Phase 1): drop an MP3 and get the chords on the keyboard. Everything else compounds around that.

---

## Recently shipped — v0.4 "The Bench" + theory tutor

A full UI re-identity (away from a generic card stack) and the first slice of the music-theory tutor — *"the piano that thinks in numbers."*

- **The Bench look**: warm analog-instrument design (`ui/bench.css`, `ui/Bench.jsx`) — recessed decks, raised faceplates, tube-glow keys, VU-style T/S/D meters, tape-strip progression. One shared `Keyboard` instrument.
- **Three rooms** in `App.jsx`: **Learn** (tutor), **Write** (Chord Lab + Capo), **Play** (chord-sheet playback).
- **Tutor (Learn room)**: `NumbersRail` (live Nashville↔Roman↔Notes), `ScaleBuilder` (W-W-H-W-W-W-H made physical + the 7 diatonic chords), `DegreeFinder` (the "what's the 4th/6th/7th" drill). New pure helpers `spellScale`/`degreeOf`/`pedalRelation` and an authored tutor voice (`lib/voice.js`).
- Verified: 205 lib tests green; production build clean.

**Next tutor slices** (specs ready): Pedal-Point Lab, Meter Feel Trainer (4/4 vs 3/4 vs 6/8), opinion-mode Chord Lab, and wiring the authored voice into the Claude proxy. Then resume Phase 0 (extract the audio engine out of `App.jsx`) and Phase 1 (audio-in via `@spotify/basic-pitch`, client-side).

---

## Phase 0 — Foundation & hygiene  *(do this first; ~1 day)*

Make the codebase safe to be ambitious in.

- **Decompose `App.jsx`** into `src/components/` — `Keyboard`, `NowPlaying`, `Transport`, `Controls`, `ProgressionStrip`, `UniqueChords`, `SheetInput`, `AiPanel`, plus a `ui/` folder for `Segmented`, `Legend`, `IconButton`, `EnginePill`.
- **Extract the audio engine** into `src/audio/PianoEngine.js` — a small class wrapping Tone: `init()`, `play(midis, dur)`, `setMuted()`, sampler+synth fallback, reverb, and a `sustain`/pedal mode. Expose it through a `useAudioEngine()` hook.
- **Lift state** into `useProgression()` (parse + transpose + voicings + key) and keep `App` thin.
- **Adopt Tailwind v4** (`@tailwindcss/vite`) and delete the `index.css` shim; optionally pull in a few shadcn/ui primitives for selects/sliders.
- **Tests + CI**: expand `theory.test.js`, add `voicing.test.js` (voice-leading invariants: every voiced note's pitch class is in the chord; total movement between consecutive smooth voicings is ≤ root-position movement on a fixed test progression). Add GitHub Actions running `npm test` + `npm run build`.
- **Type safety**: enable `checkJs` with JSDoc, or migrate `lib/` to TypeScript.

**Acceptance:** `dev` / `build` / `test` all green; zero behaviour change vs v0.2; `lib/` coverage > 80%; no single component file over ~200 lines.

---

## Phase 1 — Audio in: drop an MP3 → chords  *(the headline)*

A fully client-side pipeline. **Audio never uploaded.**

**Pipeline**
1. **Decode** the dropped file with the Web Audio API; downmix to mono, resample to 22.05 kHz (Basic Pitch's training rate).
2. **(Quality tier) Stem separation** to isolate harmonic content before transcription. Two modes:
   - *Fast* — skip separation (works for solo guitar/piano/keys).
   - *Best* — run a browser separator (a BS-Roformer or HTDemucs model via `onnxruntime-web` + WebGPU) to drop drums/vocals, then transcribe the "other"/harmonic stem.
   - *Local* — an opt-in path that shells out to a local Demucs install (the user has the GPU); document a tiny native helper or file-watch handoff. Strictly opt-in, still no cloud upload.
3. **Audio → MIDI** with **Basic Pitch** (`@spotify/basic-pitch`, TensorFlow.js, WebGPU when available). Produces notes with onsets/offsets.
4. **Beat & downbeat tracking** to segment the timeline into chord spans (start simple: fixed-window or onset-density segmentation; upgrade to a beat-tracker later).
5. **Chord inference** from the notes in each span:
   - Build a per-span pitch-class histogram (weight by note duration/velocity).
   - Template-match against Keylit's existing chord vocabulary in `theory.js` (reuse the interval tables!).
   - Smooth the sequence with a key-aware **Viterbi/HMM** pass (diatonic transition priors from `detectKey`) so spurious one-off chords get cleaned up. This mirrors current MIR practice (language-model smoothing over frame predictions).
6. **Confidence + correction UI**: each span shows a confidence; tapping it offers ranked alternates and lets the user fix it. Corrections feed back into display and export.

**Build order**
- **M1** — decode + Basic Pitch + show the detected notes as a piano-roll overlay on the keyboard timeline.
- **M2** — segment into beat/onset spans and label each with a chord; render them as the existing progression strip.
- **M3** — add the *Best* separation tier (model load is lazy + cached).
- **M4** — confidence display + manual correction.

**Acceptance:** for a clean solo-instrument recording, ≥ 80% chord accuracy vs a known chart (write a small eval harness with 5–10 reference clips + ground-truth charts). On dense mixes, degrade gracefully with a visible "results may be rough — try Best mode" notice. Model/sample loading never blocks the UI.

**Risks & mitigations:** separation models are large and memory-hungry in WASM/WebGPU — keep *Fast* as default, lazy-load and cache weights, show progress, and provide the *Local* path for serious use.

---

## Phase 2 — Make it playable & exportable

- **MIDI export** of the current arrangement (root-position or smooth voicing) via `@tonejs/midi` or `midi-writer-js`.
- **MIDI input**: light keys from a connected MIDI keyboard (Web MIDI API); "play-along" mode that checks whether the played notes match the current chord and gives feedback.
- **Practice mode**: metronome, count-in, section loop, slow-down, and a follow-along cursor on the original sheet text synced to the progression.
- **Richer playback**: sustain-pedal modeling, velocity, and alternate instruments (Rhodes, organ, EP) via `smplr` (SplendidGrandPiano / Soundfont) or additional Tone samplers.
- **Voicing engines**: selectable *root-position / drop-2 / rootless (jazz) / shell / open*, with optional fingering hints. (tonal.js `@tonaljs/voicing` is a good reference/source.)

**Acceptance:** exported MIDI opens correctly in a DAW and matches what's shown; practice loop is sample-accurate; MIDI-in lights the right keys with < 30 ms perceived latency.

---

## Phase 3 — Smarter theory (LLM-assisted)  *(largely shipped in v0.3)*

The current "Analyze with Claude" button needs a real backend, and the analysis can go much deeper. This follows the 2025 MIR direction of using an LLM to coordinate and reason over harmonic information.

- [x] **AI proxy**: `api/analyze.js` (Vercel-style serverless) + `server.mjs` (local) hold the Anthropic key, accept `{ task, sheet | progression, key, style }`, call the Messages API with strict structured output, and return validated JSON. Wired via `VITE_AI_PROXY_URL`. Defaults to `claude-opus-4-8`; `KEYLIT_MODEL=claude-sonnet-4-6` is the recommended interactive pick.
- [x] **Functional analysis**: harmonic-function (T/S/D) badges + coloring rendered inline on the progression, Now Playing, and Key Wheel (`harmonicFunction` in `theory.js`).
- [x] **Reharmonization & substitutions**: the **Chord Lab** (`src/lib/suggest.js` + `components/ChordLab.jsx`) — secondary dominants, tritone subs, relative ii–V, modal interchange, passing dim7, line clichés, etc., with one-click apply + audition + undo. Offline-first; Deep mode adds Claude's whole-progression ideas, each re-validated through `parseChord` before it can be applied.
- [x] **Capo / key advisor**: `CapoAdvisor` + `suggestCapo`/`shapeForCapo`/`shapeEase` — easiest capo + the open shapes to finger, honest when no capo helps. Transpose (±11) already covers "change the key."
- [ ] **Remaining**: key-change/secondary-dominant *detection* rendered automatically (vs. user-driven in the Lab); LLM functional analysis surfaced inline; reharm suggestions auditioned as a full re-voiced progression.

**Acceptance:** proxy returns within ~3 s; suggestions validate against a battery of known progressions; analysis still degrades gracefully when the proxy is offline. *(Met: 53 lib tests; proxy validated; full offline fallback verified.)*

---

## Phase 4 — Library, sharing, platform

- **Persistence**: save songs to IndexedDB; project import/export; a searchable song library.
- **Sharing**: shareable links and an embeddable read-only player.
- **PWA / offline**: installable; cache the app, piano samples, and model weights so audio→chords works on a plane.
- **Importers**: ChordPro and Ultimate-Guitar paste formats; **photo OCR** of a paper chart (Tesseract.js) → text → existing pipeline.
- **Mobile-first pass**: responsive, scroll/zoom keyboard; touch targets; test on a phone.

**Acceptance:** fully usable offline after first load; ChordPro round-trips losslessly; Lighthouse PWA + a11y pass.

---

## Cross-cutting (every phase)

- Performance budget; lazy-load Tone, models, and heavy routes.
- Accessibility: keyboard navigation, ARIA on the keyboard and controls, reduced-motion (already partly honored).
- Privacy-first: no audio upload, telemetry off by default.
- Keep `src/lib/` pure and test-first.

## Dependencies to add *when the phase needs them*

| Phase | Add |
|------|-----|
| 0 | `tailwindcss`, `@tailwindcss/vite`, (optional) shadcn/ui; `@testing-library/react` |
| 1 | `@spotify/basic-pitch`, `onnxruntime-web`, `@tensorflow/tfjs` |
| 2 | `@tonejs/midi` (or `midi-writer-js`), `smplr` |
| 3 | backend only (no new front-end deps) |
| 4 | `idb`, `tesseract.js`, a PWA plugin (`vite-plugin-pwa`) |
| any | `@tonaljs/tonal` if you'd rather lean on it than the in-repo theory (keep behaviour test-pinned either way) |

## Definition of "shipped" for the next pass

A user can drop **either** a chord sheet **or** an audio file, see and hear the chords on a piano with smooth voicings, correct anything the detector got wrong, get Claude's harmonic read, export a MIDI, and reopen the song later — all offline, with their audio never leaving the machine.
