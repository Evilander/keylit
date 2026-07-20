import { describe, expect, it } from "vitest";
import * as retabPanel from "./RetabPanel.jsx";

describe("retabForCurrentSheet", () => {
  it("exposes a retab only while the deferred sheet is current", () => {
    expect(retabPanel.retabForCurrentSheet).toBeTypeOf("function");

    const retab = { text: "re-fretted tab" };
    expect(retabPanel.retabForCurrentSheet(retab, "same sheet", "same sheet")).toBe(retab);
    expect(retabPanel.retabForCurrentSheet(retab, "old sheet", "new sheet")).toBeNull();
  });
});
