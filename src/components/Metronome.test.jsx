// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import Metronome from "./Metronome.jsx";
import { metronome } from "../audio/metronome.js";
vi.mock("../audio/metronome.js", () => ({ metronome: {
  getState: () => ({ bpm: 96, meterId: "4/4", subdivision: 1, volume: 70, running: false }),
  subscribe: () => () => {}, onPulse: () => () => {}, set: vi.fn(), toggle: vi.fn(),
} }));
it("preserves native descendant keys without bubbling to Perform", () => {
  const stage = vi.fn();
  render(<div onKeyDown={stage}><Metronome /></div>);
  for (const [control, key] of [[screen.getByRole("combobox", { name: "meter" }), "ArrowDown"], [screen.getByRole("button", { name: "one faster" }), " "], [screen.getByRole("slider", { name: "click volume" }), "ArrowUp"]]) {
    expect(fireEvent.keyDown(control, { key })).toBe(true);
  }
  expect(stage).not.toHaveBeenCalled();
  expect(metronome.toggle).not.toHaveBeenCalled();
  expect(metronome.set).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "one faster" }));
  expect(metronome.set).toHaveBeenCalledWith({ bpm: 97 });
});
it("still handles shortcuts when the compact panel itself is focused", () => {
  const { container } = render(<Metronome compact />);
  expect(fireEvent.keyDown(container.firstChild, { key: " " })).toBe(false);
  expect(metronome.toggle).toHaveBeenCalled();
});
