# Private Tab Corpus Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Panda Bear, remove Avey Tare, and broadly expand the private local corpus for the Illinois Junior Varsity, Nirvana, Pink Floyd, Ryan Adams, Whiskeytown, and Jeff Buckley.

**Architecture:** Use the existing Ultimate Guitar and Songsterr harvesters to write source-specific records into gitignored `public/corpus`, then use the existing manifest builder for tuning resolution and one-record-per-song indexing. Restrict tracked changes to artist shelf/exclusion configuration; do not change any music or runtime logic.

**Tech Stack:** Node.js ES modules, PowerShell, existing Keylit corpus JSON, existing manifest/audit tools, Vitest, Vite.

## Global Constraints

- Do not modify `src/lib/**`, `src/audio/**`, parsing, theory, voicing, tuning, capo, retab algorithms, playback, or `src/corpus.js` loading/grouping functions.
- `public/corpus` remains personal-use, gitignored, and excluded by `.vercelignore`; never force-add it to Git.
- Import broadly but index one clean record per normalized artist/title through the existing dedupe rules.
- Add no placeholders, guessed transcriptions, new dependencies, or unrelated refactors.
- `The Junior Varsity` means the Illinois emo band only; never harvest a same-name EDM catalog.

---

## File structure

- Modify `src/corpus.js`: update only the `CORE_ARTISTS` data set.
- Modify `tools/build_manifest.mjs`: update only the owner exclusion constants so Avey Tare cannot reappear in the manifest.
- Modify local ignored data under `public/corpus/actabs`, `public/corpus/ultimateguitar`, `public/corpus/songsterr`, and `public/corpus/manifest.json`.
- Run, but do not modify, `tools/ug_fetch.mjs`, `tools/songsterr_harvest.mjs`, `tools/build_manifest.mjs`, and `tools/audit_parse.mjs`.

### Task 1: Pin artist visibility and remove Avey Tare

**Files:**
- Modify: `src/corpus.js:132-149`
- Modify: `tools/build_manifest.mjs:36-41`
- Delete: `public/corpus/actabs/avey-tare--*.json` (exactly eight ignored local files)
- Regenerate: `public/corpus/manifest.json` (ignored local file)

**Interfaces:**
- Consumes: `CORE_ARTISTS`, `EXCLUDE_ARTISTS`, `EXCLUDE_ID`, and the existing manifest builder.
- Produces: requested artist shelves and a manifest-level permanent exclusion for Avey Tare.

- [ ] **Step 1: Verify the baseline and exact deletion targets**

Run:

```powershell
$manifest = Get-Content -Raw -LiteralPath public\corpus\manifest.json | ConvertFrom-Json
$targets = 'Panda Bear','Avey Tare','The Junior Varsity','Nirvana','Pink Floyd','Ryan Adams','Whiskeytown','Jeff Buckley'
$targets | ForEach-Object {
  $artist = $_
  [pscustomobject]@{ Artist = $artist; Count = @($manifest | Where-Object artist -eq $artist).Count }
} | Format-Table -AutoSize
$avey = @(Get-ChildItem -File -LiteralPath public\corpus\actabs | Where-Object Name -like 'avey-tare--*.json')
if ($avey.Count -ne 8) { throw "Expected exactly 8 Avey Tare files, found $($avey.Count)" }
$avey | Select-Object -ExpandProperty FullName
```

Expected baseline: Panda Bear 15, Avey Tare 8, The Junior Varsity 0, Nirvana 1, Pink Floyd 46, Ryan Adams 0, Whiskeytown 0, Jeff Buckley 0; exactly eight deletion targets are printed inside `public/corpus/actabs`.

- [ ] **Step 2: Update only the owner exclusion constants**

In `tools/build_manifest.mjs`, make the constants exactly:

```js
const EXCLUDE_ARTISTS = new Set([
  "Duster", "Damien Jurado", "Palace", "Richard Buckner", "Bill Fay", "Avey Tare",
]);
const EXCLUDE_ID = /^(duster|damien-jurado|palace|richard-buckner|bill-fay|avey-tare)--/;
```

