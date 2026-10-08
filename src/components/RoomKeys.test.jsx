// @vitest-environment jsdom
import React from "react";
import { expect, it, vi, afterEach } from "vitest";
import { fireEvent, render } from "../test/render.js";
import RoomKeys from "./RoomKeys.jsx";

afterEach(() => { document.body.innerHTML = ""; });

const press = (key) => fireEvent.keyDown(document.body, { key });

it("jumps rooms on the number row", () => {
  const onGo = vi.fn();
  render(<RoomKeys onGo={onGo} />);
  press("4");
  expect(onGo).toHaveBeenCalledWith("piano");
});

it("stays quiet while typing", () => {
  const onGo = vi.fn();
  render(<RoomKeys onGo={onGo} />);
  const input = document.createElement("input");
  document.body.appendChild(input);
  fireEvent.keyDown(input, { key: "4" });
  expect(onGo).not.toHaveBeenCalled();
});

// The old guard read the FOCUSED element, and a modal's own Cancel button is a
// BUTTON, so it passed. Tab to it, press a digit, and the room changed behind
// the still-open dialog.
it("does not jump rooms from a button inside an open dialog", () => {
  const onGo = vi.fn();
  render(<RoomKeys onGo={onGo} />);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  const cancel = document.createElement("button");
  dialog.appendChild(cancel);
  document.body.appendChild(dialog);
  fireEvent.keyDown(cancel, { key: "4" });
  expect(onGo).not.toHaveBeenCalled();
});

it("does not jump rooms while an alertdialog is up", () => {
  const onGo = vi.fn();
  render(<RoomKeys onGo={onGo} />);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "alertdialog");
  document.body.appendChild(dialog);
  press("4");
  expect(onGo).not.toHaveBeenCalled();
});

// Its own shortcut map is a dialog too, and it is the one that still wants the
// number row: pressing a digit there is how you leave it.
it("still jumps from its own shortcut map", () => {
  const onGo = vi.fn();
  render(<RoomKeys onGo={onGo} />);
  press("?");
  expect(document.querySelector('[aria-label="room shortcuts"]')).toBeTruthy();
  press("4");
  expect(onGo).toHaveBeenCalledWith("piano");
});
