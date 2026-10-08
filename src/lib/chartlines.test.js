import { describe, it, expect } from "vitest";
import { isSectionHeader, chordLineInfo, chartOutline, sectionIndex, progressionAnchors } from "./chartlines.js";
import { parseSheet } from "./theory.js";

it("never treats tuning, capo, or key declarations as playable chord rows", () => {
  for (const line of ["Tuning: D A D G A D", "Key: C", "Capo: 2"]) {
    expect(chordLineInfo(line)).toBeNull();
  }
});

const SHEET = `[Intro]
E       A       E

[Verse 1]
E                    G#m7
So long, my only friend
C#m7                 B
I guess we gave it a try

Chorus:
A      E/G#      F#m
How could you, baby?`;

describe("isSectionHeader", () => {
  it("accepts bracketed and colon forms", () => {
    expect(isSectionHeader("[Verse 1]")).toBe(true);
    expect(isSectionHeader("Chorus:")).toBe(true);
    expect(isSectionHeader("  [Bridge]  ")).toBe(true);
  });
  it("rejects lyrics and chord lines", () => {
    expect(isSectionHeader("So long, my only friend")).toBe(false);
    expect(isSectionHeader("E A E")).toBe(false);
    // a lyric that happens to end with a colon but runs long stays a lyric
    expect(isSectionHeader("this is a very long line of words that keeps going on:")).toBe(false);
  });
});

describe("chordLineInfo", () => {
  it("catches chord lines and keeps whitespace tokens intact", () => {
    const info = chordLineInfo("E                    G#m7");
    expect(info).not.toBeNull();
    expect(info.tokens.join("")).toBe("E                    G#m7");
  });
  it("rejects lyric lines even when a word parses as a chord", () => {
    // "A" alone parses, but 1/6 of tokens is under the half bar
    expect(chordLineInfo("A long time ago in Georgia")).toBeNull();
  });
});

describe("chartOutline", () => {
  const outline = chartOutline(SHEET);

  it("classifies every line and keeps the count", () => {
    expect(outline).toHaveLength(SHEET.split("\n").length);
    expect(outline[0]).toMatchObject({ kind: "header", title: "Intro" });
    expect(outline[1].kind).toBe("chords");
    expect(outline[2].kind).toBe("lyric"); // blank
    expect(outline[4].kind).toBe("chords");
    expect(outline[5].kind).toBe("lyric");
  });

  it("parses chord tokens in place, gaps preserved", () => {
    const line = outline[4]; // "E                    G#m7"
    const parsedTokens = line.tokens.filter((t) => t.parsed);
    expect(parsedTokens.map((t) => t.text)).toEqual(["E", "G#m7"]);
    expect(line.tokens.map((t) => t.text).join("")).toBe(line.line);
  });

  it("strips UG wrappers before classifying", () => {
    const o = chartOutline("[ch]Am[/ch] [ch]F[/ch]\nhello darkness");
    expect(o[0].kind).toBe("chords");
    expect(o[0].tokens.filter((t) => t.parsed).map((t) => t.text)).toEqual(["Am", "F"]);
  });

  it("marks tab blocks with first/last edges", () => {
    const tab = [
      "e|-0-2-3-|",
      "B|-1-1-1-|",
      "G|-0-0-0-|",
      "D|-2-2-2-|",
      "A|-3-3-3-|",
      "E|-------|",
    ].join("\n");
    const o = chartOutline(`[Riff]\n${tab}\nwords after`);
    const tabs = o.filter((l) => l.kind === "tab");
    expect(tabs).toHaveLength(6);
    expect(tabs[0].pos.first).toBe(true);
    expect(tabs[5].pos.last).toBe(true);
  });

  it("colon headers get titles too", () => {
    const o = chartOutline(SHEET);
    const secs = sectionIndex(o);
    expect(secs.map((s) => s.title)).toEqual(["Intro", "Verse 1", "Chorus"]);
    expect(secs[2].lineIdx).toBeGreaterThan(secs[1].lineIdx);
  });
});

describe("progressionAnchors — the playhead's map", () => {
  it("mirrors parseSheet's collapse on repeated chords", () => {
    const text = "[Verse]\nE E A E\nsome words\nA A B\n";
    const { progression } = parseSheet(text);
    const anchors = progressionAnchors(chartOutline(text));
    // E E A E → E A E · A A B → A B, so 5 steps
    expect(progression.map((c) => c.raw)).toEqual(["E", "A", "E", "A", "B"]);
    expect(anchors).toHaveLength(progression.length);
    // the collapsed second E echoes the first
    expect(anchors[0].echoes).toHaveLength(1);
    expect(anchors[0].echoes[0].token).toBeGreaterThan(anchors[0].token);
  });

  it("a section boundary breaks the collapse, matching parseSheet", () => {
    const text = "[Verse]\nE A\n[Chorus]\nA B\n";
    const { progression } = parseSheet(text);
    const anchors = progressionAnchors(chartOutline(text));
    // A|A across the boundary does NOT collapse — sections differ
    expect(progression.map((c) => c.raw)).toEqual(["E", "A", "A", "B"]);
    expect(anchors).toHaveLength(progression.length);
  });

  it("lines up 1:1 with parseSheet on the app's demo chart", () => {
    const demo = `[Intro]\nE       A       E\n\n[Verse 1]\nE                    G#m7\nSo long, my only friend\nC#m7                 B\nI guess we gave it a try\nA                         E\nAnd then I guess we tried again\nF#              F#   G#m7/F#   F#\nI don't remember why\n\n[Chorus]\nA      E/G#      F#m              G#m7\nHow could you, baby?\nA      E/G#      F#m                    E\nWell, how could you, baby?`;
    const { progression } = parseSheet(demo);
    const anchors = progressionAnchors(chartOutline(demo));
    expect(anchors).toHaveLength(progression.length);
    // every anchor points at a token whose raw text parses to the same chord
    const outline = chartOutline(demo);
    anchors.forEach((a, i) => {
      const tok = outline[a.line].tokens[a.token];
      expect(tok.parsed.raw, `anchor ${i}`).toBe(progression[i].raw);
    });
  });

  it("colon-style headers (Chorus:) break the collapse identically in both walks", () => {
    // theory.isSectionLine and chartlines.isSectionHeader are now ONE rule;
    // two rules made the anchor count drift on colon-headed charts and Walk
    // mode silently fell back to sound-matching.
    const text = "Verse:\nE A\nChorus:\nA B\n";
    const { progression } = parseSheet(text);
    const anchors = progressionAnchors(chartOutline(text));
    expect(progression.map((c) => c.raw)).toEqual(["E", "A", "A", "B"]); // A|A survives the boundary
    expect(progression[2].section).toBe("Chorus");
    expect(anchors).toHaveLength(progression.length);
  });

  it("ChordPro charts diverge and the caller can tell", () => {
    // normalizeChart extracts [C]/[G] to their own line; the rendered outline
    // sees a lyric line — anchor count ≠ progression count → fallback signal
    const text = "[C]hello [G]darkness";
    const { progression } = parseSheet(text);
    const anchors = progressionAnchors(chartOutline(text));
    expect(progression).toHaveLength(2);
    expect(anchors.length).not.toBe(progression.length);
  });
});