Do not change any manifest-building, tuning-resolution, or dedupe function.

- [ ] **Step 3: Update only the core-artist data set**

In `src/corpus.js`, remove `"Avey Tare"` and make the relevant tail of `CORE_ARTISTS` include:

```js
"Crosby, Stills, Nash & Young", "Crosby, Stills & Nash", "Pink Floyd",
"The Rolling Stones", "Koji Kondo",
"Will Oldham", "The Velvet Underground", "Lou Reed", "Sonic Youth",
"Animal Collective", "Panda Bear",
"The Junior Varsity", "Nirvana", "Ryan Adams", "Whiskeytown", "Jeff Buckley",
"Kinsella Bands",
```

Do not change `groupByArtist`, `isCoreArtist`, source labels, or loading behavior.

- [ ] **Step 4: Delete the verified eight local files without widening scope**

Run:

```powershell
$actabs = (Resolve-Path -LiteralPath public\corpus\actabs).Path
$avey = @(Get-ChildItem -File -LiteralPath $actabs | Where-Object Name -like 'avey-tare--*.json')
if ($avey.Count -ne 8) { throw "Refusing deletion: expected 8 Avey files, found $($avey.Count)" }
foreach ($file in $avey) {
  if ($file.DirectoryName -ne $actabs) { throw "Refusing out-of-scope path: $($file.FullName)" }
  Remove-Item -LiteralPath $file.FullName
}
```

Expected: exactly the eight verified Avey files are removed; no recursive deletion occurs.

- [ ] **Step 5: Rebuild and assert Avey is absent**

Run:

```powershell
node tools/build_manifest.mjs
$manifest = Get-Content -Raw -LiteralPath public\corpus\manifest.json | ConvertFrom-Json
if (@($manifest | Where-Object artist -eq 'Avey Tare').Count -ne 0) { throw 'Avey Tare remains in manifest' }
if (@(Get-ChildItem -File -LiteralPath public\corpus\actabs | Where-Object Name -like 'avey-tare--*.json').Count -ne 0) { throw 'Avey Tare remains on disk' }
```

Expected: both assertions pass.

- [ ] **Step 6: Verify the protected logic boundary and commit tracked configuration**

Run:

```powershell
git diff --name-only | Where-Object { $_ -like 'src/lib/*' -or $_ -like 'src/audio/*' } | ForEach-Object { throw "protected logic changed: $_" }
git diff --check -- src/corpus.js tools/build_manifest.mjs
git add -- src/corpus.js tools/build_manifest.mjs
git commit -m "chore(corpus): remove Avey and pin requested shelves"
```

Expected: only the two configuration files are committed. Do not use `git add -f` on `public/corpus`.

### Task 2: Clean the fifteen Panda Bear ACTabs records

**Files:**
- Modify: `public/corpus/actabs/panda-bear--*.json` (fifteen ignored local data files)
- Regenerate: `public/corpus/manifest.json`

**Interfaces:**
- Consumes: existing ACTabs JSON records and the existing parser/audit.
- Produces: clean chart bodies with no PBworks page chrome and a playable reduction for the two prose-only records.

- [ ] **Step 1: Truncate page chrome and normalize the three dead records mechanically**

Run this PowerShell block from the repository root:

