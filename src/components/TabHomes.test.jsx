// @vitest-environment jsdom
import React from "react";
import { expect, it } from "vitest";
import { render, screen } from "../test/render.js";
import TabHomes from "./TabHomes.jsx";

it("discloses a long single riff's column budget", () => {
  const line = "0-".repeat(200);
  const empty = "--".repeat(200);
  const sheet = [`e|${line}|`, ...["B", "G", "D", "A", "E"].map(s => `${s}|${empty}|`)].join("\n");
  render(<TabHomes sheet={sheet} sourceTuning="standard" sourceCapo={0} />);
  expect(screen.getByText(/first 128 of 200 note columns/)).toBeInTheDocument();
  expect(screen.getAllByText(/In the sample:/)).toHaveLength(3);
});
