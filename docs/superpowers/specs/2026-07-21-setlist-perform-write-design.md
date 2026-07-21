# Setlist Performance and Write Composer Design

Date: 2026-07-21

Status: approved design

Decision: focused rebuild of Setlists, continuous Perform Set, and Write's progression workflow

## Problem

Keylit already stores ordered setlists, but the current Bench Book presents them as utility rows. Opening a setlist song provides only previous/next navigation. Perform renders one song at a time, stops Roll at the bottom, and its setlist arrows call the global song loader, which exits Perform for Song.

Write has the opposite problem: many tools compete for attention, but there is no direct way to author a chord sequence. Spark chooses from fifteen fixed templates. Chord Lab operates on one selected chord and caps each local suggestion bucket. Generated and Lab-edited progressions live in App state while WriteDesk saves and reverses the original sheet, so the progression on the rail can differ from the saved sketch.

The rebuild must make setlists feel like working paper, make a whole set playable without room changes, and make an authored, section-aware progression the single source of truth in Write.

## Product decisions

- Clicking a title on a setlist opens the normal Song room.
- A separate **Perform set** action opens the entire ordered set in Perform.
- Perform Set is a continuous vertical reader of complete chord/tab charts.
- Setlists remain in Practice. The Bench Book tab is renamed **Setlists**; no twelfth top-level room is added.
- Write uses a hybrid chord picker: key-aware choices first, useful color second, unrestricted chord-symbol entry always available.
- Write drafts contain named sections such as Intro, Verse, Chorus, and Bridge.
- Contextual suggestions work offline. Deep/AI suggestions are optional additions, never the only path.
- Approach 2, the focused rebuild, is selected. This is not a full song-document rewrite.

## Goals

1. Make building and reading a setlist feel like a musician's handwritten working set, not a playlist manager.
2. Let a performer move through complete charts in order without leaving fullscreen or changing rooms.
3. Let a songwriter explicitly build, hear, reorder, and save chord sequences and song sections.
4. Provide musically defensible next, lead-in, between, turnaround, and contrasting-section ideas from the actual authored context.
5. Eliminate the split between the progression shown in Write and the progression saved or exported.
6. Preserve existing songs, sketches, setlists, practice history, and backup compatibility.
7. Keep music logic pure and test-first, with accessible and reduced-motion behavior included in the acceptance gate.

## Non-goals

- A DAW timeline, notation editor, or beat-accurate arrangement grid.
- Cloud collaboration or server-side setlist storage.
- Automatic claims that one suggestion is aesthetically correct. Keylit guarantees valid symbols, honest harmonic explanations, and deterministic ranking; taste remains the songwriter's decision.
- Replacing the normal Song room with an infinite multi-song editor.
- Rewriting the entire active-document architecture outside the state seams needed by Write.

## Setlist workspace

### Placement and hierarchy

Practice's current Bench Book tab becomes Setlists. The setlist editor occupies the full primary column. Cold Shelf and Recent Passes move below the setlist so practice history does not compete with sequencing the night.

The page uses Keylit's cream-paper material, but it is composed like a marked set sheet:

- ruled horizontal lines and a quiet left margin;
- oversized numbered entries;
- Caveat, self-hosted under its OFL license, only for set names, song titles, and margin notes;
- Martian Mono for key, capo, tuning, chord, and tab information;
- tangerine pencil marks for active/reorder state, while semantic T/S/D colors retain their existing meaning;
- no card stack, randomized jitter, fake torn-paper decoration, or text rendered as images.

The handwriting treatment is restrained and readable. It never changes line geometry after render. Focused entries drop decorative skew, and small-screen entries use the normal sans/mono voices where the handwriting face would reduce legibility.

### Entry interaction

Each ruled entry contains:

- sequence number, title, and artist;
- circled key/capo/tuning annotations;
- a short per-entry note for reminders such as count-ins, patch changes, or who starts;
- a drag handle for pointer reordering;
- keyboard-accessible move-up and move-down actions;
- Open, Run from here, Mark practiced, and Remove actions.

A blank ruled line at the bottom searches the Library and appends a song. Song-room **Add to setlist** remains the fast path. Removing an entry offers an in-session Undo. Deleting an entire setlist requires confirmation.

