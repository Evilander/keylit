// @vitest-environment jsdom
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import LearnRoom from "./rooms/LearnRoom.jsx";
vi.mock("./ScaleBuilder.jsx", () => ({ default: () => <p>Scale lesson</p> }));
vi.mock("./DegreeFinder.jsx", () => ({ default: () => null }));
vi.mock("./EarTrainer.jsx", () => ({ default: () => <p>Ear lesson</p> }));
vi.mock("./MeterFeel.jsx", () => ({ default: () => null }));
vi.mock("./PedalLab.jsx", () => ({ default: () => null }));
function Lesson() {
  const [learnTab, setLearnTab] = useState("scale");
  return <LearnRoom quote={{q:"A quote",by:"A writer"}} learnTab={learnTab} setLearnTab={setLearnTab} view={{prog:[]}} />;
}
it("moves tab focus and selection, associates the panel, and wraps navigation", () => {
  render(<Lesson />);
  const tabs = screen.getAllByRole("tab");
  fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
  expect(tabs[1]).toHaveFocus(); expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel", { name: "The ear" })).toHaveTextContent("Ear lesson");
  expect(tabs.filter(t => t.tabIndex === 0)).toEqual([tabs[1]]);
  fireEvent.keyDown(tabs[1], { key: "End" }); expect(tabs[3]).toHaveFocus();
  fireEvent.keyDown(tabs[3], { key: "ArrowRight" }); expect(tabs[0]).toHaveFocus();
});
