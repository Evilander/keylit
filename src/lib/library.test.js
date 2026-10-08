import { describe, expect, it } from "vitest";
import { albumTracks, chartIdentity, chartSetlistSong, chooseAlbumChart, detectChartFormat, groupLibraryAlbums, groupSongArrangements, libraryStats, matchesChartFormat } from "./library.js";
import { chartExportText } from "./library.js";
import { buildUserSong } from "./usersong.js";

const rows = [
  { id: "a", artist: "Coldplay", title: "Yellow", album: "Parachutes", albumOrder: 2000, trackNumber: 5, format: "tab", capo: 0 },
  { id: "b", artist: "Coldplay", title: "Yellow", album: "Parachutes", albumOrder: 2000, trackNumber: 5, format: "chords", capo: 2 },
  { id: "c", artist: "Coldplay", title: "Don't Panic", album: "Parachutes", albumOrder: 2000, trackNumber: 1, format: "mixed" },
  { id: "d", artist: "Someone Else", title: "Yellow", album: "Parachutes", format: "chords" },
];

describe("library browsing", () => {
  it("exports authoritative standard tuning and no capo over stale body declarations", () => {
    const source = { title: "Yellow", artist: "Coldplay", tuningId: "standard", capo: 0,
      body: "Tuning: Drop D\nCapo 2\nC G Am F" };
    const text = chartExportText(source);
    const { song } = buildUserSong({ title: source.title, artist: source.artist, body: text });
    expect(song.capo).toBeNull();
    expect(song.tuning).toBe("standard");
    expect(text).toContain(source.body);
    expect(text).toContain("Capo: No capo");
  });

  it("exports the full nonstandard spelling and inferred capo on separate lines", () => {
    const text = chartExportText({ title: "X", artist: "A", body: "Capo 3\nC G" }, { tuningId: "dStandard" });
    const { song } = buildUserSong({ title: "X", artist: "A", body: text });
    expect(song.tuning).toBe("dStandard");
    expect(song.capo).toBe(3);
  });
  it("counts songs separately from arrangements without losing any setup", () => {
    expect(libraryStats(rows)).toEqual({ songs: 3, charts: 4, artists: 2, albums: 2 });
    expect(groupSongArrangements(rows)[0].rows.map((row) => row.capo)).toEqual([0, 2]);
    expect(rows).toHaveLength(4);
  });

  it("keeps acoustic arrangements and Unicode titles distinct", () => {
    expect(groupSongArrangements([
      { artist: "A", title: "Song" }, { artist: " a ", title: " SONG " },
      { artist: "A", title: "Song (Acoustic)" }, { artist: "A", title: "É" }, { artist: "A", title: "E" },
    ])).toHaveLength(4);
  });

  it("folds punctuation variants while keeping artist identity", () => {
    expect(groupSongArrangements([
      { artist: "Wilco", title: "It's Just That Simple" },
      { artist: "Wilco", title: "Its Just That Simple" },
      { artist: "Wilco", title: "Blue-Eyed Soul" },
      { artist: "Wilco", title: "Blue Eyed Soul" },
    ])).toHaveLength(2);
  });

  it("groups albums by artist and orders tracks without mutating the rows", () => {
    const albums = groupLibraryAlbums(rows);
    expect(albums).toHaveLength(2);
    expect(albums[0].songs.map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(rows[0].id).toBe("a");
    expect(groupLibraryAlbums([{ artist: "A", title: "Unassigned" }])).toEqual([]);
  });

  it("shows mixed charts in both usable format filters", () => {
    expect(rows.filter((row) => matchesChartFormat(row, "tabs")).map((row) => row.id)).toEqual(["a", "c"]);
    expect(rows.filter((row) => matchesChartFormat(row, "chords")).map((row) => row.id)).toEqual(["b", "c", "d"]);
  });

  it("derives playable formats from the chart instead of a source-wide label", () => {
    const tab = ["e|--0--|", "B|--1--|", "G|--0--|", "D|--2--|", "A|--3--|", "E|-----|"].join("\n");
    expect(detectChartFormat(tab, "chords")).toBe("tab");
    expect(detectChartFormat("[Verse]\nC G Am F\n", "tab")).toBe("chords");
    expect(detectChartFormat(`C G Am F\n${tab}`)).toBe("mixed");
    expect(detectChartFormat("A technique illustration without text music", "tab")).toBe("tab");
  });
});

describe("album sessions", () => {
  it("orders hidden tracks after their host track and keeps unnumbered charts", () => {
    const tracks = albumTracks({ songs: [
      { artist: "A", title: "Hidden", trackNumber: 10, albumTrackKind: "hidden" },
      { artist: "A", title: "Finale", trackNumber: 10, albumTrackKind: "main" },
      { artist: "A", title: "Opening", trackNumber: 1 },
      { artist: "A", title: "Unnumbered" },
      { artist: "A", title: "Hidden", trackNumber: 10, albumTrackKind: "hidden" },
    ] });
    expect(tracks.map((track) => track.title)).toEqual(["Opening", "Finale", "Hidden", "Unnumbered"]);
    expect(tracks[2].kind).toBe("hidden");
    expect(tracks[2].rows).toHaveLength(2);
    expect(tracks[3].trackNumber).toBe(Infinity);
  });

  it("honors explicit source choices over preferences and falls back if a chart vanished", () => {
    const chords = { source: "fan", id: "same", format: "chords" };
    const tab = { source: "ug", id: "same", format: "tab" };
    const mixed = { source: "ug", id: "mixed", format: "mixed" };
    const track = { rows: [chords, mixed, tab] };
    expect(chooseAlbumChart(track)).toBe(tab);
    expect(chooseAlbumChart(track, { preference: "chords" })).toBe(chords);
    expect(chooseAlbumChart(track, { choice: chartIdentity(chords) })).toBe(chords);
    expect(chooseAlbumChart(track, { choice: "missing/old" })).toBe(tab);
    expect(chooseAlbumChart({ rows: [chords] })).toBe(chords);
  });

  it("keeps distinct acoustic charts and artists even with matching track numbers", () => {
    expect(albumTracks({ songs: [
      { artist: "A", title: "Song", trackNumber: 1 },
      { artist: "A", title: "Song (Acoustic)", trackNumber: 1 },
      { artist: "B", title: "Song", trackNumber: 1 },
    ] })).toHaveLength(3);
  });

  it("keeps known extra tracks optional when another source has no track-kind metadata", () => {
    const tracks = albumTracks({ songs: [
      { artist: "A", title: "Hidden", albumTrackKind: "hidden" }, { artist: "A", title: "Hidden" },
      { artist: "A", title: "Bonus", albumTrackKind: "bonus" }, { artist: "A", title: "Bonus" },
    ] });
    expect(tracks.map((track) => track.kind)).toEqual(["hidden", "bonus"]);
  });

  it("saves authoritative explicit zero capo and tuning over conflicting body headers", () => {
    expect(chartSetlistSong({ artist: "A", title: "Song", source: "fan", id: "r", tuningId: "standard", capo: 0 },
      { body: "Tuning: Drop D\nCapo 4\nC G" })).toMatchObject({ source: "fan", id: "r", tuning: "standard", capo: 0 });
  });

  it("resolves missing setup from the actual chart and records zero when no capo is declared", () => {
    const row = { artist: "A", title: "Song", source: "fan", id: "r" };
    expect(chartSetlistSong(row, { body: "Tuning: Drop D\nCapo 4\nC G" })).toMatchObject({ tuning: "dropD", capo: 4 });
    expect(chartSetlistSong(row, { body: "C G" })).toMatchObject({ tuning: "standard", capo: 0 });
  });
});
