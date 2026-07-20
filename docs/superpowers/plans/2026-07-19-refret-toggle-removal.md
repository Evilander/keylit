# Refret Toggle Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the stale `Re-fretted / As written` UI choice while keeping automatic re-fretting and every existing honesty/save surface.

**Architecture:** `App.jsx` continues computing one deferred, automatically re-fretted `displaySheet`; the optional user override state disappears. `RetabPanel` becomes a status/action strip without a segmented toggle. No pure music or audio module changes.

**Tech Stack:** React 18, Vite 6, Vitest 2, existing inline Color-Shift UI styles.

## Global Constraints

- Do not modify `src/lib/**`, `src/audio/**`, parsing, theory, voicing, tuning, capo, retab algorithms, playback, or the runtime corpus loader.
- Preserve automatic re-fretting, deferred stale-sheet protection, compromise reporting, copy, keep, and Perform-room labeling.
- Add no dependencies and perform no unrelated refactor.

---

## File structure

- Modify `src/App.jsx`: remove the override state/effect and make the already-computed re-fret the sole display path.
- Modify `src/components/RetabPanel.jsx`: remove toggle props, helper styling, and buttons; preserve status/actions.
- No test files are created because this repository has no React component-test harness; verification uses the existing pure retab/tab suites plus a browser smoke.

### Task 1: Remove the stale display override

**Files:**
- Modify: `src/App.jsx:312-336`
- Modify: `src/App.jsx:949-959`
- Modify: `src/components/RetabPanel.jsx:1-70`
- Test: `src/lib/retab.test.js`
- Test: `src/lib/tab.test.js`
- Test: `src/lib/usersong.test.js`

**Interfaces:**
- Consumes: existing `retab`, `retabSheet`, `sheet`, `RetabPanel`, and `Perform` props.
- Produces: `displaySheet: string` and `retabTag: string | null` with no user override state.

- [ ] **Step 1: Record the behavior baseline**

Run:

```powershell
rg -n "tabAsWritten|Re-fretted|As written|onToggle" src/App.jsx src/components/RetabPanel.jsx
npx vitest run src/lib/retab.test.js src/lib/tab.test.js src/lib/usersong.test.js
```

Expected: the search lists the current state/buttons; all targeted tests pass.

- [ ] **Step 2: Remove the state and make re-fretting unconditional when current**

In `src/App.jsx`, delete:

```js
const [tabAsWritten, setTabAsWritten] = useState(false);
useEffect(() => { setTabAsWritten(false); }, [sheet]);
```

Replace the existing `displaySheet` and `retabTag` expressions with:

```js
// While the deferred value lags a fresh edit, show the live sheet — never a
// re-fret of TEXT the user has already changed.
const displaySheet = retab && retabSheet === sheet ? retab.text : sheet;
const retabTag = retab && retabSheet === sheet
  ? `re-fretted for ${retab.dst.name}${retab.dstCapo ? ` capo ${retab.dstCapo}` : ""}`
  : null;
```

Update the surrounding comment so it says the chart follows the tuning/capo controls automatically and does not mention an as-written toggle.

- [ ] **Step 3: Remove the toggle props at the call site**

Replace the `RetabPanel` opening in `src/App.jsx` with:

```jsx
<RetabPanel retab={retab} loaded={loaded}
```

Delete the `asWritten={tabAsWritten}` and `onToggle={() => setTabAsWritten((v) => !v)}` props. Preserve the existing `onKeep` callback unchanged.

- [ ] **Step 4: Remove only the segmented controls from `RetabPanel`**

Change the signature to:

```js
export default function RetabPanel({ retab, onKeep, loaded }) {
```

Delete the `seg` helper and the entire wrapper containing the `Re-fretted` and `As written` buttons. Keep the eyebrow, source/target text, summary, copy, and keep controls. Update the file comment to describe an automatic re-fret status strip, not a reversible UI switch.

- [ ] **Step 5: Verify the removed surface and protected logic boundary**

Run:

```powershell
$hits = rg -n "tabAsWritten|Re-fretted|As written|onToggle" src/App.jsx src/components/RetabPanel.jsx
if ($LASTEXITCODE -eq 0) { throw "stale toggle references remain:`n$hits" }
git diff --name-only | Where-Object { $_ -like 'src/lib/*' -or $_ -like 'src/audio/*' } | ForEach-Object { throw "protected logic changed: $_" }
npx vitest run src/lib/retab.test.js src/lib/tab.test.js src/lib/usersong.test.js
npm run build
```

Expected: no stale-toggle hits, no protected files, targeted tests pass, and production build succeeds.

- [ ] **Step 6: Commit the UI change**

```powershell
git add -- src/App.jsx src/components/RetabPanel.jsx
git commit -m "fix(tab): remove stale as-written toggle"
```

### Task 2: Browser proof

**Files:**
- Verify only: `src/App.jsx`
- Verify only: `src/components/RetabPanel.jsx`

**Interfaces:**
- Consumes: the running Vite application and a corpus tab with a source tuning/capo different from the selected guitar setup.
- Produces: visual proof that the UI is simpler and automatic re-fretting remains live.

- [ ] **Step 1: Start the development server**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Vite serves Keylit on a local URL without startup errors.

- [ ] **Step 2: Exercise repeated tuning/capo changes**

In the browser:

1. Open a corpus song containing ASCII tab.
2. Confirm neither `Re-fretted` nor `As written` appears.
3. Change the guitar tuning and confirm the displayed fret numbers change.
4. Change capo, then change tuning again; confirm the chart updates on every change.
5. Open Perform and confirm its re-fret label matches the current target setup.
6. Return to Song and confirm compromise reporting plus copy/keep controls remain present.

Expected: the old toggle never appears, and no stale chart survives a tuning/capo change.

- [ ] **Step 3: Stop the exact Vite process tree**

Stop only the process started in Step 1, including its child process, and verify the local port is free. Do not kill unrelated Node processes.
