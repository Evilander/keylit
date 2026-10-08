# Keylit

**The piano that thinks in numbers.** Drop a guitar chord sheet — or a tab, or an mp3 — and see it on a piano: lit keys, voice leading, Nashville numbers and Roman numerals, a capo advisor, playback with a band, and a set of rooms for learning, practicing, performing, and writing.

Keylit is built for a guitarist who thinks in chord shapes and numbers and is crossing over to piano and theory. It reads plain-text charts (Ultimate-Guitar paste, ChordPro, chords-over-lyrics) and ASCII tablature with tuning/capo intelligence, spells everything correctly for the key, and keeps all the music logic in a pure, unit-tested library (1,051 tests at last count).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build (installable PWA) to dist/
npm test         # the full suite
npm run test:tools # offline Node tooling regressions
```

Use Node 22.13 or newer within Node 22, or Node 24+ (Node 24 is used in CI). The production build is a PWA: after its service worker finishes installing, the app, fonts, and public-domain songbook work offline. Piano samples are cached after you first play while online; the synth remains available if samples have not been cached.

Python helper fixtures run with `python -m unittest discover -s tools -p '*_test.py'` and require the existing parser dependencies listed in `tools/requirements-test.txt`. They use local fixtures, not live chart sites.

## The rooms

The top bar groups twelve-plus rooms into four wings:

**Play**
- **Library** — your shelves: a public-domain songbook, anything you add, and a song-of-the-day. Backup/restore carries songs, setlists, practice history, and preferences in one file, and imports never overwrite what's already yours.
- **Song** — the chart, chords lit on the keyboard, live transpose, tuning and capo controls. Change the guitar tuning and tablature re-frets itself the way chord sheets always transposed — with an honesty badge for anything that had to move or drop, and it never writes a chord a hand can't hold.
- **Perform** — the stage: an always-dark scrolling chart (Roll) or a chord-by-chord walk with the playhead on the exact token (Walk). Setlists run as a paged set, and each page can re-tune, re-capo, or transpose mid-set.
- **Piano** — the big readout, arranger styles (ballad, waltz, boom-chick, broken, After Hours with a walking bass and swing ride), an optional falling-note lane so your hands can pre-shape the next chord, and multi-track MIDI export.

**Study**
- **Theory** — the circle of fifths as a fixed dial with a traveling home wedge, harmonic-function colors, a tension curve over the progression, and a guided walkthrough.
- **Learn** — the theory tutor: scale workshop, degree drill, ear trainer, meter feel, pedal-point lab.
- **Chordbook** — a chord bible with zero stored diagrams: every grip derived live for the tuning in your hands, and the selected grip lights its exact notes on the piano.

**Make**
- **One Song** — the writing habit, made visible: a daily line from Jeff Tweedy's *How to Write One Song*, tally marks for days you showed up, a timer that drops you onto a blank page, six exercises for getting unstuck, and a shelf of every song you finished.
- **Write** — the desk: section-based sketching, a progression composer, word tools, hum-a-melody-into-chords, a pocket recorder, and MIDI export.
- **Practice** — drills, play-along (MIDI keyboard or mouse — Keylit waits for your hands and scores each section), the Session (a band that loops and listens without ever grading), the metronome, and the Mirror (a fingerprint of your own writing, with the moves you never make). A right rail keeps your practice history and a cold shelf of songs going stale.
- **Setlists** — tonight's bench: ordered, annotated, printable, runnable on the Perform stage.
- **Voice** — sing into a pitch trace, find your comfortable range, and get a measured verdict on what key a song wants to be in for *your* voice.

**Shed** — a file shelf for PDFs, books, and reference material.

Everywhere: number-row hotkeys switch rooms (`?` shows the map), five color themes, reduced-motion support, and a piano you can play from the computer keyboard.

## Hear a record

Drop an mp3/wav and Keylit writes the chart: FFT chromagram → chord-template matching → a confidence timeline with tap-to-correct. **Fully client-side — audio never leaves your machine.** That's a product promise, not a setting.

## The AI proxy (optional)

"Analyze with Claude" and the Chord Lab's Deep mode call a small proxy that keeps your Anthropic key server-side (`api/analyze.js`, or `node server.mjs` locally). Without it the app degrades gracefully — the offline theory engine covers everything else. The bring-your-own-key tutor sends requests directly from your browser to the selected provider (Anthropic / OpenAI / Google / xAI / local Ollama); provider keys are stored in your browser and sent only to that provider.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run proxy     # http://localhost:8787/api/analyze
echo "VITE_AI_PROXY_URL=http://localhost:8787/api/analyze" > .env
```

Env vars: `KEYLIT_MODEL` (model id), `KEYLIT_ALLOW_ORIGIN` (comma-separated CORS allowlist; defaults cover localhost dev), `KEYLIT_PROXY_PORT`. The proxy rate-limits per IP and caps request size; every chord a model returns is re-parsed by Keylit's own parser before it can be applied, so a hallucinated symbol is dropped, never played.

The tutor also offers a local subscription gateway. Configure `KEYLIT_SUBSCRIPTION_BASE_URL` with your existing loopback gateway's API base (`http://127.0.0.1:PORT/v1`), `KEYLIT_SUBSCRIPTION_API_KEY`, and optionally `KEYLIT_TUTOR_ORIGINS` before starting the proxy. That gateway credential stays server-side. This option requires a separately configured gateway; choosing it does not create one.

Origin checks and per-process rate limits are not user authentication or an account-wide spending cap. An owner-funded public proxy needs deployment-level access controls and budget limits appropriate to its audience.

## Desktop app (Windows)

```bash
npm run dist:win   # NSIS installer in release/
```

The Electron shell serves the built app over a custom `app://` protocol, so Web MIDI and offline use behave like Chrome. The installer is **unsigned** — SmartScreen will warn on first run (*More info → Run anyway*).

## Privacy

No telemetry. No accounts. Charts, sketches, setlists, practice history, and preferences live in your browser's storage; audio is decoded and analyzed locally. AI actions send the chart context and messages needed for the requested response. Piano playback downloads samples from the sample host; it does not upload your recordings or charts.

## Project layout

```
keylit/
├── api/analyze.js      # serverless AI proxy (the key lives here, not in the browser)
├── server.mjs          # local dev server for the proxy
├── electron/           # desktop shell (app:// protocol, context-isolated preload)
├── public/             # fonts, icons, public-domain songbook
└── src/
    ├── App.jsx         # root state + room layout
    ├── audio/          # Tone.js engine, metronome singleton, voice memos
    ├── components/     # the rooms and instruments (React)
    ├── ui/             # theme registry + the material layer (CSS)
    └── lib/            # ALL music logic — pure (no React/audio/DOM/network), unit-tested
```

The `lib/` rule is the project's spine: parsing, voicing, key detection, numbering, re-fretting, and every other musical decision is a pure function with tests. A wrong chord is treated as worse than a missing feature.

## Type

Three self-hosted voices: Gloock (display), Onest (UI), Martian Mono (every chord and number). Berkeley Mono is the licensed mono fallback — it's a commercial font you supply yourself in `public/fonts/` (gitignored); without it the app falls back to a system monospace.

## Credits

- Piano samples: [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) via the Tone.js sample host (CC-BY).
- The One Song and Write rooms are built around the method in Jeff Tweedy's *How to Write One Song* (Dutton, 2020) — quoted only verbatim and attributed.
- Theory approach informed by [tonal.js](https://github.com/tonaljs/tonal); tension curve after Lerdahl & Krumhansl (2007), simplified and labeled as such.
