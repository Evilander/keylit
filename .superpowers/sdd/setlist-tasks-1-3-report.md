# Setlist Tasks 1–3 report

## Delivered

- Stable, immutable setlist occurrences in `src/lib/setlists.js`. Repeated songs now retain distinct `entryId`s; per-entry note, key, tuning, and capo survive moves, removal, and restore.
- Bench persistence now reads strict `keylit.bench.v2`, recovers from v1 only in memory, and writes mutations exclusively as `{ version: 2, setlists, log }` to v2. Reads do not rewrite recovery data.
- Backup parsing accepts legacy `songs` and v2 `entries`, emits v2 entries only, sheds unknown entry fields, caps entries, and deterministically resolves invalid/colliding entry IDs. Merge reports retained local setlist names for ID collisions.

## Commits

- `43aecb0` — `feat(setlists): add stable entry model`
- `a589705` — `feat(setlists): migrate the bench book to v2 entries`
- `2eb68d6` — `fix(setlists): preserve v2 entries through backup`

## Verification

- `npx vitest run src/lib/setlists.test.js src/storage.test.js src/lib/backup.test.js src/lib/bench.test.js` — 54 passed.
- `npm test` — 49 files, 946 tests passed.
- `npm run build` — production build completed.

## Residual

The successful build still reports its pre-existing unresolved Berkeley Mono font URLs and a 500 kB chunk-size warning. No setlist-specific test or build blocker remains.
