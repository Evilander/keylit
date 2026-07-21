import { describe, expect, it } from "vitest";
import {
  acceptPerformPage, buildPerformPage, createPerformRun, performancePageKey, requestPerformPage,
} from "./performpage.js";

const entry = { entryId: "e1", source: "user", id: "a", title: "A" };

describe("performance pages", () => {
  it("keys a page by occurrence, source sheet, and exact performance setup", () => {
    const base = { entryId: "e1", sheet: "C G", tuning: "standard", capo: 0, transpose: 0 };
    expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, entryId: "e2" }));
    expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, sheet: "C F" }));
    expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, tuning: "dropD" }));
    expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, capo: 2 }));
    expect(performancePageKey(base)).not.toBe(performancePageKey({ ...base, transpose: 1 }));
  });

  it("discards a late completion from an older request", () => {
    let run = createPerformRun({ id: "sl", name: "Set", entries: [entry] }, { tuning: "standard", capo: 0, transpose: 0, runId: "run-1" });
    run = requestPerformPage(run, { runId: "run-1", index: 0, requestId: "request-old" });
    run = requestPerformPage(run, { runId: "run-1", index: 0, requestId: "request-new" });
    const oldPage = buildPerformPage({ entry, loaded: { title: "Old" }, sheet: "C", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, tuning: "standard", capo: 0, transpose: 0 });
    const newPage = buildPerformPage({ entry, loaded: { title: "New" }, sheet: "C G", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, tuning: "standard", capo: 0, transpose: 0 });
    const stale = acceptPerformPage(run, { runId: "run-1", index: 0, requestId: "request-old", page: oldPage });
    expect(stale).toBe(run);
    const current = acceptPerformPage(run, { runId: "run-1", index: 0, requestId: "request-new", page: newPage });
    expect(current.pages[0].page.loaded.title).toBe("New");
  });

  it("starts from the selected occurrence while preserving remaining order", () => {
    const setlist = { id: "sl", name: "Set", entries: [{ ...entry, entryId: "e1" }, { ...entry, entryId: "e2" }, { ...entry, entryId: "e3" }] };
    const run = createPerformRun(setlist, { tuning: "standard", capo: 0, transpose: 0, startEntryId: "e2", runId: "run-2" });
    expect(run.pages.map((slot) => slot.entry.entryId)).toEqual(["e2", "e3"]);
  });

  it("rejects a completion from a replaced run even when its slot index matches", () => {
    const oldSet = { id: "old", name: "Old", entries: [{ ...entry, entryId: "old-entry" }] };
    const newSet = { id: "new", name: "New", entries: [{ ...entry, entryId: "new-entry" }] };
    let oldRun = createPerformRun(oldSet, { tuning: "standard", capo: 0, transpose: 0, runId: "old-run" });
    oldRun = requestPerformPage(oldRun, { runId: "old-run", index: 0, requestId: "old-request" });
    const oldPage = buildPerformPage({ entry: oldSet.entries[0], loaded: { title: "Old" }, sheet: "C", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, tuning: "standard", capo: 0, transpose: 0 });
    const replacement = createPerformRun(newSet, { tuning: "standard", capo: 0, transpose: 0, runId: "new-run" });
    expect(acceptPerformPage(replacement, { runId: "old-run", index: 0, requestId: "old-request", page: oldPage })).toBe(replacement);
  });

  it("rejects a page whose sheet/refret key no longer matches its slot setup", () => {
    const setlist = { id: "sl", name: "Set", entries: [entry] };
    let run = createPerformRun(setlist, { tuning: "standard", capo: 0, transpose: 0, runId: "run" });
    run = requestPerformPage(run, { runId: "run", index: 0, requestId: "request" });
    const wrongSetupPage = buildPerformPage({ entry, loaded: { title: "Wrong" }, sheet: "C", outline: [], progression: [], anchors: [], activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: { text: "wrong retab" }, tuning: "dropD", capo: 0, transpose: 0 });
    expect(acceptPerformPage(run, { runId: "run", index: 0, requestId: "request", page: wrongSetupPage })).toBe(run);
  });
});
