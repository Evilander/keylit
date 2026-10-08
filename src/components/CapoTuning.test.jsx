// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { act, render, screen } from "../test/render.js";
import CapoTuning from "./CapoTuning.jsx";
import { suggestArrangements } from "../lib/capo.js";

it("yields before ranking and preserves the full advisor ordering", async () => {
  vi.useFakeTimers();
  try {
    const prog = ["C", "G", "C"];
    const expected = suggestArrangements(prog).slice(0, 6);
    const { container } = render(<CapoTuning prog={prog} />);
    expect(screen.getByRole("status")).toHaveTextContent("Finding easier");
    await act(() => vi.runAllTimersAsync());
    expect(screen.queryByRole("status")).toBeNull();
    const rows = container.querySelectorAll("section")[0].querySelectorAll(".kl-rows > div");
    expect(rows).toHaveLength(6);
    expected.forEach((item, i) => expect(rows[i]).toHaveTextContent(item.note));
  } finally { vi.useRealTimers(); }
});

it("cancels scheduled ranking when the progression changes or unmounts", async () => {
  vi.useFakeTimers();
  try {
    const view = render(<CapoTuning prog={["C"]} />);
    view.rerender(<CapoTuning prog={[]} />);
    await act(() => vi.runAllTimersAsync());
    expect(screen.queryByText("Play it easier")).toBeNull();
    view.rerender(<CapoTuning prog={["D"]} />);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
