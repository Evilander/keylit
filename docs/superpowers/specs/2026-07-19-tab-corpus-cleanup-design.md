# Keylit tab corpus cleanup and expansion

Date: 2026-07-19

## Goal

Make the tab experience less confusing and expand Tyler's private local library without changing Keylit's music behavior. Remove the stale `Re-fretted / As written` choice, repair the Panda Bear material, remove Avey Tare, and broadly cover the requested artists with one clean indexed chart per song.

## Hard boundary

Do not change `src/lib/**`, audio, parsing, theory, voicing, tuning, capo, retab algorithms, playback, or the runtime corpus loader. The only application behavior change is deleting the approved UI toggle and its state. Corpus work stays in the deployment-excluded `public/corpus` data. Artist shelf/exclusion sets may change only to reflect Tyler's requested catalog.

## UI change

- Delete `tabAsWritten` and its reset effect from `App.jsx`.
- Keep automatic re-fretting and the deferred-sheet safety check.
- Always show the current re-fretted chart when a valid re-fret exists.
- Remove only the two segmented buttons and their props/helper from `RetabPanel`.
- Preserve compromise reporting, copy, keep, and the Perform-room re-fret label.

This resolves the current mismatch where `As written` can remain selected after tuning/capo changes while the panel reports and saves a different chart.

## Corpus flow

Use the existing private corpus record format and manifest builder:

1. Find viable source material for each requested artist.
2. Normalize source records into the existing JSON shape and canonical artist name.
3. Require at least one chord or tab event under the existing parser; do not add placeholders.
4. Preserve source URL, tuning, capo, album, and transcriber metadata when supported by evidence.
5. Rebuild `public/corpus/manifest.json` with the existing builder, which selects one indexed record per normalized artist/title.
6. Run the existing corpus audit and reject dead target records.

The harvest is broad, but duplicate versions do not clutter the Library. Failed, blocked, incomplete, or ambiguous sources are skipped rather than guessed.

## Artist rules

- **The Junior Varsity:** include only the Illinois emo band. Require exact canonical artist identity plus matching catalog evidence. Reject the EDM act and ambiguous results. Initial verified targets include `The Sky!`, `Get Comfortable`, `Mad for Medusa`, `Park Your Car`, and `House Fire`; continue broadly where usable material exists.
- **Panda Bear:** clean all existing records of PBworks chrome, scripts, `PBinfo`, navigation, and analytics. Repair or replace the three dead charts (`comfy in nautica`, `Principe Real`, and `take pills`) and add further validated material where available.
- **Avey Tare:** remove all eight physical records, remove the core shelf entry, and add the artist to the manifest exclusion configuration so a later source refresh cannot restore it to the Library.
- **Nirvana, Pink Floyd, Ryan Adams, Whiskeytown, Jeff Buckley:** harvest broadly, prefer clean chord sheets for ingestion, and use tab/reference sources to verify tuning, capo, riffs, and voicings.

Everything remains personal-use and local-only. `public/corpus` must remain excluded from Vercel deployment.

## Acceptance criteria

- The `Re-fretted / As written` buttons and state are gone; automatic re-fretting still updates Song and Perform after repeated tuning/capo changes.
- Copy, keep, compromise reporting, and Perform labeling still work.
- No files under `src/lib/**` or `src/audio/**` change.
- Every added or modified target record parses at least one chord or tab event.
- No Panda Bear body contains PBworks page chrome, `PBinfo`, scripts, or analytics.
- Avey Tare is absent from disk, the generated manifest, and the Library's core shelf.
- No Junior Varsity EDM record appears on disk or in the manifest.
- Each corpus record's source, directory, ID, filename, tuning, and capo metadata agree.
- Manifest rebuild and dedupe complete successfully.
- Existing tab/retab tests, full Vitest suite, and production build pass.
- A browser smoke test proves the toggle is absent and automatic re-fretting remains live.

## Out of scope

- Parser improvements or new chord/tab syntax.
- Retab algorithm changes.
- Theory, voicing, tuning, capo, audio, playback, or layout refactors.
- Publishing the private corpus.
- Placeholder catalog entries or guessed transcriptions.
