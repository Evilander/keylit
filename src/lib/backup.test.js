import { describe, it, expect } from "vitest";
import { buildBackup, parseBackup, mergeBackup, reportLine, PREF_KEYS } from "./backup.js";

const song = (id, artist, title, extra = {}) => ({ id, artist, title, body: "[Verse]\nC G Am F", ...extra });

describe("buildBackup / parseBackup", () => {
  it("round-trips a v2 backup", () => {
    const built = buildBackup({
      songs: [song("s1", "Smog", "Cold Blooded Old Times")],
      setlists: [{ id: "sl1", name: "Tonight", entries: [] }],
      log: [{ songKey: "smog--cold-blooded-old-times", at: 123 }],
      prefs: { "keylit.theme.v1": "dark", "not.a.real.key": "x" },
      exportedAt: "2026-07-15",
    });
    expect(built.keylit).toBe(2);
    expect(built.prefs).toEqual({ "keylit.theme.v1": "dark" }); // whitelist holds
    const parsed = parseBackup(JSON.stringify(built));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.songs).toHaveLength(1);
    expect(parsed.data.log).toHaveLength(1);
  });

  it("accepts the v1 shape (songs + setlists only)", () => {
    const v1 = { keylit: 1, songs: [song("a", "Owen", "Bad News")], setlists: [] };
    const parsed = parseBackup(v1);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.keylit).toBe(2);
    expect(parsed.data.songs).toHaveLength(1);
    expect(parsed.data.log).toEqual([]);
  });

  it("rejects non-backups with a human error", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup({ hello: 1 }).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ keylit: 9 })).ok).toBe(false);
  });

  it("drops malformed rows instead of dying", () => {
    const parsed = parseBackup({ keylit: 2, songs: [song("ok", "A", "B"), { id: "no-body" }, null], setlists: [{ nope: 1 }], log: [{ songKey: "x", at: 1 }, { at: 2 }] });
    expect(parsed.ok).toBe(true);
    expect(parsed.data.songs).toHaveLength(1);
    expect(parsed.data.setlists).toHaveLength(0);
    expect(parsed.data.log).toHaveLength(1);
  });

  it("sanitizes hostile field types instead of persisting them", () => {
    const parsed = parseBackup({
      keylit: 2,
      songs: [{ id: "x", body: "C G", title: { evil: true }, artist: 42, capo: "not-a-number", format: "weird", extraJunk: () => {} }],
      setlists: [{ id: "sl", songs: [null, 7, "nope", { songKey: "k", title: 9 }, { noKey: true }] }],
      log: [{ songKey: "k", at: "NaN-ish" }],
    });
    const s = parsed.data.songs[0];
    expect(s.title).toBe("Untitled");       // object title never reaches storage
    expect(s.artist).toBe("Unknown");
    expect(s.capo).toBeNull();
    expect(s.format).toBe("chords");
    expect("extraJunk" in s).toBe(false);   // whitelist: unknown keys shed
    const sl = parsed.data.setlists[0];
    expect(sl.entries).toHaveLength(1);     // null/primitive/keyless entries gone
    expect(sl.entries[0].title).toBe("Untitled");
    expect(parsed.data.log).toHaveLength(0); // unparseable timestamp = no entry
  });

  it("caps a ballooned file instead of loading it whole", () => {
    const many = Array.from({ length: 6000 }, (_, i) => song(`id-${i}`, "A", `T${i}`));
    const parsed = parseBackup({ keylit: 2, songs: many });
    expect(parsed.data.songs.length).toBeLessThanOrEqual(5000);
  });

  it("normalizes legacy songs and v2 entries without dropping repeats or per-entry notes", () => {
    const parsed = parseBackup({ keylit: 2, songs: [], setlists: [{
      id: "sl", name: "Tonight", songs: [
        { songKey: "user:a", source: "user", id: "a", title: "A", key: "Eb", capo: 0 },
        { songKey: "user:a", source: "user", id: "a", title: "A", note: "encore" },
      ],
    }] });
    expect(parsed.ok).toBe(true);
    expect(parsed.data.setlists[0].entries).toHaveLength(2);
    expect(parsed.data.setlists[0].entries[0].capo).toBe(0);
    expect(parsed.data.setlists[0].entries[0].key).toBe("Eb");
    expect(parsed.data.setlists[0].entries[1].note).toBe("encore");
  });

  it("normalizes a backup containing legacy and v2 setlists in one file", () => {
    const parsed = parseBackup({ keylit: 2, songs: [], setlists: [
      { id: "old", name: "Old", songs: [{ songKey: "legacy:key", title: "Legacy" }] },
      { id: "new", name: "New", entries: [{ entryId: "e", songKey: "user:a", source: "user", id: "a", title: "A", key: "F#", capo: 0, note: "count four" }] },
    ] });
    expect(parsed.ok).toBe(true);
    expect(parsed.data.setlists.map((setlist) => setlist.entries.length)).toEqual([1, 1]);
    expect(parsed.data.setlists[1].entries[0]).toMatchObject({ key: "F#", capo: 0, note: "count four" });
  });

  it("whitelists entries and replaces duplicate or oversized entry IDs", () => {
    const parsed = parseBackup({ keylit: 2, songs: [], setlists: [{ id: "sl", entries: [
      { entryId: "same", songKey: "user:a", title: "A", unknown: "nope" },
      { entryId: "same", songKey: "user:a", title: "A again" },
      { entryId: "x".repeat(161), songKey: "user:b", title: "B" },
    ] }] });
    const entries = parsed.data.setlists[0].entries;
    expect(new Set(entries.map((entry) => entry.entryId)).size).toBe(3);
    expect("unknown" in entries[0]).toBe(false);
    expect(entries[2].entryId).toBe("legacy-sl-2-user-b");
  });
});

