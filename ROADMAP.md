# Keylit — Roadmap

**Handoff for Claude Code.** Read `CLAUDE.md` first. The **Master Plan** below is the current marching order (2026-07-02); the numbered phases after it are the original map and still hold as reference. Each item lists concrete files and an acceptance bar — treat acceptance as the definition of done.

---

## v0.7.1 — the dock comes back inside *(shipped 2026-07-12 · 613 tests green)*

Tyler's call after living with v0.7 for an evening: the persistent bottom dock was worse than the old way. The keyboard returned to **embedded decks inside the rooms that play it** — Piano (210px, under the readout), Learn (150px, under the headline), Chordbook (170px, lit by the selected grip via its own `roleFor` again — `dockOverride` removed). The engine readout moved to the top bar. Everything else from v0.7 stands. Standing rule: no persistent footer instrument.

---

## v0.7 — "Color-Shift": the redesign lands *(shipped 2026-07-12 · 613 tests green)*

Implemented from the Claude-design handoff (`Music Education Platform.zip` → `design_handoff_color_shift_ui/`), recreated inside the real codebase per its README — tokens swapped, mechanisms kept.

- **New material**: cream paper / warm brown-black ("Daylight" / "After hours"), hairline rules, pill controls (1.5px borders, hover→ink, press→scale), ink-filled active states. Accents stay semantic and theme-stable: root/D tangerine, tone/T cyan, bass/S gold — `FUNCTION_COLOR` remapped so the hue *families* survived the palette swap.
- **New voices**: Gloock (display serif), Onest (UI), Martian Mono (every chord and number) — self-hosted variable woff2 (82KB total), Berkeley Mono kept as the licensed mono fallback.
- **New shell**: sidebar → 78px top bar (wordmark, uppercase room tabs with tangerine inset underline, key readout, theme pill) and the **persistent instrument dock**: one shared `Keyboard` (rewritten SVG→DOM so it stretches; API unchanged) in a dark footer slab with status row, morphing 76→220px in Piano. Piano/Learn/Chordbook lost their embedded decks; the Chordbook lights the dock via `dockOverride`.
- **Hero screens**: Library = songwriter-quote hero (`lib/quotes.js`, one per app load, never a tagline) + shelf/POTD `1fr/320px` grid with an ink-framed aside; Song = pill controls + tangerine `[ SECTION ]` tags + function-color-filled current chord (monospace column grid untouched — alignment is music correctness); Piano = 88px Martian Mono readout + ink-filled chips; Learn = "whole, whole, half" headline, lessons light the dock.
- Reduced-motion and focus-visible carried over; chart/tab alignment, voicings, and all 613 tests untouched.

---

## v0.6.1 — the fretboard dialect + the Chordbook *(shipped 2026-07-12 · 609 tests green)*

Tyler reads the fretboard in sharps — "Ab Db7 Eb" on the POTD card was the confusion that named the release.

