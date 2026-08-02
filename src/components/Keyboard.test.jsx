// @vitest-environment jsdom
// The shared instrument must be playable FROM the keyboard — every key a real
// button, arrows walking the notes — but only when it's actually playable.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Keyboard from "./Keyboard.jsx";

describe("Keyboard accessibility", () => {
  afterEach(cleanup);

  it("a playable board exposes every key as a named button", () => {
    render(<Keyboard onKey={() => {}} />);
    const keys = screen.getAllByRole("button");
    expect(keys.length).toBe(37); // MIDI 36–72, C2..C5
    expect(screen.getByRole("button", { name: "C 4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "F sharp 3" })).toBeTruthy();
  });

  it("a display-only board stays quiet — no phantom buttons", () => {
    render(<Keyboard />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("Enter and Space strike the focused key", () => {
    const onKey = vi.fn();
    render(<Keyboard onKey={onKey} />);
    const c4 = screen.getByRole("button", { name: "C 4" });
    fireEvent.keyDown(c4, { key: "Enter" });
    fireEvent.keyDown(c4, { key: " " });
    expect(onKey).toHaveBeenCalledTimes(2);
    expect(onKey).toHaveBeenCalledWith(60);
  });

  it("arrows walk the instrument chromatically; Home and End jump", () => {
    render(<Keyboard onKey={() => {}} />);
    const c4 = screen.getByRole("button", { name: "C 4" });
    c4.focus();
    fireEvent.keyDown(c4, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "C sharp 4" }));
    fireEvent.keyDown(document.activeElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(c4);
    fireEvent.keyDown(c4, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "C 2" }));
    fireEvent.keyDown(document.activeElement, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "C 5" }));
  });
});
