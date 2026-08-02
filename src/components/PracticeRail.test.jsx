// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PracticeRail from "./PracticeRail.jsx";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 7, 5, 12, 0, 0).getTime();
const fakeBook = (entries = []) => ({ log: () => entries });

describe("PracticeRail", () => {
  afterEach(cleanup);

  it("empty log says so, plainly", () => {
    render(<PracticeRail book={fakeBook()} now={() => NOW} />);
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();
    expect(screen.getByText(/cold shelf fills once/)).toBeTruthy();
  });

  it("recent runs read as sentences with when and how", () => {
    const book = fakeBook([
      { songKey: "candle", title: "Candle", at: NOW - DAY, kind: "playalong", accuracy: 0.82 },
      { songKey: "harvest", title: "Harvest", at: NOW - 3 * DAY, kind: "ran-it" },
    ]);
    render(<PracticeRail book={book} now={() => NOW} />);
    expect(screen.getByText("play-along · 82% · yesterday")).toBeTruthy();
    expect(screen.getByText("ran it · 3 days ago")).toBeTruthy();
    expect(screen.getByText(/2 sessions this week/)).toBeTruthy();
  });

  it("the cold shelf ranks the stalest, worst-known song first", () => {
    const book = fakeBook([
      { songKey: "fresh", title: "Fresh", at: NOW - DAY, kind: "playalong", accuracy: 0.95 },
      { songKey: "stale", title: "Stale", at: NOW - 20 * DAY, kind: "playalong", accuracy: 0.4 },
    ]);
    render(<PracticeRail book={book} now={() => NOW} />);
    const titles = screen.getAllByText(/Fresh|Stale/).map((n) => n.textContent);
    expect(titles.indexOf("Stale")).toBeLessThan(titles.lastIndexOf("Fresh"));
    expect(screen.getByText(/20d cold · last 40%/)).toBeTruthy();
  });

  it("the clock line opens the metronome tab", () => {
    const onOpenClock = vi.fn();
    render(<PracticeRail book={fakeBook()} now={() => NOW} onOpenClock={onOpenClock} />);
    fireEvent.click(screen.getByRole("button", { name: /no clock running/i }));
    expect(onOpenClock).toHaveBeenCalled();
  });
});