- **Chord-name dialect, app-wide**: the Song room's naming preference now drives every reading surface (chart, both rails, Piano chips, Library POTD, ChordLab) with a new default, **Guitar ♯** (full sharps: G#, C#7, D#). Key names, Theory, and the Learn tutor keep conventional spelling. Storage key bumped to `chart-spelling.v2` because v1 auto-persisted its default (a stored "guitar" proved nothing). `potd.js` gained `opts.spelling`.
- **"Piano says A♭"**: wherever the dialects disagree, hover reveals the key-signature name — a line in the chord grip card, and tooltips on chart tokens, rail columns, and Piano chips. The GuitarSetup readout already told this story (Finger G# → Piano Ab); now every chord symbol can.
- **The Chordbook room** (`lib/chordbook.js` + `components/ChordBook.jsx`): the guitar chord bible with zero stored diagrams — a 28-quality catalog across 5 families; every grip derived live by `chordShapes` for the tuning in your hands, ranked campfire-first. Look up any symbol ("F#m7"), strum any grip, and the selected grip lights its EXACT notes on the piano (other octaves ghosted). Test-enforced: all 12 roots × every quality find a playable grip.
- **Grips strip** (`components/SongGrips.jsx`): the row of chord boxes a chart should open with — the song's unique chords as tuning/capo-lens-aware diagrams above the chart, click to strum, foldable.

---

## v0.6 — the Bench hires a rhythm section *(shipped 2026-07-04 · 495 tests green)*

The loop closed in v0.5 (the Bench hears the record and the player); v0.6 gives it **time**: a band to play with, and two Learn modules that train the muscle no chord chart teaches — feeling meter and holding a pedal against the grind.

- **`lib/band.js`** (pure, mirror of `arrange.js`): the bassist (`bassLine` — per-style lines up to a real walking engine: written-bass downbeats, thirds/passing tones, fifths, chromatic approaches planned against the *actual* next downbeat, last bar resolves), the drummer (`drumGroove` — GM kit numbers, one authored bar per style), `countIn`/`metronome`, `applySwing` (straight grid in, triplet feel out), and `arrangeBand` — the one entry point: piano (left hand dropped when the bass is on) + bass + drums + count-off, all swung identically, `tracks` split out export-ready. Iron rule extended to the bass and test-enforced.
- **`arrange.js`**: fifth style **After Hours** (`swing: true`) — Charleston shells + LH pedal that the band-bass replaces.
- **`audio/engine.js`**: a MonoSynth upright + synthesized kit (membrane kick, filtered-noise snare/stick/hats/shaker, metal ride/crash), `playEvents` routes by `e.ch` ("piano" | "bass" | "drums"), returns `startTime`/`secondsPerBeat` so tap drills score on the audio clock. Band build is fail-soft: piano survives if percussion construction throws.
- **`lib/midi.js`**: `eventsToMidiTracks` — format-1 SMF, conductor track (tempo + 0x58 time signature), per-part channels/programs/names; offs-before-ons preserved per track. Arranger exports Piano/Upright Bass/Drums stems; count-in never enters the file.
- **`lib/meter.js` + `components/MeterFeel.jsx`**: meter-expressing grooves (4/4, 3/4, 6/8-in-two), deterministic challenges, `scoreTaps` (nearest-unclaimed within tolerance, signed mean offset → rushing/dragging/locked) — and the drill UI: guess the meter, then tap the ONE (first bar free, spacebar works).
- **`lib/pedal.js` + `components/PedalLab.jsx`**: `pedalEvents` (full-bar drone below lifted voicings) + consonant/dissonant marks straight from `pedalRelation`; UI shows rings/grinds per bar in the T/S/D hue language, pedal lit in the reserved fourth hue. The `CONCEPTS.pedal` copy finally has its lab.
- **`lib/voice.js`**: `meterFeelLine` (honest time-calling with the millisecond number) + `meter-feel` and `find-the-one` concepts.
- **Housekeeping**: tutor contract gains `playEvents`/`now`; DegreeFinder clears the lesson light on unmount (parity with ScaleBuilder); `prefers-reduced-motion` guard on the Bench springs; GitHub Actions CI (npm ci → test → build); **zero new dependencies**.
- **Consciously deferred**: swing-amount knob (fixed 2/3) · drum fills/turnarounds · count-in + metronome inside Play-Along · brushes/intensity tiers · bass/drum levels in a mixer. Named so deferring stays a choice.

---

## The Master Plan — the next five *(chosen 2026-07-02 · **SHIPPED as v0.5.0 the same day** — execution notes at the end of this section)*

Where the project stands: 3,828-song local library + public-domain songbook + Add-a-song; written-vs-sounding capo architecture; tab→piano with fingering; evidence-chain tuning resolution; the wheel-as-instrument; 339 green tests over a pure `lib/`. What's missing is the loop: Keylit shows and tells, but it can't *hear* — not the record, and not the player. These five close that loop, in an order where each unlocks the next.

**Selection criteria:** compounds existing machinery · serves Tyler-the-learner and the public tool at once · pure testable core · the set pays the Phase-0 debt on the way.

### Step 0 (prerequisite, ~half a day) — Extract the audio engine
The old Phase-0 debt, now unavoidable: items 2 and 4 both need an engine with a real API.
- Create `src/audio/engine.js`: the Tone sampler/synth/reverb lifecycle out of `App.jsx`, exposing `init() / play(midis, dur, opts) / setInstrument(name) / setSustain(bool) / dispose()`, resilient to dispose/recreate (StrictMode-safe).
- `App.jsx` consumes it through one `useAudioEngine()` hook; `playVoiced`/WebMIDI-out unchanged in behavior.
- **Done when:** zero behavior change, all flows still play, App.jsx sheds ~120 lines.

### 1 · Keylit hears YOU — MIDI-in play-along *(the learning loop)*
A guitarist learning piano needs the instrument to listen back. Plug in any MIDI keyboard; the Practice room gains **Play the song**: the current step lights (chord voicing or tab event with fingering), Keylit waits until you hold the right notes, then advances — wrong notes flash coral, per-section accuracy is scored.
- `src/webmidi.js`: add input side (`listInputs`, `onNotes(cb)` with running held-note set).
- New pure `src/lib/playalong.js`: `matchStep(held, target, {octaveStrict})` → exact/octave-tolerant match, extra-note tolerance policy; step scoring + section rollup. Fully tested.
- Practice room UI: song picker (from Library), wait-mode walker reusing TabKeys/voicing steps, big accuracy readout per section, "loop this section."
- **Done when:** with a MIDI keyboard, a full song can be walked hands-on in wait-mode; scores persist per song (feeds item 3); no keyboard → feature hides gracefully.

### 2 · The Bench Book — setlists + practice memory
Musician-shaped organization: **setlists**, not playlists. Build tonight's bench from the Library, order it, note per-song key/capo; Keylit remembers what you practiced and how it went, and quietly resurfaces cold songs.
- New `src/storage.js` section: setlists (`{name, songRefs[], notes}`) + per-song practice log (`{songId, at, accuracy?, source: "playalong"|"ran-it"}`) — localStorage, same pattern as the user songbook.
- Pure `src/lib/bench.js`: "what's cold" ranking = staleness × (1 − last accuracy); honest sorting, no SRS cosplay. Tested.
- Library rows get "＋ setlist"; a Setlists rail in the Library room; Practice room shows "tonight" + cold-songs shelf; printable setlist view (plain CSS print styles).
- **Done when:** build/reorder/rename setlists; every play-along run logs itself; the cold shelf demonstrably reorders as logs accrue.

### 3 · The Arranger — styles, not block chords
Playback today is chord pads. Add pattern engines that turn any chart into *piano music*, with fingering annotations riding along.
- New pure `src/lib/arrange.js`: pattern generators over `voicing.js` — **Bench Ballad** (bass + shell + top), **Waltz** (6/8 arpeggio), **Boom-Chick** (Carter→stride-lite), **Broken** (Travis→arpeggiated 16ths) — each emits timed note events `{midi, t, dur, hand}` per chord span. Invariant test: every generated pitch ∈ chord tones (or declared passing set). 
- Engine (from Step 0) gains a tiny scheduler for timed events + sustain-pedal modeling; optional Rhodes/EP via `smplr`, lazy-loaded, synth fallback (prime directive 4).
- Song/Piano rooms: style picker beside Shape/Voicing/Smooth; fingering overlay reuses `fingering.js` on generated events.
- **Done when:** the demo song plays convincingly in all four styles; style survives transpose/capo; MIDI export honors the arrangement; no wrong notes possible by construction.

### 4 · Hear the record — audio → chords, fully client-side *(the moonshot, phased)*
The original headline, now with an unfair advantage: **3,828 known charts to validate against.** Audio never leaves the machine (hard promise).
- **M1 (spike, timeboxed):** `@spotify/basic-pitch` in-browser on a dropped file → note events overlaid on the wide keyboard. Go/no-go on perf.
- **M2:** onset-density spans → per-span pitch-class histograms → template match through `theory.js` → key-aware Viterbi smoothing (diatonic priors from `detectKey`). Renders as a normal *sounding* document: rail, piano, capo advisor suggesting how to PLAY it ("capo 2, G shapes").
- **M3:** confidence chips per span; tap → ranked alternates; corrections re-render live.
- **Eval harness:** `tools/eval_audio.mjs` scoring detection against N corpus charts for songs Tyler owns recordings of; target ≥80% on clean solo-instrument sources before M3 polish.
- **Done when:** drop an MP3 of a solo-guitar song → correct chart-quality progression appears and plays, offline, with visible confidence.

### 5 · Pass the chart — share links *(small, ships anytime)*
A song as a URL: `tylereveland.com/keylit#s=<lz-string>` opens a read-only "handed to you" view with the full player (fingering included). Zero backend; the fragment never hits a server.
- `src/lib/sharelink.js` (pure): encode/decode `{title, artist, body, key, capo, tuning}` via `lz-string`; version guard + size cap. Tested round-trip.
- Share button ONLY on user-songbook rows and pasted charts — corpus rows get none (the library stays private by design); received charts offer "add to your songbook."
- **Done when:** a Candle-sized chart round-trips in a ~2–4KB URL; opening one on a phone plays correctly; corpus rows show no share affordance.

**Build order & why:** Step 0 → 1 → 2 → 3 → 5 → 4. The engine unlock first; play-along is the highest value-per-line in the codebase's history; the Bench Book consumes its data immediately; the Arranger rides the new engine; share-links slot into any idle hour; audio-in runs M1 as an early spike (kick it off any time after Step 0) but its long tail comes last deliberately — everything else compounds while it bakes.

**Consciously deferred:** PWA/offline caching · photo-OCR import · Palace catalog cleanup (London band contamination) · tutor-voice proxy integration · IndexedDB migration. Named here so deferring stays a choice, not an accident.

### Execution notes — v0.5.0 (2026-07-02 · all six items landed · 401 tests green)

- **Step 0** shipped as a closure (`createEngine`) + `useAudioEngine()`; the engine also gained `playEvents`, a 40ms-tick lookahead scheduler in the beats domain — built during Step 0 so item 3 only had to plug in.
- **Item 1**: `lib/playalong.js` advances **only on an attack** (repeated chords demand a real re-strike); any wrong note taints the step's "clean" flag. PlayAlong renders its own range-hugging keyboard (TabKeys precedent) so guitar-register tab steps fit; mouse clicks simulate presses, so the public embed works with no hardware.
- **Item 2**: Bench Book search is self-contained (manifest + user rows) instead of per-row "＋ setlist" buttons in Library — same capability, no Library surgery. Print CSS hides the app and shows only the paper setlist.
- **Item 3**: pattern intervals reckon from the chord ROOT and place above the written bass (`Am/G` never grows a phantom D — regression-tested). `eventsToMidi` emits offs before ons at equal ticks so re-struck notes survive. **smplr/Rhodes skipped** (prime directive 5); the Salamander covers it.
- **Item 4 — deliberate deviation**: no `@spotify/basic-pitch`, no tfjs. The Ear is pure DSP — radix-2 FFT → tuning-tolerant chromagram → 25-state chord-template Viterbi → confidence + ranked alternates — zero model download, instant, offline. The eval bench lives IN `ear.test.js` (synthesized progressions, ≥80% gate; currently 100%). Scoring against real recordings of corpus songs still wants doing when audio files are on hand; Basic Pitch remains the upgrade path if dense mixes matter.
- **Item 5**: as planned (`lz-string` — the release's only new dependency). Share buttons appear on user/pasted/heard/handed charts; corpus rows never.
- Folded in same-day: Father John Misty 16 → 91 songs; his Heart-Shaped Box + Modern Man covers minted as FJM "Covers" records in D standard (cited), originals kept under Nirvana / Arcade Fire with their own declared tunings.

---

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
