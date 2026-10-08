// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "../test/render.js";
import { afterEach, expect, it, vi } from "vitest";
import SessionRoom from "./SessionRoom.jsx";
import { parseSheet } from "../lib/theory.js";
afterEach(() => vi.useRealTimers());
it("does not join after initialization completes in another room", async () => {
  let resolve;
  const audio = { init: () => new Promise((done) => { resolve = done; }), now: () => 0, playEvents: vi.fn(() => ({ stop() {} })) };
  const { unmount } = render(<SessionRoom prog={parseSheet("C G Am").progression} audio={audio} />);
  fireEvent.click(screen.getByRole("button", { name: "Join the circle" })); unmount();
  await act(async () => resolve());
  expect(audio.playEvents).not.toHaveBeenCalled();
});
it("loops a three-bar tune without adding a silent fourth bar", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const audio = { init: async () => {}, now: () => Date.now() / 1000, playEvents: vi.fn(() => ({ stop() {} })) };
  const { unmount } = render(<SessionRoom prog={parseSheet("C G Am").progression} audio={audio} />);
  fireEvent.click(screen.getByRole("button", { name: "Join the circle" }));
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  const first = audio.playEvents.mock.calls[0][1].startAt;
  expect(audio.playEvents.mock.calls[2][1].startAt - first).toBeCloseTo(12 * 60 / 84);
  unmount();
});
