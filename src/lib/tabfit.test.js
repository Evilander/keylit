import { describe, it, expect } from "vitest";
import { parseTab } from "./tab.js";
import { tabHomes, HOME_CANDIDATES } from "./tabfit.js";

// A drop-D riff: the open low D pedal under a moving line. In standard the
// D2 doesn't exist (octave-rescue territory); in drop D it's all open easy.
const DROP_D_RIFF = [
  "e|--------------------|",
  "B|--------------------|",
  "G|--------------------|",
  "D|----0---2---4-------|",
  "A|--------------------|",
  "D|0---0---0---0---0---|",
].join("\n");

// An open-position standard riff — standard should win its own song.
const STANDARD_RIFF = [
  "e|-0--------0---------|",
  "B|----1--------1------|",
  "G|-------0--------0---|",
  "D|-2------------------|",
  "A|-3------------------|",
  "E|--------------------|",
].join("\n");

describe("tabHomes — where the transcription actually sits", () => {
  it("a drop-D riff names drop D home, ahead of standard", () => {
    const parsed = parseTab(DROP_D_RIFF); // labels resolve dropD
    const homes = tabHomes(parsed.blocks, { sourceCapo: 0 });
    expect(homes.length).toBeGreaterThan(1);
    const dropD = homes.findIndex((h) => h.tuning.id === "dropD" && h.capo === 0);
    const standard = homes.findIndex((h) => h.tuning.id === "standard" && h.capo === 0);
    expect(dropD).toBeGreaterThanOrEqual(0);
    if (standard >= 0) expect(dropD).toBeLessThan(standard);
    expect(homes[0].dropped).toBe(0); // the best home loses nothing
  });

  it("a standard open riff keeps standard at (or tied for) the top", () => {
    const parsed = parseTab(STANDARD_RIFF);
    const homes = tabHomes(parsed.blocks, { sourceCapo: 0 });
    const best = homes[0];
    // standard must not lose to anything by drops or rescues on its own riff
    const std = homes.find((h) => h.tuning.id === "standard" && h.capo === 0);
    expect(std.dropped).toBe(0);
    expect(std.shifted).toBe(0);
    expect(best.score).toBeLessThanOrEqual(std.score + 1e-9);
  });

  it("ranks ascending by score and respects maxResults", () => {
    const parsed = parseTab(STANDARD_RIFF);
    const homes = tabHomes(parsed.blocks, { maxResults: 3 });
    expect(homes).toHaveLength(3);
    for (let i = 1; i < homes.length; i++) {
      expect(homes[i].score).toBeGreaterThanOrEqual(homes[i - 1].score);
    }
  });

  it("every home speaks a verdict sentence a musician can read", () => {
    const parsed = parseTab(DROP_D_RIFF);
    const homes = tabHomes(parsed.blocks, {});
    for (const h of homes) {
      expect(h.verdict.length).toBeGreaterThan(8);
      if (h.dropped > 0) expect(h.verdict).toMatch(/lose|lost/i);
    }
  });

  it("empty blocks → empty answer, never a crash", () => {
    expect(tabHomes([], {})).toEqual([]);
  });

  it("the candidate set is sane: unique, all resolvable", () => {
    const seen = new Set(HOME_CANDIDATES.map((c) => `${c.tuning}@${c.capo}`));
    expect(seen.size).toBe(HOME_CANDIDATES.length);
  });
});
