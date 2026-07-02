import { describe, it, expect } from "vitest";
import { buildUserSong } from "./usersong.js";

const NOW = 1780444800000; // fixed date for determinism

describe("buildUserSong — the Add-a-song record builder", () => {
  it("builds a corpus-shaped record with a stable id", () => {
    const { song, row } = buildUserSong(
      { artist: "Buck Meek", title: "Candle", body: "[Verse]\nG   C   G   D\nla la la" }, NOW);
    expect(song.id).toBe("user--buck-meek--candle");
    expect(song.source).toBe("user");
    expect(song.format).toBe("chords");
    expect(row.tuningId).toBe("standard");
    expect(row.body).toBeUndefined();
  });

  it("requires artist, title, and body", () => {
    expect(buildUserSong({ artist: "X", title: "", body: "C" }).error).toBeTruthy();
    expect(buildUserSong({ artist: "", title: "Y", body: "C" }).error).toBeTruthy();
    expect(buildUserSong({ artist: "X", title: "Y", body: "  " }).error).toBeTruthy();
  });

  it("resolves tuning from the field, accepting names or spellings", () => {
    const a = buildUserSong({ artist: "A", title: "B", body: "C G", tuning: "dStandard" }, NOW);
    expect(a.row.tuningName).toBe("D Standard");
    const b = buildUserSong({ artist: "A", title: "B", body: "C G", tuning: "D A D G A D" }, NOW);
    expect(b.row.tuningId).toBe("DADGAD");
  });

  it("reads the sheet's own tuning declaration when the field is empty", () => {
    const { row } = buildUserSong(
      { artist: "A", title: "B", body: "Tuning: 1 step down\nC   G   Am" }, NOW);
    expect(row.tuningId).toBe("dStandard");
  });

  it("reads capo from the field or the sheet header", () => {
    expect(buildUserSong({ artist: "A", title: "B", body: "C", capo: 3 }, NOW).song.capo).toBe(3);
    expect(buildUserSong({ artist: "A", title: "B", body: "Capo 5th fret\nC G" }, NOW).song.capo).toBe(5);
    expect(buildUserSong({ artist: "A", title: "B", body: "C G" }, NOW).song.capo).toBeNull();
  });

  it("marks tab format when the body carries a real tab", () => {
    const tab = ["e|--0--|", "B|--1--|", "G|--0--|", "D|--2--|", "A|--3--|", "E|-----|"].join("\n");
    expect(buildUserSong({ artist: "A", title: "B", body: tab }, NOW).song.format).toBe("tab");
  });
});
