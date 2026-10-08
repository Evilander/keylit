// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "../test/render.js";
import { expect, it, vi } from "vitest";
import Arranger from "./Arranger.jsx";
import { parseSheet } from "../lib/theory.js";
it("stops a handle that arrives after the arranger unmounts", async () => {
  let resolve;
  const stop = vi.fn();
  const onStart = vi.fn(() => new Promise((done) => { resolve = done; }));
  const { unmount } = render(<Arranger prog={parseSheet("C G").progression} onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Play it" }));
  unmount();
  await act(async () => resolve({ stop }));
  expect(stop).toHaveBeenCalledOnce();
});