Each occurrence has its own stable entry ID. The same song may therefore appear more than once for a reprise or repeated practice pass.

### Storage model

The Bench Book state advances to `keylit.bench.v2`:

```js
{
  version: 2,
  setlists: [{
    id,
    name,
    notes,
    createdAt,
    entries: [{
      entryId,
      songKey,
      source,
      id,
      title,
      artist,
      key,
      capo,
      tuning,
      note
    }]
  }],
  log
}
```

The reader accepts the current `songs` array and deterministically assigns entry IDs from setlist ID plus position while retaining the stored key/capo/tuning snapshot. Migration is idempotent and non-destructive. The v1 storage key is never deleted automatically; a valid `keylit.bench.v2` record takes precedence and v1 remains a recovery copy.

The existing backup version remains unchanged. Backup parsing accepts old `songs` setlists and new `entries` setlists, normalizes both to entries, and preserves repeated entries. On a same-ID import collision, the existing local setlist wins and the import report names the skipped setlist, matching the current non-destructive merge rule.

## Perform Set

### Entry and navigation

**Perform set** starts a run at the first entry. **Run from here** starts at the selected entry. A setlist title click still calls the normal Song opener.

Song resolution and room navigation are separated. A low-level loader returns song data without changing `section`. Song uses that loader and then navigates to Song. Perform Set uses it while remaining mounted in Perform. This fixes the current behavior where stage navigation exits to Song.

### Continuous reader

Perform Set owns one scroll container containing complete `PerformSongPage` sections. Each page includes:

- song number, title, and artist;
- effective key, capo, tuning, re-fret label, and entry note;
- the full classified chord/tab chart rendered through `PerformChart`;
- an accessible boundary identifying the next song.

The first page and its successor resolve when the run starts. As the playhead approaches the final quarter of the loaded content, the following song is resolved and appended. Encountered pages remain mounted so the performer can scroll backward. No virtualization dependency is added.

Every resolved page owns immutable performance data keyed by `entryId + sheet hash + tuning + capo + transpose`. Its classified chart, progression anchors, re-fret result, and re-fret label are derived or cached under that key. A late preload or deferred re-fret result is discarded unless the key still matches its page. Multi-page Perform never reads one global re-fret result for every chart.

An IntersectionObserver anchored to the existing 35% playhead determines the active page. Crossing a boundary updates the header and current song/progression without navigating or leaving fullscreen. Manual scroll and Roll continue across dividers. Space can hold Roll anywhere, including between songs.

Perform Set opens in Roll because it is the full-chart performance path. Switching to Walk focuses the active song. At that song's final chord, Walk loads the next song at its first chord and waits for the performer's next Play action rather than starting it unexpectedly.

The final page ends with an explicit end-of-set marker and never loops. Previous/next controls remain as a fallback and scroll to the adjacent page rather than replacing the document.

### Failure behavior

If a song is missing, corrupt, or cannot be resolved, its position becomes a compact skipped-song divider with the stored title and reason. Loading continues with the next entry. A failed next-page preload does not stop the current chart, Roll, metronome, or fullscreen session.

## Write progression composer

### Information hierarchy

The composer becomes the dominant surface immediately below a compact One Song Timer. The current word pad, word ladder, Pocket Recorder, Hum-to-Harmony, exercises, saved sketches, import/MIDI tools, and DAW plumbing remain available but move into quieter expandable sections below the composer. They no longer compete as three equal cards.

### Draft model

A Write draft is the canonical authored document:

```js
{
  version: 2,
  id,
  name,
  key: { tonic, mode },
  sections: [{
    id,
    name,
    chords: [{ id, symbol }]
  }],
  lyrics,
  savedAt
}
```

Stored chord symbols are reparsed through the live theory engine. Parsed chord objects are derived runtime data and are never persisted as authority. Stable section and chord IDs keep repeated chords distinct and make reordering reliable.

The pure `composition` module owns draft creation, validation, editing operations, progression derivation, and sheet serialization. Exact authored order, including consecutive repeated chords, is preserved; it does not pass through `parseSheet`'s repeat collapse when deriving Write playback.

