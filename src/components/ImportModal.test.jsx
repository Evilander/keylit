// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "../test/render.js";
import ImportModal from "./ImportModal.jsx";

it("loads supplied text in an accessible dialog and returns focus on close", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const onLoad = vi.fn();
  const { rerender } = render(<ImportModal open initialText="C G Am F" onLoad={onLoad} onClose={() => {}} />);
  const dialog = screen.getByRole("dialog", { name: "Paste your chords here" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  const text = screen.getByRole("textbox", { name: "Chord chart to import" });
  await waitFor(() => expect(text).toHaveFocus());
  expect(text).toHaveValue("C G Am F");
  fireEvent.click(screen.getByRole("button", { name: "Load chords" }));
  expect(onLoad).toHaveBeenCalledWith("C G Am F");
  rerender(<ImportModal open={false} onLoad={onLoad} onClose={() => {}} />);
  expect(opener).toHaveFocus();
  opener.remove();
});
