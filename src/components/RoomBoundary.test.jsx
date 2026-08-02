// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RoomBoundary from "./RoomBoundary.jsx";

function Bomb({ armed }) {
  if (armed) throw new Error("kaboom in the piano room");
  return <div>all keys accounted for</div>;
}

describe("RoomBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors loudly; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(cleanup);

  it("renders children when nothing throws", () => {
    render(<RoomBoundary><Bomb armed={false} /></RoomBoundary>);
    expect(screen.getByText("all keys accounted for")).toBeTruthy();
  });

  it("catches a render error and keeps the message honest", () => {
    render(<RoomBoundary><Bomb armed /></RoomBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/wrong note/i)).toBeTruthy();
    expect(screen.getByText(/kaboom in the piano room/)).toBeTruthy();
  });

  it("reopen retries the room in place", () => {
    let armed = true;
    function Fixable() { return <Bomb armed={armed} />; }
    render(<RoomBoundary><Fixable /></RoomBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
    armed = false; // the fault clears (e.g. transient state), the player retries
    fireEvent.click(screen.getByRole("button", { name: /reopen the room/i }));
    expect(screen.getByText("all keys accounted for")).toBeTruthy();
  });
});
