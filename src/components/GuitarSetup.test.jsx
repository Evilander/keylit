// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import GuitarSetup from "./GuitarSetup.jsx";

const baseProps = {
  tuningId: "standard",
  onTuningChange: vi.fn(),
  capo: 0,
  chartCapo: 0,
  onCapoChange: vi.fn(),
  onResetCapo: vi.fn(),
  bestCapo: null,
  spelling: "sharps",
  onSpellingChange: vi.fn(),
  shapeChord: null,
  soundingChord: null,
  shapeKey: { tonic: 0, mode: "major" },
  soundingKey: { tonic: 0, mode: "major" },
  transpose: 0,
  onUseDetunedSetup: vi.fn(),
};

describe("GuitarSetup", () => {
  it("offers alternate tunings and represents the selected setup honestly", () => {
    render(<GuitarSetup {...baseProps} tuningId="dropD" />);
    expect(screen.getByText("Drop D · no capo · Guitar ♯ names")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand guitar setup" }));
    expect(screen.getByRole("combobox", { name: "My guitar tuning" })).toHaveValue("dropD");
    expect(screen.getByRole("option", { name: /Open G/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /DADGAD/ })).toBeInTheDocument();
  });

  it("does not describe an open-tuning chord as a familiar standard-tuning fingering", () => {
    render(<GuitarSetup {...baseProps} tuningId="openG" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand guitar setup" }));
    expect(screen.queryByText("Finger")).not.toBeInTheDocument();
    expect(screen.getByText(/use the grips/i)).toBeInTheDocument();
  });

  it("renders the collapsed summary by default", () => {
    render(<GuitarSetup {...baseProps} />);
    expect(screen.getByText("Standard · no capo · Guitar ♯ names")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand guitar setup" })).toBeInTheDocument();
    expect(screen.queryByLabelText("My guitar tuning")).not.toBeInTheDocument();
  });

  it("expands when clicking Adjust, then collapses when clicking Collapse", () => {
    render(<GuitarSetup {...baseProps} />);
    const adjustBtn = screen.getByRole("button", { name: "Expand guitar setup" });
    fireEvent.click(adjustBtn);

    // Now it should be expanded, so we should see the tuning selector
    expect(screen.getByLabelText("My guitar tuning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse guitar setup" })).toBeInTheDocument();
    expect(screen.queryByText("Standard · no capo · Guitar ♯ names")).not.toBeInTheDocument();

    // Click collapse
    const collapseBtn = screen.getByRole("button", { name: "Collapse guitar setup" });
    fireEvent.click(collapseBtn);

    // Should be collapsed again
    expect(screen.getByText("Standard · no capo · Guitar ♯ names")).toBeInTheDocument();
    expect(screen.queryByLabelText("My guitar tuning")).not.toBeInTheDocument();
  });
});
