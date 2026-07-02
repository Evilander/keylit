// songbook.test.js — guards the authored Public Domain Songbook: every song
// must parse into real chords, tab-format songs must contain a detectable tab
// block, and the tab notes must belong to the labeled chords (no wrong notes
// shipped to the public site).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSheet, parseChord } from "./lib/theory.js";
import { hasTab, parseTab } from "./lib/tab.js";

const DIR = path.join(__dirname, "..", "public", "songbook");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "manifest.json");
const songs = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

describe("public domain songbook", () => {
  it("exists and has a full manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
    expect(songs.length).toBeGreaterThanOrEqual(16);
    expect(manifest.length).toBe(songs.length);
    for (const row of manifest) {
      expect(row.source).toBe("songbook");
      expect(row.body).toBeUndefined(); // manifest stays light
    }
  });

  it.each(songs.map((s) => [s.title, s]))("%s parses into a real progression", (_t, s) => {
    const { progression } = parseSheet(s.body);
    expect(progression.length).toBeGreaterThanOrEqual(4);
    // the declared key's tonic chord appears somewhere in the song
    const tonic = parseChord(s.key);
    expect(tonic).not.toBeNull();
    expect(progression.some((c) => c.rootSemitone === tonic.rootSemitone)).toBe(true);
  });

  it.each(songs.filter((s) => s.format === "tab").map((s) => [s.title, s]))(
    "%s (tab) has a parseable tab whose notes fit its chords", (_t, s) => {
      expect(hasTab(s.body)).toBe(true);
      const parsed = parseTab(s.body);
      expect(parsed.events.length).toBeGreaterThanOrEqual(6);
      // every fretted pitch class must belong to at least one chord in the song
      const { progression } = parseSheet(s.body);
      const legal = new Set();
      for (const ch of progression) {
        for (const iv of ch.intervals) legal.add((ch.rootSemitone + iv) % 12);
        if (ch.bassSemitone != null) legal.add(ch.bassSemitone % 12);
      }
      for (const ev of parsed.events) {
        for (const n of ev.notes) {
          expect(legal.has(((n.midi % 12) + 12) % 12), `${s.title}: midi ${n.midi} not in any chord`).toBe(true);
        }
      }
    });
});
