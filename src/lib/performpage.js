// Immutable, race-safe page state for a continuous performance run.  A page
// key deliberately includes the source text and every setup value that can
// alter what a player sees or hears.

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const copy = (value) => {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
};

const escaped = (value) => encodeURIComponent(String(value ?? ""));
const sameSetup = (a, b) => a?.tuning === b?.tuning && a?.capo === b?.capo && a?.transpose === b?.transpose;

/** 32-bit FNV-1a over JavaScript UTF-16 code units; it is an identity hint, not crypto. */
export function sheetHash(sheet) {
  let hash = 0x811c9dc5;
  const text = String(sheet ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function performancePageKey({ entryId, sheet, tuning, capo, transpose }) {
  return [
    `entry=${escaped(entryId)}`,
    `sheet=${sheetHash(sheet)}`,
    `tuning=${escaped(tuning)}`,
    `capo=${escaped(capo ?? "none")}`,
    `transpose=${escaped(transpose)}`,
  ].join("|");
}

export function buildPerformPage({
  entry, loaded, sheet, outline, progression, anchors, activeKey, keyName, retab,
  tuning, capo, transpose,
}) {
  const page = {
    key: performancePageKey({ entryId: entry?.entryId, sheet, tuning, capo, transpose }),
    entry: copy(entry), loaded: copy(loaded), sheet: String(sheet ?? ""),
    outline: copy(outline || []), progression: copy(progression || []), anchors: copy(anchors || []),
    activeKey: copy(activeKey), keyName, retab: copy(retab),
    retabTag: retab?.tag || retab?.retabTag || null,
    tuning, capo, transpose,
  };
  return freeze(page);
}

export function createPerformRun(setlist, { tuning, capo, transpose, startEntryId = null, runId }) {
  if (typeof runId !== "string" || !runId) throw new Error("A performance run requires a runtime-minted runId");
  const entries = Array.isArray(setlist?.entries) ? setlist.entries : [];
  const requested = startEntryId == null ? 0 : entries.findIndex((entry) => entry.entryId === startEntryId);
  const start = requested >= 0 ? requested : 0;
  const setup = freeze({ tuning, capo, transpose });
  const pages = entries.slice(start).map((entry) => freeze({
    entry: freeze(copy(entry)), setup, status: "idle", requestId: null, page: null, error: null,
  }));
  return freeze({ runId, setlistId: setlist?.id || null, name: setlist?.name || "Setlist", pages });
}

function matches(run, runId, index, requestId) {
  const slot = run?.pages?.[index];
  return !!slot && run.runId === runId && slot.requestId === requestId;
}

function replaceSlot(run, index, slot) {
  const pages = run.pages.slice();
  pages[index] = freeze(slot);
  return freeze({ ...run, pages });
}

export function requestPerformPage(run, { runId, index, requestId }) {
  const slot = run?.pages?.[index];
  if (!slot || run.runId !== runId || typeof requestId !== "string" || !requestId) return run;
  return replaceSlot(run, index, { ...slot, status: "loading", requestId, page: null, error: null });
}

export function acceptPerformPage(run, { runId, index, requestId, page }) {
  if (!matches(run, runId, index, requestId) || !page) return run;
  const slot = run.pages[index];
  const pageSetup = { tuning: page.tuning, capo: page.capo, transpose: page.transpose };
  const expectedKey = performancePageKey({
    entryId: page.entry?.entryId, sheet: page.sheet, tuning: page.tuning, capo: page.capo, transpose: page.transpose,
  });
  if (slot.status !== "loading" || page.entry?.entryId !== slot.entry.entryId || !sameSetup(slot.setup, pageSetup) || page.key !== expectedKey) return run;
  return replaceSlot(run, index, { ...slot, status: "ready", page: freeze(copy(page)), error: null });
}

export function failPerformPage(run, { runId, index, requestId, message }) {
  if (!matches(run, runId, index, requestId)) return run;
  const slot = run.pages[index];
  if (slot.status !== "loading") return run;
  return replaceSlot(run, index, { ...slot, status: "error", page: null, error: String(message || "Unable to load this song") });
}

export function activePageIndex(run, visibleEntryId) {
  const index = run?.pages?.findIndex((slot) => slot.entry.entryId === visibleEntryId) ?? -1;
  return index >= 0 ? index : 0;
}
