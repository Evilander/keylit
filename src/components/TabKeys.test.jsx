// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "../test/render.js";
import { expect, it, vi } from "vitest";
import TabKeys from "./TabKeys.jsx";

const sheet = ["e|--0---|", "B|------|", "G|------|", "D|------|", "A|------|", "E|------|"].join("\n");

it("cancels a late audio start after the player changes capo", async () => {
  let start;
  const onHear = () => new Promise((resolve) => { start = resolve; });
  const stop = vi.fn();
  const view = render(<TabKeys sheet={sheet} capo={0} onHear={onHear} />);
  fireEvent.click(screen.getByRole("button", { name: /Hear it/i }));
  view.rerender(<TabKeys sheet={sheet} capo={2} onHear={onHear} />);
  await act(async () => start({ stop }));
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: /Hear it/i })).toBeInTheDocument();
});