App holds the active Write draft. The visible sheet, progression, Numbers Rail, Chord Lab target, playback voicings, MIDI export, and saved sketch are derived from that draft for as long as it is the active document; changing rooms does not end or fork the draft. Spark, Reverse, Hum-to-Harmony, and Chord Lab apply editing operations to the same draft. The current `labProg` split is removed from the Write path.

Older sketches open through an idempotent adapter. Section headers are preserved where present; otherwise the old progression becomes one section named Section. The original sheet and lyrics remain available during migration. Portable Write-draft backup is outside this focused pass; existing v1/v2 backups continue to import unchanged.

### Section composer

The songwriter can add Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro, or a custom-named section. Each section is a horizontal sequence of chord slots with controls to:

- append or insert;
- replace;
- duplicate, including consecutive duplicates;
- delete with Undo;
- reorder by pointer or keyboard;
- audition one chord, a local move, one section, or the entire draft.

Section tabs provide fast navigation without hiding the active chord sequence. Duplicating a section produces fresh IDs and independent editable slots.

### Hybrid chord picker

Selecting an empty slot, chord, or gap opens three lanes:

1. **In key** — all seven diatonic chords, correctly spelled for the active key and labeled with Nashville/Roman degrees.
2. **Color** — ranked borrowed chords, applied dominants, suspensions/extensions, and chromatic moves that are valid in the current context.
3. **Any chord** — unrestricted text entry through `parseChord`, following the chart-spelling dialect for reading surfaces.

The Color lane is guidance, not a vocabulary limit. A valid symbol supported by Keylit can always be entered. Invalid input shows “chord not recognized” and never mutates the draft.

### Contextual intents

A selected chord or gap offers five explicit questions:

- **What comes next?** ranks continuations after the preceding context.
- **Lead into this chord** generates candidates constrained to resolve into the target.
- **Put something between these** respects both neighbors.
- **Turn this back to the top** targets the section's opening chord.
- **Contrast this section** proposes short seeds for a new section based on the current section's harmonic center and repetition.

Contrast is measured rather than asserted. A proposed seed must qualify in at least two independent groups:

- **opening** — its starting chord sound or opening harmonic function differs from the source; this group counts at most once;
- **vocabulary** — Jaccard similarity between the unique same-sounding chord sets is at most `0.5`, or the seed introduces a valid color absent from the source; this group counts at most once;
- **trajectory** — the L1 distance between the source and seed's normalized T/S/D proportion vectors is at least `0.5`.

Jaccard similarity is `intersection size / union size`; an empty union has similarity `1`. The seed cannot be the same sequence, a rotation, or a reversal. Its explanation names the qualifying groups, such as opening away from tonic and using a substantially different chord vocabulary.

## Offline suggestion engine

The pure suggestion engine builds candidates from existing theory primitives and a small number of explicit, testable move families:

- diatonic triads and sevenths;
- functional dominant and secondary-dominant resolutions;
- modal mixture appropriate to the active mode;
- passing diminished and chromatic approach chords only when their destination supports the claim;
- suspensions, extensions, relative substitutions, and common-tone moves;
- target-aware ii-V and turnaround paths.

Candidates are scored from the last two to four authored chords, any required destination, active key/mode, harmonic-function motion, cadence strength, common tones, voice-leading cost, bass motion, and repetition. Style and safe/bold preferences adjust ranking but never filter the vocabulary down to a tiny fixed set.

Every explanation is generated from evidence used by the scorer. A suggestion cannot say that it leads into, borrows from, or functions as something unless the corresponding invariant holds. Keylit may describe a chromatic chord as outside color when no stronger function is provable.

Deep mode can add whole-progression candidates. Its output is parsed, target-checked, and merged below verified offline candidates. Proxy failure, malformed output, or timeout leaves the composer unchanged and fully usable.

## Accessibility, responsiveness, and performance

