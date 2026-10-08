// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OneSong from "./OneSong.jsx";
import { createOneSongBook } from "../storage.js";

function fakeBackend() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? "", setItem: (k, v) => data.set(k, v) };
}
const fakeDrafts = (list = []) => ({ list: () => list });
const mount = (props = {}) =>
  render(<OneSong book={createOneSongBook(fakeBackend())} drafts={fakeDrafts()} {...props} />);

describe("OneSong", () => {
  afterEach(cleanup);

  it("greets with an attributed line from the book, never a tagline", () => {
    mount();
    expect(screen.getByText(/How to Write One Song/)).toBeTruthy();
  });

  it("a quiet bench says so without scolding", () => {
    mount();
    expect(screen.getByText(/The bench is quiet/)).toBeTruthy();
  });

  it("sitting down starts the ritual at the chosen length", () => {
    const onStart = vi.fn();
    mount({ onStart });
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    fireEvent.click(screen.getByRole("button", { name: /sit down and write/i }));
    expect(onStart).toHaveBeenCalledWith(5);
  });

  it("finishing a named song shelves it as No. 1 and plays the amen", () => {
    const onPlay = vi.fn();
    mount({ onPlay });
    fireEvent.change(screen.getByLabelText(/name a song finished elsewhere/i), { target: { value: "Coyote Time" } });
    fireEvent.click(screen.getByRole("button", { name: /call it finished/i }));
    expect(screen.getByText("No. 1")).toBeTruthy();
    expect(screen.getByText("Coyote Time")).toBeTruthy();
    expect(onPlay).toHaveBeenCalled(); // the IV; the I follows on its own clock
  });

  it("finishing without a name asks for one instead of shelving a blank", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /call it finished/i }));
    expect(screen.getByText(/Name it first/)).toBeTruthy();
    expect(screen.queryByText("No. 1")).toBeNull();
  });

  it("a finished sketch leaves the finish picker", () => {
    const drafts = fakeDrafts([{ id: "d1", name: "Porch Song" }]);
    mount({ drafts });
    fireEvent.change(screen.getByLabelText(/pick a sketch to finish/i), { target: { value: "d1" } });
    fireEvent.click(screen.getByRole("button", { name: /call it finished/i }));
    expect(screen.getByText("Porch Song")).toBeTruthy(); // on the shelf now
    expect(screen.queryByLabelText(/pick a sketch to finish/i)).toBeNull(); // picker empty → hidden
  });

  it("working a door stamps it today and lights the bench", () => {
    mount();
    const worked = screen.getAllByRole("button", { name: /worked it/i });
    fireEvent.click(worked[0]);
    expect(screen.getByText("today")).toBeTruthy();
    expect(screen.getByText(/Day one at the bench/)).toBeTruthy();
  });
});

it("keeps the title and accurately scopes backup recovery when finishing fails", () => {
  const book = createOneSongBook(fakeBackend());
  book.finish = () => { throw new Error("quota"); };
  mount({ book });
  const input = screen.getByLabelText(/name a song finished elsewhere/i);
  fireEvent.change(input, { target: { value: "Keep this title" } });
  fireEvent.click(screen.getByRole("button", { name: /call it finished/i }));
  expect(input.value).toBe("Keep this title");
  expect(screen.getByText(/Do not clear app data/)).toBeTruthy();
});
