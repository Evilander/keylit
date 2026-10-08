import test from "node:test";
import assert from "node:assert/strict";
import { albumCoverage, requestedTrack, REQUESTED_ALBUMS } from "./requested_albums.mjs";
import { chartText, classicTabBodies, classicTabBody, decodePage, fullAlbumRecords, goTabsBody, goTabsListings, normalizedCapo, pickUgCharts, splitAlbumChart, ugPageData, ugRecord, usableChart } from "./album_tabs_fetch.mjs";

test("requested releases retain 57 main tracks and label hidden/bonus tracks separately", () => {
  assert.deepEqual(REQUESTED_ALBUMS.map((album) => album.tracks.length), [10, 11, 11, 12, 13]);
  assert.equal(requestedTrack("Coldplay", "Shiver (ver 2)").trackNumber, 2);
  assert.equal(requestedTrack("Kings of Leon", "Talihina Sky").albumTrackKind, "hidden");
  assert.equal(requestedTrack("Kings of Leon", "Where Nobody Knows").albumTrackKind, "bonus");
  assert.equal(requestedTrack("Coldplay", "Viva La Vida"), null);
  const coverage = albumCoverage([{ artist: "Kings of Leon", title: "Talihina Sky", format: "chords", source: "test" }]);
  assert.equal(coverage[2].covered, 0);
});

test("album fan charts split only explicit, recognized song sections", () => {
  const music = "\nG    D    Em    C\nG    D    Em    C\n";
  const body = `Group/Singer Name: Kings of Leon\nSong: "Trani"${music}Group/Singer Name: Kings of Leon\nSong: "Dusty"${music}Group/Singer Name: Kings of Leon\nSong: "Unrequested"${music}`;
  assert.deepEqual(splitAlbumChart(body, "Kings of Leon").map((record) => [record.title, record.trackNumber]), [["Trani", 5], ["Dusty", 10]]);
});

test("UG ranking retains both chord and tab formats, excludes unrelated and paid entries", () => {
  const listing = (type, id, rating = 4) => ({ type, id, song_name: "Shiver", rating, tab_url: `https://tabs.ultimate-guitar.com/tab/coldplay/shiver-${id}` });
  const picks = pickUgCharts([listing("Chords", 1), listing("Tabs", 2), listing("Official", 3), listing("Chords", 4, 5), { ...listing("Chords", 5), song_name: "Viva La Vida" }], "Coldplay", 1);
  assert.deepEqual(picks.map((pick) => pick.id), [4, 2]);
});

test("combined fan sheets become separately tuned rhythm and lead arrangements", () => {
  const body = 'Tuning: Rhythm (Caleb) - Standard / Lead (Matthew) - Drop D: [DADGBe]\n[Verse]\nG    D    Em    C\nG    D    Em    C\n*KINGS OF LEON - HAPPY ALONE LEAD PARTS*\n[Lead]\nG    D    Em    C\nG    D    Em    C\n';
  const records = fullAlbumRecords([{ ...requestedTrack("Kings of Leon", "Happy Alone"), body }], "https://example.com/album");
  assert.deepEqual(records.map((record) => record.tuning), ["standard", "dropD"]);
  assert.equal(records[0].body.includes("LEAD PARTS"), false);
  assert.equal(records[1].body.includes("Tuning: D A D G B E"), true);
  assert.notEqual(records[0].sourceUrl, records[1].sourceUrl);
  assert.throws(() => fullAlbumRecords([{ ...requestedTrack("Kings of Leon", "Happy Alone"), body: body.replace("[DADGBe]", "[DADGAD]") }], "https://example.com/album"), /Unexpected source lead tuning/);
});

test("chart extraction preserves columns and exact zero capo", () => {
  assert.equal(chartText('<pre>  G   D<br />&lt;riff&gt; &amp;</pre>'), '  G   D\n<riff> &\n');
  assert.equal(chartText('e|--<12>---|\n<---\nG    D\n--->'), 'e|--<12>---|\n<---\nG    D\n--->');
  assert.equal(normalizedCapo("0"), 0);
  assert.equal(normalizedCapo("24"), null);
  assert.equal(normalizedCapo("-1"), null);
  const content = { store: { page: { data: { tab: { id: 17 } } } } };
  assert.equal(ugPageData(`<div data-content="${JSON.stringify(content).replaceAll('"', '&quot;')}">`).tab.id, 17);
});

test("source bytes honor legacy charset and preserve UTF-8 without replacement characters", () => {
  const legacy = Buffer.from('<meta charset="iso-8859-1"><pre id="core">Introdução\nContinuação\nmantém\nG    D    Em    C</pre>', "latin1");
  assert.equal(goTabsBody(decodePage(legacy)), "Introdução\nContinuação\nmantém\nG    D    Em    C");
  assert.equal(decodePage(Buffer.from("A\x92s guitar", "latin1"), "text/html; charset=iso-8859-1"), "A’s guitar");
  assert.equal(decodePage(Buffer.from('<meta charset="utf-8">España — solo', "utf8")), '<meta charset="utf-8">España — solo');
  assert.throws(() => decodePage(Buffer.from([0xc3, 0x28])), /encoded data/i);
});

test("GoTabs extraction keeps tab columns and source formats while restricting album scope", () => {
  const chart = '  e|--0----|\n  B|--1----|\n  G|--0----|\n  D|--2----|\n  A|--3----|\n  E|-------|';
  assert.equal(goTabsBody(`<pre id="core">${chart}</pre><div id="thechords">advert</div>`), chart);
  assert.equal(usableChart(chart), true);
  assert.equal(classicTabBody(`<pre>advertising only</pre><pre>${chart}</pre>`), chart);
  assert.equal(classicTabBodies(`<pre>${chart}</pre><pre>${chart}</pre>`).length, 2);
  const links = '<a href="coldplay/shiver-tab" title="Shiver Tab">Shiver</a><a href="coldplay/shiver-chords" title="Shiver Chords">Shiver</a><a href="coldplay/viva-la-vida-chords" title="Viva La Vida Chords">Viva</a>';
  assert.deepEqual(goTabsListings(links, "Coldplay").map((entry) => entry.format), ["tab", "chords"]);
});

test("records keep source identity, metadata setup, and require parseable music", () => {
  const listing = { type: "Chords", version: 2, id: 17, tab_url: "https://tabs.ultimate-guitar.com/tab/coldplay/shiver-chords-17" };
  const record = ugRecord(listing, { tab: { id: 17 }, tab_view: { meta: { capo: "0", tuning: { value: "D A D G B E" } }, wiki_tab: { content: '[Verse]\n[ch]G[/ch]    [ch]D[/ch]    [ch]Em[/ch]    [ch]C[/ch]\nG    D    Em    C\n' } } }, requestedTrack("Coldplay", "Shiver"));
  assert.equal(record.id, "coldplay--shiver--ug-17");
  assert.equal(record.tuning, "dropD");
  assert.equal(record.capo, 0);
  assert.equal(record.sourceVersion, 2);
  assert.equal(record.trackNumber, 2);
  assert.throws(() => ugRecord(listing, { tab: { artist_name: "Another Band" } }, requestedTrack("Coldplay", "Shiver")), /Source artist/);
  assert.throws(() => ugRecord(listing, { tab: { artist_name: "Coldplay", song_name: "Yellow" } }, requestedTrack("Coldplay", "Shiver")), /Source song/);
  assert.equal(usableChart("This page only explains how to buy a subscription to the tab site."), false);
});
