// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "../test/render.js";
import { afterEach, expect, it, vi } from "vitest";
import PlayAlong from "./PlayAlong.jsx";
import { parseSheet } from "../lib/theory.js";
const props = { prog: parseSheet("C G").progression, sheet: "C G", rootVoicings: [[60, 64, 67], [55, 59, 62]], smoothVoicings: [] };
function port(id) {
  const listeners = new Set();
  return { id, state: "connected", name: id, listeners,
    addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    send(data) { for (const fn of listeners) fn({ data }); },
  };
}
function access(...ports) { return { inputs: new Map(ports.map((p) => [p.id, p])), addEventListener: vi.fn(), removeEventListener: vi.fn() }; }
afterEach(() => { delete navigator.requestMIDIAccess; vi.useRealTimers(); });
it("does not subscribe after a late MIDI permission grant", async () => {
  let resolve; navigator.requestMIDIAccess = () => new Promise((r) => { resolve = r; });
  const p = port("p"); const midi = access(p);
  const { unmount } = render(<PlayAlong {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect a MIDI keyboard" })); unmount();
  await act(async () => resolve(midi));
  expect(p.listeners.size).toBe(0); expect(midi.addEventListener).not.toHaveBeenCalled();
});
it("matches a chord while its root is still held by a second MIDI source", async () => {
  const a = port("a"), b = port("b"); navigator.requestMIDIAccess = async () => access(a, b);
  render(<PlayAlong {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect a MIDI keyboard" })); await act(async () => {});
  act(() => { a.send([0x90, 60, 100]); b.send([0x90, 60, 100]); a.send([0x80, 60, 0]); a.send([0x90, 64, 100]); a.send([0x90, 67, 100]); });
  expect(screen.getByRole("button", { name: "C 4" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
});
it("supports a no-MIDI chord exercise with keyboard-only activation", () => {
  vi.useFakeTimers(); const onPlay = vi.fn();
  render(<PlayAlong {...props} onPlay={onPlay} />);
  const c = screen.getByRole("button", { name: "C 4" });
  expect(screen.getAllByRole("button").filter((el) => el.tagName.toLowerCase() === "g" && el.tabIndex === 0)).toHaveLength(1);
  act(() => c.focus());
  fireEvent.keyDown(c, { key: "Enter" });
  fireEvent.keyDown(c, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "C sharp 4" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", { name: "E 4" }), { key: " " });
  fireEvent.keyDown(screen.getByRole("button", { name: "G 4" }), { key: "Enter" });
  expect(onPlay.mock.calls.map(([notes]) => notes[0])).toEqual([60, 64, 67]);
  expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
});
