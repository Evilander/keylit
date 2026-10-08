import { describe, expect, it } from "vitest";
import { selectChartVersions } from "./catalog.js";

const chart = (id, format, extra = {}) => ({
  id, artist: "Wilco", title: "Example", source: id,
  format, tuningId: "standard", capo: null, bodyLen: 100, ...extra,
});

describe("selectChartVersions", () => {
  it("keeps tablature beside a chord chart of the same song", () => {
    const rows = [chart("chords", "chords"), chart("tab", "tab")];
    expect(selectChartVersions(rows).map((r) => r.id)).toEqual(["chords", "tab"]);
  });

  it("keeps mixed charts and different tuning or capo arrangements", () => {
    const rows = [chart("a", "tab"), chart("b", "mixed"),
      chart("c", "tab", { tuningId: "dropD" }), chart("d", "tab", { capo: 2 })];
    expect(selectChartVersions(rows).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("deduplicates only verified identical charts, treating no capo and zero alike", () => {
    const rows = [chart("short", "tab", { contentHash: "same" }), chart("full", "tab", { capo: "0", bodyLen: 200, contentHash: "same" }),
      chart("alt", "tab", { title: "Example (ver 2)" })];
    expect(selectChartVersions(rows).map((r) => r.id)).toEqual(["full", "alt"]);
    expect(rows).toHaveLength(3);
  });

  it("keeps same-setup source alternatives with different bodies or no equivalence evidence", () => {
    const rows = [chart("one", "tab", { contentHash: "riff-one" }),
      chart("two", "tab", { contentHash: "riff-two", bodyLen: 200 }), chart("unverified", "tab")];
    expect(selectChartVersions(rows).map((r) => r.id)).toEqual(["one", "two", "unverified"]);
  });
});
