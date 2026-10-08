// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import ThemePicker from "./ThemePicker.jsx";
import { THEMES } from "../ui/theme.js";
it("focuses the selected theme, supports arrows and returns focus on Escape", () => {
  render(<ThemePicker theme={THEMES[1].id} onPick={() => {}} />);
  const trigger = screen.getByRole("button", { name: "theme" });
  fireEvent.click(trigger);
  const items = screen.getAllByRole("menuitemradio");
  expect(items[1]).toHaveFocus();
  fireEvent.keyDown(items[1], { key: "ArrowDown" }); expect(items[2]).toHaveFocus();
  fireEvent.keyDown(items[2], { key: "Home" }); expect(items[0]).toHaveFocus();
  fireEvent.keyDown(items[0], { key: "ArrowUp" }); expect(items.at(-1)).toHaveFocus();
  fireEvent.keyDown(items.at(-1), { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
});
it("picks a theme and restores focus; Tab dismisses without trapping focus", () => {
  const onPick = vi.fn();
  render(<ThemePicker theme={THEMES[0].id} onPick={onPick} />);
  const trigger = screen.getByRole("button", { name: "theme" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(screen.getAllByRole("menuitemradio")[1]);
  expect(onPick).toHaveBeenCalledWith(THEMES[1].id); expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(fireEvent.keyDown(document.activeElement, { key: "Tab" })).toBe(true);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