```powershell
$actabs = (Resolve-Path -LiteralPath public\corpus\actabs).Path
$files = @(Get-ChildItem -File -LiteralPath $actabs | Where-Object Name -like 'panda-bear--*.json')
if ($files.Count -ne 15) { throw "Expected 15 Panda Bear files, found $($files.Count)" }

foreach ($file in $files) {
  $song = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
  $body = [string]$song.body
  $pageTools = [regex]::Match($body, '(?m)^.*Page Tools\s*$')
  if (-not $pageTools.Success) { throw "Missing safe Page Tools boundary: $($file.Name)" }
  $body = $body.Substring(0, $pageTools.Index).Trim()

  if ($song.id -eq 'panda-bear--take-pills') {
    do {
      $before = $body
      $body = [regex]::Replace(
        $body,
        '(?m)(^[ \t]*[eBGDAE](?:\||-).*)\r?\n\s*\r?\n(?=^[ \t]*[eBGDAE](?:\||-))',
        '$1' + "`n"
      )
    } while ($body -ne $before)
  }

  if ($song.id -eq 'panda-bear--comfy-in-nautica') {
    $body = "[Playable reduction from the source notes]`nA D`n`n$body"
  }
  if ($song.id -eq 'panda-bear--principe-real') {
    $body = "[Playable reduction from the source voicings]`nFmaj7/G C#m7 Dm9 C#m7 Fmaj7/G`nG9sus4`n`n$body"
  }

  $song.body = $body
  $json = $song | ConvertTo-Json -Depth 20 -Compress
  [System.IO.File]::WriteAllText($file.FullName, $json, [System.Text.UTF8Encoding]::new($false))
}
```

Expected: all fifteen files are rewritten in place; no parser or scraper code changes.

- [ ] **Step 2: Assert page chrome is gone from every Panda body**

Run:

```powershell
$files = @(Get-ChildItem -File -LiteralPath public\corpus\actabs | Where-Object Name -like 'panda-bear--*.json')
foreach ($file in $files) {
  $song = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
  if ([string]$song.body -match 'PBinfo|Page Tools|_qevents|dataLayer|quantserve|Navigator\s*$') {
    throw "PBworks chrome remains: $($file.Name)"
  }
}
```

Expected: no assertion fires.

- [ ] **Step 3: Rebuild and prove all Panda records are playable**

Run:

```powershell
node tools/build_manifest.mjs
$audit = node tools/audit_parse.mjs --dead
$deadPanda = @($audit | Select-String 'dead: .*/panda-bear--')
if ($deadPanda.Count) { throw "Dead Panda records remain:`n$($deadPanda -join "`n")" }
```

Expected: zero dead Panda Bear records. The ignored corpus data is intentionally not committed.

### Task 3: Broad Ultimate Guitar harvest with an exact Junior Varsity identity

**Files:**
- Create/update: `public/corpus/ultimateguitar/*.json` (ignored local data)

**Interfaces:**
- Consumes: `tools/ug_fetch.mjs --artist <name> [--artist-path <path>] --skip-existing-chords`.
- Produces: one best-ranked UG chord/tab record per newly discovered song.

- [ ] **Step 1: Dry-run every requested artist**

Run sequentially to avoid rate-limit pressure:

```powershell
node tools/ug_fetch.mjs --artist "The Junior Varsity" --artist-path /artist/the_junior_varsity_14749 --skip-existing-chords --dry
node tools/ug_fetch.mjs --artist "Nirvana" --skip-existing-chords --dry
node tools/ug_fetch.mjs --artist "Pink Floyd" --skip-existing-chords --dry
node tools/ug_fetch.mjs --artist "Ryan Adams" --skip-existing-chords --dry
node tools/ug_fetch.mjs --artist "Whiskeytown" --skip-existing-chords --dry
node tools/ug_fetch.mjs --artist "Jeff Buckley" --skip-existing-chords --dry
node tools/ug_fetch.mjs --artist "Panda Bear" --skip-existing-chords --dry
```

Expected: the first command reports the exact UG path `/artist/the_junior_varsity_14749`; each successful catalog reports its listed and selected counts. Abort the Junior Varsity harvest if that exact path is not echoed.

- [ ] **Step 2: Harvest the exact Illinois Junior Varsity catalog**

Run:

```powershell
node tools/ug_fetch.mjs --artist "The Junior Varsity" --artist-path /artist/the_junior_varsity_14749 --skip-existing-chords --delay 1100
```

Expected: records are written with `artist: "The Junior Varsity"`. Inspect the printed titles for the known Illinois catalog, including available matches such as `The Sky!`, `Get Comfortable`, `Mad for Medusa`, `Park Your Car`, or `House Fire`. If unrelated EDM titles appear, stop before rebuilding the manifest and remove only the files written by this command.

- [ ] **Step 3: Harvest the other six catalogs sequentially**

Run:

```powershell
node tools/ug_fetch.mjs --artist "Nirvana" --skip-existing-chords --delay 1100
node tools/ug_fetch.mjs --artist "Pink Floyd" --skip-existing-chords --delay 1100
node tools/ug_fetch.mjs --artist "Ryan Adams" --skip-existing-chords --delay 1100
node tools/ug_fetch.mjs --artist "Whiskeytown" --skip-existing-chords --delay 1100
node tools/ug_fetch.mjs --artist "Jeff Buckley" --skip-existing-chords --delay 1100
node tools/ug_fetch.mjs --artist "Panda Bear" --skip-existing-chords --delay 1100
```

Expected: each command reports written/skipped/failed counts and never writes outside `public/corpus/ultimateguitar`.

### Task 4: Songsterr coverage and tuning evidence

**Files:**
- Create/update: `public/corpus/songsterr/*.json` (ignored local data)

**Interfaces:**
- Consumes: `tools/songsterr_harvest.mjs --artist <name>`.
- Produces: absolute-tuning tab records for dedupe and source-evidence comparison.

- [ ] **Step 1: Harvest the six unambiguous Songsterr artist identities**

Do not run Songsterr for The Junior Varsity because the same-name EDM act could share the exact display name. Run:

```powershell
node tools/songsterr_harvest.mjs --artist "Nirvana"
node tools/songsterr_harvest.mjs --artist "Pink Floyd"
node tools/songsterr_harvest.mjs --artist "Ryan Adams"
node tools/songsterr_harvest.mjs --artist "Whiskeytown"
node tools/songsterr_harvest.mjs --artist "Jeff Buckley"
node tools/songsterr_harvest.mjs --artist "Panda Bear"
```

Expected: successful catalogs write only under `public/corpus/songsterr`; unavailable songs are reported and skipped without placeholders.

- [ ] **Step 2: Audit tuning evidence for the six harvested artists**

Run:

```powershell
node tools/songsterr_harvest.mjs --audit --artist "Nirvana"
node tools/songsterr_harvest.mjs --audit --artist "Pink Floyd"
node tools/songsterr_harvest.mjs --audit --artist "Ryan Adams"
node tools/songsterr_harvest.mjs --audit --artist "Whiskeytown"
node tools/songsterr_harvest.mjs --audit --artist "Jeff Buckley"
node tools/songsterr_harvest.mjs --audit --artist "Panda Bear"
```

Expected: each audit reports corpus matches and tuning mismatches. Do not alter tuning logic; the existing manifest evidence chain resolves labels and declarations on the next rebuild.

### Task 5: Rebuild, validate coverage, and run release gates

**Files:**
- Regenerate: `public/corpus/manifest.json` (ignored local data)
- Verify only: all tracked source files

**Interfaces:**
- Consumes: all cleaned/harvested records and the existing manifest/audit/test/build commands.
- Produces: a broad, deduplicated private Library with executable proof and no protected-logic changes.

- [ ] **Step 1: Rebuild the canonical manifest**

Run:

```powershell
node tools/build_manifest.mjs
```

Expected: valid JSON manifest, duplicate supersession summary, artist/song totals, and no fatal error.

- [ ] **Step 2: Assert target coverage exceeds the baseline**

Run:

```powershell
$manifest = Get-Content -Raw -LiteralPath public\corpus\manifest.json | ConvertFrom-Json
$minimums = [ordered]@{
  'The Junior Varsity' = 1
  'Nirvana' = 2
  'Pink Floyd' = 47
  'Ryan Adams' = 1
  'Whiskeytown' = 1
  'Jeff Buckley' = 1
  'Panda Bear' = 16
}
foreach ($entry in $minimums.GetEnumerator()) {
  $count = @($manifest | Where-Object artist -eq $entry.Key).Count
  if ($count -lt $entry.Value) { throw "$($entry.Key): expected at least $($entry.Value), found $count" }
  [pscustomobject]@{ Artist = $entry.Key; IndexedSongs = $count }
}
if (@($manifest | Where-Object artist -eq 'Avey Tare').Count) { throw 'Avey Tare returned to manifest' }
```

Expected: every requested artist exceeds its pre-work indexed count and Avey remains absent.

- [ ] **Step 3: Prove target records are playable and Panda is clean**

Run:

```powershell
$audit = node tools/audit_parse.mjs --dead
$targetDead = @($audit | Select-String 'dead: .*/(panda-bear|the-junior-varsity|nirvana|pink-floyd|ryan-adams|whiskeytown|jeff-buckley)--')
if ($targetDead.Count) { throw "Dead target records:`n$($targetDead -join "`n")" }

$panda = @(Get-ChildItem -File -LiteralPath public\corpus\actabs | Where-Object Name -like 'panda-bear--*.json')
foreach ($file in $panda) {
  $song = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
  if ([string]$song.body -match 'PBinfo|Page Tools|_qevents|dataLayer|quantserve|Navigator\s*$') {
    throw "PBworks chrome remains: $($file.Name)"
  }
}
```

Expected: zero dead requested records and zero PBworks chrome matches.

- [ ] **Step 4: Verify record identity and metadata structure**

Run:

```powershell
$targetArtists = @(
  'Panda Bear','The Junior Varsity','Nirvana','Pink Floyd',
  'Ryan Adams','Whiskeytown','Jeff Buckley'
)
$errors = [System.Collections.Generic.List[string]]::new()
foreach ($dir in Get-ChildItem -Directory -LiteralPath public\corpus) {
  if ($dir.Name.StartsWith('_')) { continue }
  foreach ($file in Get-ChildItem -File -LiteralPath $dir.FullName -Filter '*.json') {
    $song = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
    if ($song.artist -notin $targetArtists) { continue }
    if ($song.source -ne $dir.Name) { $errors.Add("source/dir mismatch: $($file.FullName)") }
    if ($file.BaseName -ne $song.id) { $errors.Add("id/filename mismatch: $($file.FullName)") }
    if ([string]::IsNullOrWhiteSpace([string]$song.tuning)) { $errors.Add("missing tuning: $($file.FullName)") }
    $capoText = [string]$song.capo
    if (-not [string]::IsNullOrWhiteSpace($capoText) -and $capoText -notmatch '^\d+$') { $errors.Add("invalid capo: $($file.FullName)") }
    if ($song.source -in @('actabs','ultimateguitar','songsterr') -and [string]::IsNullOrWhiteSpace([string]$song.sourceUrl)) {
      $errors.Add("missing source URL: $($file.FullName)")
    }
  }
}
if ($errors.Count) { throw ($errors -join "`n") }
```

Expected: every requested record's source matches its directory, ID matches its filename, tuning is present, capo is blank or a non-negative integer, and web-harvested records retain a provenance URL.

- [ ] **Step 5: Prove the Junior Varsity identity and Avey removal manually**

Run:

```powershell
$manifest = Get-Content -Raw -LiteralPath public\corpus\manifest.json | ConvertFrom-Json
$manifest | Where-Object artist -eq 'The Junior Varsity' | Select-Object title,source,sourceUrl | Format-Table -AutoSize
Get-ChildItem -File -Recurse -LiteralPath public\corpus | Where-Object Name -like 'avey-tare--*.json'
```

Expected: the Junior Varsity table contains only Illinois-band titles from the exact UG catalog; the Avey file search returns nothing.

- [ ] **Step 6: Run the full project gates without changing logic**

Run:

```powershell
$protected = @(git diff --name-only 42c106d..HEAD | Where-Object { $_ -like 'src/lib/*' -or $_ -like 'src/audio/*' })
if ($protected.Count) { throw "protected logic changed: $($protected -join ', ')" }
npm test
npm run build
git status --short
```

Expected: no protected files, the full Vitest suite passes, production build succeeds, and no ignored corpus file is staged or tracked.