describe("mergeBackup — never destroys, never duplicates", () => {
  const current = {
    songs: [song("home-1", "Owen", "Bad News")],
    setlists: [{ id: "sl1", name: "Tonight", entries: [] }],
    log: [{ songKey: "owen--bad-news", at: 100 }],
  };

  it("adds new, skips same-id, skips same-song-different-id", () => {
    const incoming = {
      songs: [
        song("home-1", "Owen", "Bad News"),            // same id
        song("away-9", "Owen", "Bad News"),             // same song, other machine's id
        song("away-2", "Joan of Arc", "The Sun Rose"), // genuinely new
      ],
      setlists: [{ id: "sl1", name: "Tonight", entries: [] }, { id: "sl2", name: "Basement", entries: [] }],
      log: [{ songKey: "owen--bad-news", at: 100 }, { songKey: "owen--bad-news", at: 200 }],
    };
    const { songs, setlists, log, report } = mergeBackup(current, incoming);
    expect(songs.map((s) => s.id)).toEqual(["home-1", "away-2"]);
    expect(report).toMatchObject({ songsAdded: 1, songsSkipped: 2, setlistsAdded: 1, setlistsSkipped: 1, logAdded: 1 });
    expect(setlists).toHaveLength(2);
    expect(log.map((e) => e.at)).toEqual([100, 200]);
  });

  it("slug matching survives punctuation drift", () => {
    const incoming = { songs: [song("x", "Cap'n Jazz", "Oh Messy Life")], setlists: [], log: [] };
    const cur = { songs: [song("y", "Capn Jazz", "Oh Messy Life!")], setlists: [], log: [] };
    const { report } = mergeBackup(cur, incoming);
    expect(report.songsSkipped).toBe(1);
  });

  it("caps the merged practice log, keeping the newest", () => {
    const cur = { songs: [], setlists: [], log: Array.from({ length: 490 }, (_, i) => ({ songKey: "a", at: i })) };
    const inc = { songs: [], setlists: [], log: Array.from({ length: 30 }, (_, i) => ({ songKey: "b", at: 1000 + i })) };
    const { log } = mergeBackup(cur, inc, { logCap: 500 });
    expect(log).toHaveLength(500);
    expect(log[log.length - 1].at).toBe(1029); // newest survived
    expect(log[0].at).toBe(20); // oldest 20 fell off
  });

  it("an export re-imported into itself is a perfect no-op", () => {
    const { report } = mergeBackup(current, current);
    expect(report.songsAdded).toBe(0);
    expect(report.setlistsAdded).toBe(0);
    expect(report.logAdded).toBe(0);
  });

  it("names local-wins setlists skipped during merge", () => {
    const incoming = { songs: [], setlists: [{ id: "same", name: "Incoming", entries: [] }], log: [], prefs: {} };
    const current = { songs: [], setlists: [{ id: "same", name: "My Open Mic", entries: [] }], log: [] };
    const out = mergeBackup(current, incoming);
    expect(out.report.setlistNamesSkipped).toEqual(["My Open Mic"]);
    expect(reportLine(out.report)).toMatch(/My Open Mic/);
  });
});

describe("reportLine", () => {
  it("reads like a person wrote it", () => {
    expect(reportLine({ songsAdded: 14, songsSkipped: 3, setlistsAdded: 2, setlistsSkipped: 0, logAdded: 12 }, 1))
      .toBe("14 songs in (3 you already had) · 2 setlists · 12 practice entries · settings restored");
    expect(reportLine({ songsAdded: 1, songsSkipped: 0, setlistsAdded: 0, setlistsSkipped: 0, logAdded: 0 }))
      .toBe("1 song in");
  });
});

it("PREF_KEYS carries exactly the cross-machine settings", () => {
  expect(PREF_KEYS).toContain("keylit.theme.v1");
  expect(PREF_KEYS).toContain("keylit.chart-spelling.v2");
});
