import test from "node:test";
import assert from "node:assert/strict";
import { chartFormat } from "./tabsites_fetch.mjs";

test("fan archive lyrics-only pages cannot become playable library charts", () => {
  assert.equal(chartFormat('Song title\nWritten by the artist\n\nThis page has only words and no musical chart.'), null);
});

test("fan archives label chord sheets as chords instead of tabs", () => {
  assert.equal(chartFormat('[Verse]\nC     G/B    Am7    F\nAn authored test line'), "chords");
});

test("a playable tab remains a tab even when accompanied by chord names", () => {
  const body = '[Intro]\nC G\ne|--0-1-3--|\nB|--1-1-0--|\nG|--0-2-0--|\nD|--2-3-0--|\nA|--3-3-2--|\nE|--------3|';
  assert.equal(chartFormat(body), "tab");
});
