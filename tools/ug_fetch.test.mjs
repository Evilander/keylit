import test from "node:test";
import assert from "node:assert/strict";
import { parsePageData, matchArtist, selectTabs, outputId } from "./ug_fetch.mjs";

const tab = (id, type, rating = 4) => ({ id, type, rating, votes: 10, song_name: "Example", version: id, tab_url: `https://tabs.ultimate-guitar.com/tab/example/example-${id}` });

test("artist lookup never falls back to an unrelated first result", () => {
  assert.equal(matchArtist([{ artist_name: "Radiohead Cover Band" }], "Radiohead"), null);
  assert.equal(matchArtist([{ artist_name: "The Smiths" }], "Smiths").artist_name, "The Smiths");
});

test("one version per format preserves chords and instrumental tab", () => {
  const picks = selectTabs([tab(1, "Chords", 4), tab(2, "Chords", 5), tab(3, "Tabs"), tab(4, "Bass Tabs")]);
  assert.deepEqual(picks.map((p) => p.id), [2, 3]);
});

test("missing-chords filter keeps tabs and normalizes version titles", () => {
  const picks = selectTabs([tab(1, "Chords"), tab(2, "Tabs")], {
    knownOnly: true, skipExistingChords: true, artistRows: [{ title: "Example (ver 3)", format: "chords" }],
  });
  assert.deepEqual(picks.map((p) => p.id), [2]);
});

test("mixed arrangements already provide chord coverage", () => {
  assert.deepEqual(selectTabs([tab(1, "Chords")], {
    skipExistingChords: true, artistRows: [{ title: "Example", format: "mixed" }],
  }), []);
});

test("duplicate source URLs collapse and external destinations fail closed", () => {
  assert.equal(selectTabs([tab(1, "Tabs"), tab(1, "Tabs")]).length, 1);
  assert.throws(() => selectTabs([{ ...tab(1, "Tabs"), tab_url: "https://example.com/tab" }]), /invalid UG/);
});

test("collisions keep source version and format instead of dropping arrangements", () => {
  assert.equal(outputId("Artist", tab(12, "Tabs"), () => false), "artist--example");
  assert.equal(outputId("Artist", tab(12, "Tabs"), () => true), "artist--example--tab-12");
  assert.equal(outputId("Artist", tab(12, "Chords"), () => true), "artist--example--chords-12");
});

test("HTML-escaped page data decodes and rejects non-chart pages", () => {
  const data = { store: { page: { data: { artist: "Rock & Roll" } } } };
  const encoded = JSON.stringify(data).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  assert.deepEqual(parsePageData(`<div data-content="${encoded}"></div>`), { artist: "Rock & Roll" });
  assert.throws(() => parsePageData("<html>Access denied</html>"), /no data-content/);
  assert.throws(() => parsePageData('<div data-content="{}"></div>'), /missing page data/);
});
