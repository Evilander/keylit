// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import Perform from "./Perform.jsx";
import { parseChord } from "../lib/theory.js";

const entry = (entryId, title) => ({ entryId, songKey: `user:${entryId}`, source: "user", id: entryId, title, artist: "Tyler", note: "" });
const setup = { tuning: "standard", capo: 0, transpose: 0 };
const readySlot = (entryId, title, symbols = ["C", "G"]) => ({
  entry: entry(entryId, title), setup, status: "ready", requestId: `request-${entryId}`, error: null,
  page: {
    key: `page-${entryId}`, entry: entry(entryId, title), loaded: { title, artist: "Tyler" },
    sheet: symbols.join(" "), outline: [], progression: symbols.map(parseChord),
    anchors: symbols.map((_, index) => ({ line: index, chord: index })),
    activeKey: { tonic: 0, mode: "major" }, keyName: "C major", retab: null, retabTag: null,
    tuning: "standard", capo: 0, transpose: 0,
  },
});
const idleSlot = (entryId, title) => ({ entry: entry(entryId, title), setup, status: "idle", requestId: null, page: null, error: null });
const errorSlot = (entryId, title, error) => ({ entry: entry(entryId, title), setup, status: "error", requestId: `request-${entryId}`, page: null, error });
const run = (pages) => ({ runId: "run", setlistId: "sl", name: "Open mic", pages });
const runWithReadyFirstAndIdleSecond = run([readySlot("e1", "First"), idleSlot("e2", "Second")]);
const readyRun = run([readySlot("e1", "First"), readySlot("e2", "Second")]);
const readyRunWithOneChordPerPage = run([readySlot("e1", "First", ["C"]), readySlot("e2", "Second", ["G"])]);
const runWithFirstErrorAndIdleSuccessor = run([errorSlot("e1", "Missing first", "not found"), idleSlot("e2", "Second")]);

it("plays concert pitch while the page continues to show capo shapes", () => {
  const slot = readySlot("capo", "Capo song", ["C", "G"]);
  slot.page.soundingProgression = ["D", "A"].map(parseChord);
  slot.page.capo = 2;
  const onPlayPageChord = vi.fn();
  render(<Perform run={run([slot])} onRequestPage={() => {}} onPlayPageChord={onPlayPageChord} />);
  fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));
  expect(onPlayPageChord).toHaveBeenLastCalledWith(expect.objectContaining({ chord: expect.objectContaining({ rootSemitone: 2 }) }));
});

let observers;
beforeEach(() => {
  observers = [];
  global.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
  };
});

it("renders ready full charts in order and requests the next page only at the scroll frontier", () => {
  const onRequestPage = vi.fn();
  render(<Perform run={runWithReadyFirstAndIdleSecond} onRequestPage={onRequestPage} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={() => {}} onStopPageWalk={() => {}} />);
  expect(screen.getAllByRole("article").map((node) => node.dataset.entryId)).toEqual(["e1", "e2"]);
  expect(onRequestPage).not.toHaveBeenCalled();
  observers.find((observer) => observer.options.rootMargin === "-35% 0px -64% 0px").callback([{ isIntersecting: true, intersectionRatio: 1, target: screen.getByTestId("perform-page-e1") }]);
  observers.find((observer) => observer.options.rootMargin === "0px 0px -25% 0px").callback([{ isIntersecting: true, target: screen.getByTestId("preload-sentinel-e1") }]);
  expect(onRequestPage).toHaveBeenCalledWith(1);
});

it("marks the visible page without starting audio", () => {
  const onPlayPageChord = vi.fn();
  render(<Perform run={readyRun} onRequestPage={() => {}} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={onPlayPageChord} onStopPageWalk={() => {}} />);
  observers.find((observer) => observer.options.rootMargin === "-35% 0px -64% 0px").callback([{ isIntersecting: true, intersectionRatio: .8, target: screen.getByTestId("perform-page-e2") }]);
  expect(screen.getByText(/2 of 2/)).toBeTruthy();
  expect(onPlayPageChord).not.toHaveBeenCalled();
});

it("Walk stops silently at a page boundary until the next explicit Play", () => {
  vi.useFakeTimers();
  const onPlayPageChord = vi.fn(), onStopPageWalk = vi.fn();
  render(<Perform run={readyRunWithOneChordPerPage} onRequestPage={() => {}} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={onPlayPageChord} onStopPageWalk={onStopPageWalk} tempo={600} />);
  fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));
  expect(onPlayPageChord).toHaveBeenLastCalledWith(expect.objectContaining({ pageKey: "page-e1", chordIndex: 0 }));
  vi.advanceTimersByTime(600);
  expect(screen.getByTestId("perform-page-e2")).toHaveAttribute("data-active-chord", "0");
  expect(onStopPageWalk).toHaveBeenCalledTimes(1);
  expect(onPlayPageChord).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));
  expect(onPlayPageChord).toHaveBeenLastCalledWith(expect.objectContaining({ pageKey: "page-e2", chordIndex: 0 }));
  vi.useRealTimers();
});

it("lets each page adjust tuning, capo, and transpose through onSetupChange", () => {
  const onSetupChange = vi.fn();
  render(<Perform run={readyRun} onRequestPage={() => {}} onSetupChange={onSetupChange} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={() => {}} onStopPageWalk={() => {}} />);
  fireEvent.change(screen.getByRole("combobox", { name: /tuning for Second/i }), { target: { value: "ebStandard" } });
  expect(onSetupChange).toHaveBeenLastCalledWith(1, { tuning: "ebStandard" });
  fireEvent.click(screen.getByRole("button", { name: /capo up for First/i }));
  expect(onSetupChange).toHaveBeenLastCalledWith(0, { capo: 1 });
  fireEvent.click(screen.getByRole("button", { name: /transpose down for First/i }));
  expect(onSetupChange).toHaveBeenLastCalledWith(0, { transpose: -1 });
});

it("continues loading after an unresolved first or middle song", () => {
  const onRequestPage = vi.fn();
  render(<Perform run={runWithFirstErrorAndIdleSuccessor} onRequestPage={onRequestPage} onExitSet={() => {}} onPickSong={() => {}} onPlayPageChord={() => {}} onStopPageWalk={() => {}} />);
  expect(screen.getByText(/Skipped: Missing first/i)).toBeTruthy();
  expect(onRequestPage).not.toHaveBeenCalled();
  observers.find((observer) => observer.options.rootMargin === "0px 0px -25% 0px").callback([{ isIntersecting: true, target: screen.getByTestId("preload-sentinel-e1") }]);
  expect(onRequestPage).toHaveBeenCalledWith(1);
});

it("Roll advances by whole lines under reduced motion and stops its timer on Hold", () => {
  vi.useFakeTimers();
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true });
  localStorage.removeItem("keylit.perform.v1");
  const raf = vi.spyOn(window, "requestAnimationFrame");
  try {
    const { unmount } = render(<Perform run={readyRun} />);
    const stage = screen.getByLabelText("continuous performance set");
    Object.defineProperties(stage, { clientHeight: { value: 300 }, scrollHeight: { value: 2000 } });
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    vi.advanceTimersByTime(700); expect(stage.scrollTop).toBe(0);
    vi.advanceTimersByTime(300); expect(stage.scrollTop).toBe(35);
    expect(raf).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    vi.advanceTimersByTime(2000); expect(stage.scrollTop).toBe(35);
    unmount();
  } finally { raf.mockRestore(); window.matchMedia = originalMatchMedia; vi.useRealTimers(); }
});
