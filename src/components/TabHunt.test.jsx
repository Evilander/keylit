// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "../test/render.js";
import TabHunt from "./TabHunt.jsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const reply = (body) => ({ ok: true, json: async () => body });
async function begin() {
  const view = render(<TabHunt />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /go on a tab hunt/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "artist to hunt" }), { target: { value: "Wilco" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "go", exact: true })));
  return view;
}

it("does not start overlapping status requests and cancels work on unmount", async () => {
  let finish;
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply({ ok: true }))
    .mockResolvedValueOnce(reply({ id: "1" }))
    .mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = await begin();
  await act(async () => vi.advanceTimersByTime(1200));
  await act(async () => vi.advanceTimersByTime(2400));
  expect(fetch).toHaveBeenCalledTimes(3);
  const signal = fetch.mock.calls[2][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(reply({ done: false, stages: [] })));
  await act(async () => vi.advanceTimersByTime(2400));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("reports an empty hunt without claiming the entire artist catalog is complete", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply({ ok: true }))
    .mockResolvedValueOnce(reply({ id: "1" }))
    .mockResolvedValueOnce(reply({ done: true, stages: [] }));
  await begin();
  await act(async () => vi.advanceTimersByTime(1200));
  expect(screen.getByRole("status")).toHaveTextContent("No new charts were added in this hunt.");
});