- All paper text remains selectable semantic HTML.
- Handwritten display text meets the same contrast floor as the rest of Keylit.
- Reorder, add, remove, section switching, chord selection, and suggestion application are keyboard operable.
- Pointer drag always has visible button and keyboard equivalents.
- Focus order follows setlist/progression order and focus is restored after inserts or deletes.
- Reduced motion removes smooth page transitions and suggestion animation; Perform's existing stepped Roll fallback remains.
- Mobile setlist entries collapse annotations beneath the title. The composer uses a horizontally scrollable chord strip with fixed-size touch targets.
- Perform preloads only the next page and retains previously encountered pages. It does not fetch the entire corpus or install a virtualization package.
- Caveat is self-hosted; no runtime font request or new UI framework is introduced.

## Test and verification strategy

All music and storage behavior follows red-green-refactor. Pure tests land before production logic.

### Pure invariants

- v1 setlists migrate to v2 without losing order, notes, metadata, or practice history.
- Migration is idempotent, and repeated v2 entries survive backup export/import.
- Mixed `songs`/`entries` backups normalize safely, and same-ID local-wins collisions are reported.
- Draft editing preserves exact order and consecutive duplicate chords.
- Draft-to-sheet and draft-to-progression derivations preserve section boundaries and valid symbols.
- Existing flat sketches migrate without losing lyrics or the original progression.
- Every suggested symbol parses through `parseChord`.
- A lead-in or turnaround candidate reaches its declared target.
- Secondary-dominant, ii-V, modal-borrowing, passing-diminished, and harmonic-function explanations satisfy their defining interval/function rules.
- Suggestion generation is exercised across all twelve tonics in major and minor.
- Contrast seeds satisfy at least two contrast axes and reject copies, rotations, and reversals across all twelve tonics in major and minor.
- Enharmonic spelling follows the existing chart dialect on reading/playing surfaces while key labels retain conventional spelling.
- Slash chords, altered chords, empty sections, single-chord sections, repeated chords, and invalid typed symbols have explicit cases.

### Interaction tests

The pass adds `@testing-library/react` and `jsdom` as dev-only DOM test support. Coverage includes:

- create, rename, reorder, repeat, annotate, remove, undo, and reopen a setlist entry;
- click a setlist title and arrive in normal Song;
- start a set, run from a later entry, append the next chart, update the active header, and remain in Perform;
- resolve concurrent page preloads out of order without applying stale chart, anchor, or re-fret data to another entry;
- skip an unresolved chart and continue the set;
- add sections and unrestricted chords, apply each contextual intent, reorder/duplicate/delete, and undo;
- save and reopen a draft with the exact visible progression and lyrics;
- confirm Spark, Reverse, Hum-to-Harmony, Chord Lab, playback, and MIDI export consume the canonical draft.

### Release checks

- Full `npm test` and `npm run build` pass with fresh output.
- Desktop and mobile browser smokes cover manual scroll, Roll, Walk handoff, fullscreen continuity, keyboard-only operation, reduced motion, and print.
- Print shows the paper setlist rather than a blank page.
- Existing theory, voicing, piano-audit, chartline, backup, and storage suites remain green.

## Acceptance criteria

The work is complete when:

1. A musician can build and reorder a paper-like setlist, repeat a song, add entry notes, and open any title in normal Song.
2. Perform Set can move through every resolvable full chart in order without changing rooms or dropping fullscreen.
3. A missing chart does not end the run.
4. A songwriter can build multiple named sections from in-key, color, or unrestricted chord choices.
5. The five contextual intents return auditionable, explained, target-valid suggestions offline.
6. The progression displayed, played, exported, saved, and reopened in Write is identical.
7. Old setlists, sketches, and backups remain readable and are not destructively rewritten.
8. Automated invariants, interaction tests, production build, and browser smoke checks pass.

## Implementation order

1. Add pure storage/draft migrations and canonical composition operations.
2. Redirect Write's playback, saving, export, Spark, Reverse, Hum-to-Harmony, and Chord Lab through the draft.
3. Build the hybrid picker and section composer.
4. Add the sequence-aware offline suggestion engine and contextual-intent UI.
5. Upgrade Setlist storage and rebuild the paper setlist workspace.
6. Separate song loading from navigation and add continuous Perform Set.
7. Add interaction coverage, browser verification, migration proof, and final accessibility/print checks.
