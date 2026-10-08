// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import KeyWheel from "./KeyWheel.jsx";
it("exposes focusable major and minor keys with keyboard activation", () => {
  const onPickTonic = vi.fn(), onAudition = vi.fn();
  render(<KeyWheel prog={[]} activeKey={{ tonic: 0, mode: "major" }} currentIdx={0} onPickTonic={onPickTonic} onAudition={onAudition} />);
  expect(screen.getAllByRole("button")).toHaveLength(24);
  const major = screen.getByRole("button", { name: "hear C major and make it home" });
  const minor = screen.getByRole("button", { name: "hear Am and make it home" });
  major.focus(); expect(major).toHaveFocus();
  fireEvent.keyDown(major, { key: "Enter" });
  fireEvent.keyDown(minor, { key: " " });
  expect(onPickTonic).toHaveBeenNthCalledWith(1, 0, "major");
  expect(onPickTonic).toHaveBeenNthCalledWith(2, 9, "minor");
  expect(onAudition).toHaveBeenCalledTimes(2);
});
