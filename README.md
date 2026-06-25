# Keylit

**The piano that thinks in numbers.** Drop a guitar chord sheet, see it on a piano — learn the theory behind it, and write better songs.

Keylit reads a plain-text chord chart (the kind you'd paste from a tab site), figures out the chords, and shows each one on an interactive piano keyboard with the right keys glowing — root, chord tones, and slash bass colour-coded. It plays the chords on a sampled grand piano, voice-leads between them, shows Nashville numbers and Roman numerals against an auto-detected key, transposes on the fly, suggests interesting chord moves, and tells a guitarist exactly where to put the capo.

Built for a guitarist who thinks in chord shapes and Nashville numbers and is crossing over to piano + theory. The UI is **"The Bench"** — a warm analog-instrument look (not a generic dashboard), organized into three rooms around one shared keyboard:

- **Learn** — an interactive theory tutor: the major-scale W-W-H-W-W-W-H formula lit on the keys, the 7 diatonic chords built by stacking thirds, a "what's the 4th/6th/7th of any key?" drill, a live Nashville↔Roman↔Notes rail, and the circle of fifths.
- **Write** — the Chord Lab (reharmonization) + Capo advisor.
- **Play** — paste/import a chart and play it through with lit keys.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm test         # run the theory unit tests
```

Node 18+ recommended.

## Desktop app (Windows installer)

Keylit ships as a native Windows app via Electron, so Web MIDI and offline use work like a real instrument.

```bash
npm run dist:win   # builds dist/ then an NSIS installer in release/
```

Output: `release/Keylit Setup <version>.exe` (an installer with desktop + Start-menu shortcuts and a custom install path), plus `release/win-unpacked/Keylit.exe` to run without installing. The Electron shell serves the built app over a custom `app://` protocol (`electron/main.cjs`), so all assets, fonts, audio, and Web MIDI behave exactly as in Chrome.

- `npm run pack` — unpacked build only (fast, for testing).
- `npm run electron` — run the packaged `dist/` in Electron.
- For live dev in the shell: run `npm run dev`, then in another terminal `KEYLIT_DEV_URL=http://localhost:5173 npm run electron`.

The installer is **unsigned** — Windows SmartScreen will warn on first run (click *More info → Run anyway*). Add a code-signing certificate to `electron-builder` config to remove the warning.

## What works today (v0.4)

- **Three rooms, one instrument** — Learn / Write / Play share a single tube-glow keyboard (the "Bench" UI), so theory, songwriting, and playback all write to the same keys.
- **Interactive theory tutor (Learn room)** — see [Learn room](#-learn-room--the-theory-tutor) below.
- **Paste, drop, or import** a chord sheet. **Import button** (top bar) opens a paste dialog. Understands **Ultimate-Guitar** (`[ch]` tags + `Tuning:`/`Key:`/`Capo:` metadata headers, which are stripped), **ChordPro** (`[C]lyric`, `{directives}`), and plain chords-over-lyrics. Handles slash chords, 7ths, sus, add9, 6/9, 9/11/13, m7♭5, dim7 and more.
- **Accurate, key-aware spelling** — a song in F shows B♭, not A#. Sharps in sharp keys, flats in flat keys, everywhere (chords, numbers, capo shapes).
- **Smart key detection** — Krumhansl-Schmuckler profile correlation (correctly tells A minor from C major, handles flat keys).
- **Self-hosted type, deliberately chosen** — three voices, no default/system font: *Fraunces* (display) · *Space Grotesk* (UI/body) · *Berkeley Mono* (every chord, number, and readout). Fraunces + Space Grotesk are OFL and ship with the repo; **Berkeley Mono is a commercial font you supply yourself** in `public/fonts/` (it's gitignored here) — without it the app falls back to a system monospace.
- **Lit keyboard** with three view modes:
  - *Shape* — every key in the chord lights up.
  - *Voicing* — one close, playable hand position.
  - *Smooth* — voice-led from the previous chord (least hand movement). Best for seeing *why* a lush progression works.
- **Sampled grand piano** (Tone.js + Salamander) with reverb; falls back to a synth if the samples can't load.
- **Nashville numbers + Roman numerals** with automatic key detection (override available), plus a **harmonic-function badge** (Tonic / Subdominant / Dominant) on every chord.
- **Key Wheel** — a circle of fifths that lights up the song's chords, colored by function. Click a node to re-centre the key. It's a map of where the song lives.
- **Transpose** ±11 semitones; everything (names, numbers, keys, audio) follows.
- **Play-through** with a tempo slider; click any key to hear it alone.

### 🎓 Learn room — *the theory tutor*

Built for the exact gaps a gigging guitarist hits when crossing to piano + theory, each as something you *do* on the keys (with a warm, opinionated "bandmate" voice, never a textbook):

- **Scale Workshop** — pick a key; the major-scale **W–W–H–W–W–W–H** formula lights up degree-by-degree on the piano (half-steps flagged, forced sharps/flats explained: "F natural would be a whole step — the scale needs a half, so F♯"). Flip to **Chords** and it stacks thirds into the 7 diatonic chords (I ii iii IV V vi vii°) with Nashville **and** Roman **and** note names, colored by harmonic function.
- **Degree Finder** — a spaced drill for "what's the 4th / 6th / 7th of any key?", answered on a note row; the keyboard confirms by lighting tonic + target.
- **Numbers Rail** — any progression shown in **Nashville ↔ Roman ↔ real notes** at once, column-locked; change key and the numbers hold still while the notes move.
- **Circle of fifths** — the map of where keys live; click to re-centre.

The tutor's voice and its proactive "next-rung" suggestions live in `src/lib/voice.js` — authored in the repo, so the personality survives offline (no model required).

### 🧪 Chord Lab — *reharmonization*

Pick any chord and get ranked **interesting moves**, grouped into three buckets:

- **Recolor** — swap the chord for a richer cousin (maj7, 6/9, add9, sus, borrowed iv, relative-minor sub…).
- **Lead in** — add a chord that pulls into it (secondary dominant, relative ii–V, tritone sub, chromatic approach, backdoor dominant…).
- **Carry on** — add a chord that flows out of it (III7→vi soul detour, line clichés, Picardy third…).

Every suggestion has a one-line plain-English reason, a **style filter** (pop / jazz / soul / gospel / cinematic…), a **safe↔bold** slider, hover-to-audition, click-to-apply, and full undo. All of it is pure music theory that runs **offline** (`src/lib/suggest.js`).

**Deep mode** adds Claude's whole-progression, context-aware reharmonizations on top — see the AI proxy below. Every chord Claude returns is re-parsed through Keylit's own parser before it can be applied, so a hallucinated symbol is silently dropped, never played.

### 🎸 Capo & Shapes

A capo on fret *N* lets a guitarist play the song's chords with easier open shapes fingered *N* frets lower. Keylit:

- recommends the **easiest capo** for the song (e.g. B♭/E♭/F/Gm → *capo 3, finger G C D Em*), and
- shows the exact open shape to finger for each chord, with the chord it actually sounds.

When a song is all 7ths and extensions (jazz, Bacharach, *Pet Sounds*), it says so honestly instead of forcing a capo that doesn't help — and you can still dial a capo to play along at the original pitch. The shape cards update live as you step the capo.

### 🎵 Songwriting & melody

- **Make it easier** (Chord Lab toggle) — the reverse of Spice: reduce a hard chord to a friendly triad, drop a slash bass, or a two-finger power chord. For covering songs that "never made sense."
- **Melody scales** — for the selected chord, the scales/modes to solo or write over it (Mixolydian over a dominant, Dorian/Aeolian over a minor, etc.).
- **Spark** (top bar) — generate a fresh progression from a key + mood (pop / folk / jazz / soul / cinematic), optionally with 7ths. Loads straight into the workspace.

### 💾 Library & export

- **Save / Library** — songs persist to your browser (localStorage); reopen them any time.
- **Export MIDI** — a dependency-free `.mid` of the current (or revised) progression, at the playback tempo, ready to drop into any DAW and play through your own instruments/VSTs.
- **Live MIDI out** (Chrome/Edge) — pick a MIDI port (e.g. a virtual port like loopMIDI / IAC) and Keylit sends chords live to your DAW so they play through your VSTs in real time, independent of the built-in piano.

## The AI proxy (Deep mode + Analyze)

Both "Analyze with Claude" and Chord Lab **Deep mode** call a tiny proxy that holds your Anthropic key server-side. A complete reference proxy ships in this repo:

- `api/analyze.js` — a Vercel-style serverless function (also runnable anywhere Node runs).
- `server.mjs` — a local dev server wrapping the same handler.

```bash
# 1. install the server-only SDK (optionalDependency; never enters the browser bundle)
npm install @anthropic-ai/sdk

# 2. run the proxy
ANTHROPIC_API_KEY=sk-ant-... npm run proxy        # http://localhost:8787/api/analyze

# 3. point the app at it (.env)
echo "VITE_AI_PROXY_URL=http://localhost:8787/api/analyze" > .env
npm run dev
```

**Model choice.** The proxy defaults to `claude-opus-4-8` (highest quality). For this interactive "give me 5 moves" use case, **`claude-sonnet-4-6` is the sweet spot** for latency/cost with no meaningful quality loss — set it with `KEYLIT_MODEL=claude-sonnet-4-6`. Other env vars: `KEYLIT_ALLOW_ORIGIN` (CORS), `KEYLIT_PROXY_PORT`.

The proxy returns strict, schema-validated JSON. **Without it, the app degrades gracefully** — Analyze shows a friendly hint and the offline Chord Lab, Capo Advisor, Key Wheel, and everything else keep working. Audio never leaves the machine and no chart is sent anywhere unless you press an AI button.

## Project layout

```
keylit/
├── index.html
├── vite.config.js
├── package.json
├── api/
│   └── analyze.js        # serverless AI proxy (Anthropic key lives here, not in the browser)
├── server.mjs            # local dev server for the proxy
├── electron/
│   ├── main.cjs          # Electron main process — serves dist/ over app://
│   └── preload.cjs       # minimal, context-isolated preload
├── build/                # app icon (icon.ico / icon.png) for the installer
├── public/fonts/         # Fraunces + Space Grotesk (OFL, shipped); Berkeley Mono is gitignored (supply your own)
├── src/
│   ├── main.jsx
│   ├── index.css         # @font-face (Fraunces / Space Grotesk / Berkeley Mono) + reset + reduced-motion
│   ├── App.jsx           # root state + Tone.js audio engine + the three-room layout
│   ├── storage.js        # song library (localStorage; impure, kept out of lib/)
│   ├── webmidi.js        # Web MIDI OUT wrapper (impure, kept out of lib/)
│   ├── ui/
│   │   ├── theme.js      # palette + function colors + the three font stacks
│   │   ├── bench.css     # "The Bench" material layer (decks, faceplates, tube-glow, spring motion)
│   │   └── Bench.jsx     # Bench primitives (Faceplate / Deck / Readout / Vu / RoomTabs / SuggestionChips)
│   ├── components/
│   │   ├── Keyboard.jsx      # the shared lit instrument (tactile SVG)
│   │   ├── NumbersRail.jsx   # live Nashville ↔ Roman ↔ Notes translator
│   │   ├── ScaleBuilder.jsx  # scale formula + diatonic chords on the keys (Learn)
│   │   ├── DegreeFinder.jsx  # "what's the Nth of any key?" drill (Learn)
│   │   ├── ChordLab.jsx      # reharmonization suggestions + melody scales
│   │   ├── CapoAdvisor.jsx   # capo + open-shape advisor (live shape cards)
│   │   ├── KeyWheel.jsx      # circle-of-fifths map
│   │   ├── ImportModal.jsx   # paste-chords dialog
│   │   └── SongTools.jsx     # import / spark / save / library / export / MIDI-out hub
│   └── lib/                  # all PURE (no React, audio, network, DOM) + unit-tested
│       ├── theory.js     # parsing, importers, transpose, Nashville/Roman, KS key, function, capo, scale/degree helpers
│       ├── voicing.js    # voicings + voice leading + keyboard geometry
│       ├── spelling.js   # key-aware enharmonic spelling
│       ├── suggest.js    # ranked chord-move suggester + simplify
│       ├── scales.js     # chord → melody scales
│       ├── generate.js   # progression generator (Spark)
│       ├── midi.js       # dependency-free MIDI file writer + live note messages
│       ├── llm.js        # AI-proxy client + chord re-validation safety net
│       ├── voice.js      # the authored tutor voice (persona, concepts, suggestion chips)
│       └── *.test.js     # 205 tests
```

The `lib/` modules are pure and unit-tested (no React, audio, network, or DOM). Keep them that way — all music logic lives there.

## Credits

- Piano samples: [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) via the Tone.js sample host (CC-BY).
- Theory approach informed by [tonal.js](https://github.com/tonaljs/tonal).
- Example chart: Todd Rundgren, "Can We Still Be Friends" (for demonstration; not redistributed).
