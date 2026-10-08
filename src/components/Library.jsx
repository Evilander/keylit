// Library.jsx — the catalog. Alphabetical artist index (hairline rows, no
// cards); expand an artist to see songs grouped BY ALBUM. A tuning filter bar
// lets you click a tuning to see every song in it, across all artists.
// "Setlist" mode turns rows into a picker: check songs across any artists,
// stack them straight into the Bench Book.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronRight, X, Plus, Disc3, ListMusic, CircleCheck, Circle, Download } from "lucide-react";
import { invalidateManifest, loadManifest, loadSong, groupByArtist, isCoreArtist, SOURCE_LABEL } from "../corpus.js";
import { userSongbook, benchBook } from "../storage.js";
import { loadAlbumCharts } from "../albumloader.js";
import { chartExportText, chartSetlistSong, groupLibraryAlbums, groupSongArrangements, libraryStats, matchesChartFormat } from "../lib/library.js";
import { makeZip } from "../lib/zip.js";
import { buildBackup, parseBackup, mergeBackup, reportLine, PREF_KEYS, BACKUP_SCOPE_NOTICE } from "../lib/backup.js";
import AddSong from "./AddSong.jsx";
import TabHunt from "./TabHunt.jsx";
import Ear from "./Ear.jsx";
import AlbumSession from "./AlbumSession.jsx";
import { C, MONO, DISPLAY } from "../ui/theme.js";

// Browse state survives leaving the room (Back returns you to the same
// search, tuning filter, and expanded artists — not a collapsed index).
const remembered = { q: "", tuning: null, format: "all", browse: "artists", open: [], albumSession: null };

export default function Library({ onOpen, onSetlist, onPerform, onPaste, onDemo, onHeard, potd, onPotd, quote }) {
  const [fetched, setFetched] = useState(null);
  const [userRows, setUserRows] = useState(() => userSongbook.rows());
  const [adding, setAdding] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [q, setQ] = useState(remembered.q);
  const [tuning, setTuning] = useState(remembered.tuning); // tuningId or null
  const [format, setFormat] = useState(remembered.format);
  const [browse, setBrowse] = useState(remembered.browse);
  const [open, setOpen] = useState(() => new Set(remembered.open));
  const [allTunings, setAllTunings] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Map()); // id -> manifest row
  const [setName, setSetName] = useState("Tonight");
  const [destId, setDestId] = useState("new");
  const [exporting, setExporting] = useState(null); // { done, total } while a zip builds
  const [albumSession, setAlbumSession] = useState(remembered.albumSession);
  const librarySearch = useRef(null);
  const backupInput = useRef(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const selectionRequest = useRef(null);
  const exportRequest = useRef(null);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [q, tuning, format, browse]);
  useEffect(() => () => exportRequest.current?.abort(), []);

  useEffect(() => { remembered.q = q; }, [q]);
  useEffect(() => { remembered.tuning = tuning; }, [tuning]);
  useEffect(() => { remembered.format = format; }, [format]);
  useEffect(() => { remembered.browse = browse; }, [browse]);
  useEffect(() => { remembered.open = [...open]; }, [open]);
  useEffect(() => { remembered.albumSession = albumSession; }, [albumSession]);
  useEffect(() => () => selectionRequest.current?.abort(), []);

  const toggleSel = (row) => setSel((m) => {
    if (savingSelection) return m;
    const n = new Map(m);
    const key = `${row.source}/${row.id}`;
    n.has(key) ? n.delete(key) : n.set(key, row);
    return n;
  });

  const makeSetlist = async () => {
    if (!sel.size || selectionRequest.current) return;
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSavingSelection(true);
    setImportNote("");
    try {
      const rows = [...sel.values()];
      const songs = await loadAlbumCharts(rows, { loadSong, signal: controller.signal });
      if (controller.signal.aborted) return;
      const target = benchBook.saveSetlistSongs({
        id: destId === "new" ? null : destId, name: setName.trim() || "Tonight",
        songs: rows.map((row, index) => chartSetlistSong(row, songs[index])),
      });
      setSel(new Map());
      setSelecting(false);
      onSetlist?.(target);
    } catch (failure) {
      if (!controller.signal.aborted) setImportNote(`${failure.message} Your selection is still here; the setlist was not saved.`);
    } finally {
      if (!controller.signal.aborted) setSavingSelection(false);
      selectionRequest.current = null;
    }
  };

  useEffect(() => { let on = true; loadManifest().then((r) => { if (on) setFetched(r); }); return () => { on = false; }; }, []);

  // A finished tab hunt rewrote the index on disk — pull the fresh shelf in place.
  const refresh = () => { invalidateManifest(); loadManifest().then(setFetched); };

  const download = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // Export the CURRENT VIEW (search/tuning filter applied; everything when
  // unfiltered, or just the picked songs in Setlist mode) as a zip of plain
  // .txt charts — the portable, future-proof form of a tab library.
  const exportZip = async (rowsToExport) => {
    if (exportRequest.current || !rowsToExport.length) return;
    const controller = new AbortController();
    exportRequest.current = controller;
    const timer = setTimeout(() => {
      setImportNote("Export timed out. Try a smaller selection.");
      controller.abort();
      setExporting(null);
    }, 120000);
    controller.signal.addEventListener("abort", () => { clearTimeout(timer); if (exportRequest.current === controller) exportRequest.current = null; }, { once: true });
    setImportNote(null);
    setExporting({ done: 0, total: rowsToExport.length });
    const clean = (s) => (s || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim() || "Untitled";
    const entries = [];
    const seen = new Set();
    let next = 0;
    let failed = 0, completed = 0;
    try {
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (!controller.signal.aborted && next < rowsToExport.length) {
          if (++completed % 32 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
          if (controller.signal.aborted || next >= rowsToExport.length) return;
          const row = rowsToExport[next++];
          const song = await loadSong(row, { signal: controller.signal, cache: false }).catch(() => null);
          if (controller.signal.aborted) return;
          setExporting((x) => (x ? { ...x, done: x.done + 1 } : x));
          if (!song?.body) { failed++; continue; }
          let name = `${clean(row.artist || "Various")}/${clean(row.title)}`;
          if (seen.has(name)) name = `${name} (${row.source})`;
          while (seen.has(name)) name += "_";
          seen.add(name);
          entries.push({ name: `${name}.txt`, data: chartExportText(song, row) });
        }
      }));
      if (controller.signal.aborted) return;
      if (!entries.length) { setImportNote("No charts could be loaded for export. Check the connection and try again."); return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const stamp = new Date().toISOString().slice(0, 10);
      download(`keylit-charts-${stamp}.zip`, new Blob([makeZip(entries)], { type: "application/zip" }));
      if (failed) setImportNote(`${entries.length} charts exported; ${failed} could not be loaded.`);
    } catch {
      if (!controller.signal.aborted) setImportNote("The chart export failed. Your library is unchanged; try a smaller selection.");
    } finally {
      clearTimeout(timer);
      if (exportRequest.current === controller) {
        exportRequest.current = null;
        if (!controller.signal.aborted) setExporting(null);
      }
    }
  };

  // Your whole musical self as one JSON file: songs, setlists, practice log,
  // and the prefs that make a fresh machine feel like yours. Take it to the
  // other computer, the practice space, the gig.
  const exportBackup = () => {
    const prefs = {};
    for (const k of PREF_KEYS) {
      try { const v = localStorage.getItem(k); if (v != null) prefs[k] = v; } catch { /* storage optional */ }
    }
    const data = buildBackup({
      songs: userSongbook.all(),
      setlists: benchBook.raw().setlists,
      log: benchBook.raw().log,
      prefs,
      exportedAt: new Date().toISOString(),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    download(`keylit-songbook-${stamp}.json`, new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  };

  const [importNote, setImportNote] = useState(null);
  // Identical charts merge; different arrangements and setups remain available.
  const importBackup = async (file) => {
    if (!file) return;
    const text = await file.text().catch(() => null);
    const parsed = parseBackup(text);
    if (!parsed.ok) { setImportNote(parsed.error); return; }
    const cur = { songs: userSongbook.all(), ...benchBook.raw() };
    const { songs, setlists, log, report } = mergeBackup(cur, parsed.data);
    // Each write is atomic per key; a quota failure leaves the ORIGINAL data
    // for that key untouched — but we must say exactly what landed.
    let wroteSongs = false, wroteBench = false;
    try { userSongbook.replaceAll(songs); wroteSongs = true; } catch { /* quota */ }
    if (wroteSongs) { try { benchBook.replace({ setlists, log }); wroteBench = true; } catch { /* quota */ } }
    if (!wroteSongs) {
      setImportNote("Storage refused the import — nothing was changed. Free some space and try again.");
      return;
    }
    let prefsApplied = 0;
    for (const [k, v] of Object.entries(parsed.data.prefs || {})) {
      try { localStorage.setItem(k, v); prefsApplied++; } catch { /* noop */ }
    }
    setUserRows(userSongbook.rows());
    setImportNote(
      (wroteBench ? reportLine(report, prefsApplied) : `${report.songsAdded} songs in — but setlists/log would not fit (storage full); your originals are untouched`) +
      (prefsApplied ? " (settings land on next launch)" : "")
    );
  };
  // Your songs join the same catalog, grouped and styled like everyone else.
  const rows = useMemo(() => (fetched === null ? null : [...userRows, ...fetched]), [fetched, userRows]);

  const removeUserSong = (id) => { userSongbook.remove(id); setUserRows(userSongbook.rows()); };
  const onSaved = (song) => {
    setUserRows(userSongbook.rows());
    setAdding(false);
    setOpen((s) => new Set(s).add(song.artist));
  };

  const tuningFacets = useMemo(() => {
    if (!rows) return [];
    const by = new Map();
    for (const r of rows) {
      const id = r.tuningId || "standard";
      if (!by.has(id)) by.set(id, { id, name: r.tuningName || (id === "standard" ? "Standard" : id), count: 0 });
      by.get(id).count++;
    }
    return [...by.values()].filter((t) => t.count >= 2).sort((a, b) => b.count - a.count);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      matchesChartFormat(r, format) &&
      (!tuning || (r.tuningId || r.tuning || "standard") === tuning) &&
      (!needle || r.artist?.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle) || (r.album || "").toLowerCase().includes(needle)));
  }, [rows, q, tuning, format]);

  const autoOpen = q.trim().length > 0 || !!tuning;
  const bundles = useMemo(() => groupSongArrangements(filtered), [filtered]);
  const albums = useMemo(() => groupLibraryAlbums(filtered), [filtered]);
  const pageSize = browse === "albums" ? 10 : 100;
  const resultCount = browse === "albums" ? albums.length : tuning ? filtered.length : bundles.length;
  const pageCount = browse === "albums" || autoOpen ? Math.ceil(resultCount / pageSize) : 1;
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const visibleRows = useMemo(() => {
    if (!autoOpen || browse === "albums") return filtered;
    if (tuning) return filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    return bundles.slice(currentPage * pageSize, (currentPage + 1) * pageSize).flatMap(b => b.rows);
  }, [filtered, bundles, autoOpen, browse, tuning, currentPage, pageSize]);
  const groups = useMemo(() => groupByArtist(visibleRows), [visibleRows]);
  const stats = useMemo(() => libraryStats(rows || []), [rows]);
  const fullAlbums = useMemo(() => groupLibraryAlbums(rows || []), [rows]);
  const matchingAlbumKeys = new Set(albums.map(album => album.key));
  const visibleAlbums = fullAlbums.filter(album => matchingAlbumKeys.has(album.key)).slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const currentAlbum = fullAlbums.find((album) => album.key === albumSession?.key);
  const workOnAlbum = (album) => {
    exportRequest.current?.abort();
    setExporting(null);
    selectionRequest.current?.abort();
    setSavingSelection(false);
    setAlbumSession({ key: album.key });
  };
  const workOnAlbumRow = (row) => {
    const [album] = groupLibraryAlbums([row]);
    if (album) workOnAlbum(album);
  };
  const toggle = (artist) => setOpen((s) => { const n = new Set(s); n.has(artist) ? n.delete(artist) : n.add(artist); return n; });
  // The shelf vs. the stacks: the owner's artists stay on the index; anthology
  // fill folds into one Miscellaneous drawer. A search sees everything flat.
  const { shelf, misc } = useMemo(() => {
    if (autoOpen) return { shelf: groups, misc: [] };
    const shelf = [], misc = [];
    for (const g of groups) (isCoreArtist(g.artist, g.count) ? shelf : misc).push(g);
    return { shelf, misc };
  }, [groups, autoOpen]);
  const miscCount = useMemo(() => misc.reduce((n, g) => n + g.count, 0), [misc]);

  if (rows === null) return <p style={{ color: C.muted }}>Loading the library…</p>;

  if (currentAlbum) return <AlbumSession key={currentAlbum.key} album={currentAlbum} session={albumSession}
    onChange={setAlbumSession} onOpen={onOpen} onSetlist={onSetlist} onPerform={onPerform}
    onBack={() => { setAlbumSession(null); requestAnimationFrame(() => librarySearch.current?.focus()); }} />;

  // No songs at all — invite, don't apologize.
  if (rows.length === 0) {
    return (
      <div className="kl-section" style={{ maxWidth: 640 }}>
        <div className="kl-eyebrow">The catalog</div>
        <h1 className="kl-title" style={{ marginTop: 4 }}>Bring a song</h1>
        <p className="kl-prose" style={{ marginTop: 12 }}>
          This copy of Keylit ships without a bundled songbook. Add any chord
          chart or guitar tab — Ultimate-Guitar, ChordPro, plain chords over
          lyrics, 6-line ASCII tab — and it becomes a playable piano: lit keys,
          numbers, fingerings, the works.
        </p>
        {adding ? (
          <AddSong onSaved={onSaved} onClose={() => setAdding(false)} />
        ) : (
          <div className="flex items-center" style={{ gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button className="bench-btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add a song to your library</button>
            <button className="bench-btn" onClick={() => setHearing((v) => !v)}><Disc3 size={15} /> Hear a record</button>
            <button className="bench-btn" onClick={() => onPaste?.()}>Just paste one</button>
            <button className="bench-btn" onClick={() => onDemo?.()}>Try the demo song</button>
          </div>
        )}
        {hearing && <Ear onLoadSheet={onHeard} onClose={() => setHearing(false)} />}
      </div>
    );
  }

  const tuningName = tuning && (tuningFacets.find((t) => t.id === tuning)?.name || tuning);
  const shownFacets = allTunings ? tuningFacets : tuningFacets.slice(0, 8);

  return (
    <div className={`kl-section library-room${q.trim() || tuning || format !== "all" || browse === "albums" ? " library-browsing" : ""}`}>
      {/* The hero speaks in borrowed lines — a new one each time the app opens. */}
      <div className="kl-eyebrow faint">The songbook</div>
      {quote && (
        <>
          <h1 className="kl-title hero library-quote" style={{ margin: "14px 0 0", maxWidth: 680,
            "--library-quote-size": quote.q.length > 150 ? "30px" : quote.q.length > 100 ? "38px" : quote.q.length > 70 ? "44px" : undefined }}>
            {quote.q}
          </h1>
          <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: "0.05em", color: C.muted, marginTop: 14 }}>— {quote.by}</div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 30 }}>
        <span className="kl-meta library-count">{stats.songs.toLocaleString()} songs <span>· {stats.charts.toLocaleString()} charts · {stats.artists.toLocaleString()} artists</span></span>
        <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap" }}>
          <button className={`bench-btn${selecting ? " primary" : ""}`} style={{ padding: "7px 13px", fontSize: 13 }}
            disabled={savingSelection}
            onClick={() => { setSelecting((v) => !v); setSel(new Map()); }} aria-pressed={selecting}
            title="pick songs across the library and stack them into a setlist">
            <ListMusic size={14} /> {selecting ? "picking…" : "Setlist"}
          </button>
          <button className="bench-btn" style={{ padding: "7px 13px", fontSize: 13 }} onClick={() => setHearing((v) => !v)}>
            <Disc3 size={14} /> Hear a record
          </button>
          <button className="bench-btn" style={{ padding: "7px 13px", fontSize: 13 }} onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> Add a song
          </button>
          <button className="bench-btn" style={{ padding: "7px 13px", fontSize: 13, opacity: exporting ? 0.6 : 1 }}
            disabled={!!exporting}
            onClick={() => exportZip(selecting && sel.size ? [...sel.values()] : filtered)}
            title={selecting && sel.size
              ? `download the ${sel.size} picked songs as .txt charts in a zip`
              : `download ${q.trim() || tuning ? "the current view" : "the whole library"} as .txt charts in a zip`}>
            <Download size={14} /> {exporting ? `zipping ${exporting.done}/${exporting.total}…` : "Export"}
          </button>
        </div>
      </div>
      {!exporting && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {importNote && <span style={{ fontSize: 11.5, color: C.toneText, fontFamily: MONO }}>{importNote}</span>}
          <button onClick={exportBackup} style={quietLink}
            title="songs + setlists + practice log + settings — one JSON file for the other machine">
            backup your songbook (.json)
          </button>
          <button style={quietLink} onClick={() => backupInput.current?.click()}
            title="merge a backup from another machine — nothing here gets overwritten">import a backup</button>
          <input ref={backupInput} type="file" accept=".json,application/json" style={{ display: "none" }}
            onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ""; }} />
          <p style={{ width: "100%", margin: 0, fontSize: 12, color: C.muted }}>{BACKUP_SCOPE_NOTICE}</p>
        </div>
      )}

      {hearing && <Ear onLoadSheet={onHeard} onClose={() => setHearing(false)} />}
      {adding && <AddSong onSaved={onSaved} onClose={() => setAdding(false)} />}

      <div className="bench-cols library-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 40, alignItems: "start", marginTop: 8 }}>
      <div style={{ minWidth: 0 }}>
      <div className="library-search" style={{ position: "relative", margin: "10px 0 10px" }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.faint }} />
        <input ref={librarySearch} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, albums, artists" aria-label="Search the library"
          style={{ width: "100%", padding: "12px 38px 12px 34px", fontFamily: "var(--kl-sans)", fontSize: 14, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6 }} />
        {q && <button className="library-clear" onClick={() => setQ("")} aria-label="Clear library search"><X size={15} /></button>}
      </div>
      <div className="library-viewbar">
        <div className="library-switch" role="group" aria-label="Browse library by">
          <button aria-pressed={browse === "artists"} onClick={() => setBrowse("artists")}>Artists</button>
          <button aria-pressed={browse === "albums"} onClick={() => setBrowse("albums")}>Albums <span>{stats.albums}</span></button>
        </div>
        <div className="library-switch" role="group" aria-label="Chart format">
          {[["all", "All charts"], ["tabs", "Tabs"], ["chords", "Chord charts"]].map(([id, label]) => (
            <button key={id} aria-pressed={format === id} onClick={() => setFormat(id)}>{label}</button>
          ))}
        </div>
      </div>
      <TabHunt onDone={refresh} />

      {tuningFacets.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          <span className="kl-eyebrow" style={{ marginRight: 4 }}>Tuning</span>
          {shownFacets.map((t) => {
            const active = tuning === t.id;
            return (
              <button key={t.id} onClick={() => setTuning(active ? null : t.id)}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  color: active ? "#FAFAF8" : C.toneText, background: active ? C.toneUi : C.panel, border: `1px solid ${active ? C.toneUi : C.line}` }}>
                {t.name}
              </button>
            );
          })}
          {tuningFacets.length > 8 && (
            <button onClick={() => setAllTunings((v) => !v)}
              style={{ fontFamily: "var(--kl-sans)", fontSize: 12, fontWeight: 600, color: C.muted, background: "transparent", border: 0, cursor: "pointer", padding: "4px 6px" }}>
              {allTunings ? "fewer" : `+${tuningFacets.length - 8} more`}
            </button>
          )}
        </div>
      )}

      {exporting && <div role="status">Exporting {exporting.done} of {exporting.total} charts
        <button className="bench-btn" onClick={() => { exportRequest.current?.abort(); setExporting(null); setImportNote("Export cancelled."); }}>Cancel export</button>
      </div>}
      {pageCount > 1 && <nav aria-label="Library result pages" className="flex items-center" style={{ gap: 12 }}>
        <button className="bench-btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</button>
        <span role="status">{browse === "albums" ? "Albums" : tuning ? "Charts" : "Matching songs"} {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, resultCount)} of {resultCount}</span>
        <button className="bench-btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next page</button>
      </nav>}
      {!filtered.length && <div className="library-empty" role="status">
        <h2>No charts match this view</h2>
        <p>Try a song title, another tuning, or all chart formats.</p>
        <button className="bench-btn" onClick={() => { setQ(""); setTuning(null); setFormat("all"); }}>Clear filters</button>
      </div>}
      {browse === "albums" ? (
        <div className="library-albums">
          {visibleAlbums.map((album) => {
            const isOpen = autoOpen || open.has(album.key);
            const bundles = groupSongArrangements(album.songs);
            return <section key={album.key} className="library-album">
              <button className="library-album-heading" aria-expanded={isOpen} onClick={() => toggle(album.key)}>
                <span className="library-album-year">{album.year || "LP"}</span>
                <span className="library-album-title"><span>{album.artist}</span><strong>{album.album}</strong></span>
                <span className="kl-meta">{bundles.length} {bundles.length === 1 ? "song" : "songs"}</span>
                <ChevronRight size={16} style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
              </button>
              {isOpen && <button className="library-album-work" onClick={() => workOnAlbum(album)} aria-label={`Work through ${album.album} by ${album.artist}`}><ListMusic size={14} /> Work through album</button>}
              {isOpen && <AlbumSongs bundles={bundles} onOpen={onOpen} onTuning={setTuning} onRemove={removeUserSong}
                selecting={selecting} sel={sel} onToggleSel={toggleSel} />}
            </section>;
          })}
          {!albums.length && filtered.length > 0 && <p className="kl-prose">These charts have no album attribution. Browse Artists to see them.</p>}
        </div>
      ) : tuning ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 6px" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink }}>Songs in {tuningName}</span>
            <span className="kl-meta">{filtered.length}</span>
            <button onClick={() => setTuning(null)} className="chip" style={{ padding: "3px 10px", fontSize: 12 }}><X size={12} /> clear</button>
          </div>
          <div className="kl-rows" style={{ marginTop: 4 }}>
            {visibleRows.slice().sort((a, b) => (a.artist || "").localeCompare(b.artist || "") || a.title.localeCompare(b.title)).map((s) => (
              <button key={`${s.source}/${s.id}`} onClick={() => (selecting ? toggleSel(s) : onOpen?.(s))}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: `1px solid ${C.line}`, background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                {selecting && <SelMark on={sel.has(`${s.source}/${s.id}`)} />}
                <span style={{ fontFamily: DISPLAY, fontSize: 15, color: C.muted, flex: "0 1 160px", minWidth: 0 }}>{s.artist || "Various"}</span>
                <span style={{ fontFamily: "var(--kl-sans)", fontSize: 14.5, color: C.ink, flex: 1 }}>{s.title}</span>
                {s.capo ? <Tag color={C.rootText}>capo {s.capo}</Tag> : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="kl-rows">
          {shelf.map((g) => (
            <ArtistGroup key={g.artist} g={g} partial={autoOpen && pageCount > 1} isOpen={autoOpen || open.has(g.artist)} onToggle={toggle}
              onOpen={onOpen} onTuning={setTuning} onRemove={removeUserSong} onAlbum={workOnAlbumRow}
              selecting={selecting} sel={sel} onToggleSel={toggleSel} />
          ))}
          {misc.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.line}` }}>
              <button onClick={() => toggle("__misc__")} aria-expanded={open.has("__misc__")}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 4px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}>
                <ChevronRight size={15} style={{ color: C.faint, transform: open.has("__misc__") ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }} />
                <span style={{ fontFamily: DISPLAY, fontSize: 21, color: C.muted, flex: 1, minWidth: 0, whiteSpace: "nowrap" }}>Miscellaneous</span>
                <span className="kl-meta" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>{misc.length} artists · {miscCount} charts</span>
                <span className="kl-meta kl-hide-sm" style={{ color: C.faint, flex: "0 0 auto", whiteSpace: "nowrap" }}>anthologies &amp; strays</span>
              </button>
              {open.has("__misc__") && (
                <div style={{ paddingBottom: 10, paddingLeft: 18, borderLeft: `2px solid ${C.line}`, marginLeft: 10 }}>
                  {misc.map((g) => (
                    <ArtistGroup key={g.artist} g={g} isOpen={open.has(g.artist)} onToggle={toggle} compact
                      onOpen={onOpen} onTuning={setTuning} onRemove={removeUserSong} onAlbum={workOnAlbumRow}
                      selecting={selecting} sel={sel} onToggleSel={toggleSel} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {potd && (
        <aside className="faceplate hero kl-rise" style={{ position: "sticky", top: 12 }}>
          <div className="kl-eyebrow" style={{ color: C.rootText }}>Progression of the day</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, marginTop: 12, color: C.ink }}>{potd.name}</div>
          <div className="kl-meta" style={{ marginTop: 3 }}>{potd.keyName} · {potd.style}</div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, marginTop: 16, letterSpacing: "0.04em", color: C.ink, overflowWrap: "anywhere" }}>
            {potd.sheet.split(/\s+/).filter(Boolean).join("  ")}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: C.muted, margin: "10px 0 0" }}>{potd.line}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button className="bench-btn primary" onClick={() => onPotd?.("hear")}>Hear it</button>
            <button className="bench-btn" onClick={() => onPotd?.("open")}>Take it to the bench</button>
          </div>
        </aside>
      )}
      </div>

      {selecting && (
        <div style={{ position: "sticky", bottom: 12, marginTop: 16, zIndex: 20 }}>
          <div className="faceplate" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap", boxShadow: "0 8px 28px rgba(30,25,18,0.18)" }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: sel.size ? C.toneText : C.faint }}>
              {sel.size} picked
            </span>
            <select value={destId} disabled={savingSelection} onChange={(e) => setDestId(e.target.value)} aria-label="destination setlist"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 13 }}>
              <option value="new">new setlist…</option>
              {benchBook.setlists().map((sl) => <option key={sl.id} value={sl.id}>add to: {sl.name}</option>)}
            </select>
            {destId === "new" && (
              <input value={setName} disabled={savingSelection} onChange={(e) => setSetName(e.target.value)} aria-label="setlist name" placeholder="setlist name"
                style={{ width: 150, background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none" }} />
            )}
            <button className="bench-btn primary" disabled={!sel.size || savingSelection} onClick={makeSetlist} style={{ opacity: sel.size ? 1 : 0.5 }}>
              <ListMusic size={14} /> {savingSelection ? "Checking charts…" : "To the Bench Book"}
            </button>
            <button className="bench-btn" onClick={() => { selectionRequest.current?.abort(); setSavingSelection(false); setSelecting(false); setSel(new Map()); }}>cancel</button>
            <span style={{ fontSize: 12, color: C.faint, marginLeft: "auto" }} className="kl-hide-sm">
              click songs to pick them — any artist, any tuning
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtistGroup({ g, partial, isOpen, onToggle, onOpen, onTuning, onRemove, onAlbum, selecting, sel, onToggleSel, compact }) {
  const [songPage, setSongPage] = useState(0);
  const allSongs = g.albums.flatMap((a) => a.songs);
  const allBundles = groupSongArrangements(allSongs);
  const currentSongPage = Math.min(songPage, Math.max(0, Math.ceil(allBundles.length / 100) - 1));
  const shown = new Set(allBundles.slice(currentSongPage * 100, (currentSongPage + 1) * 100).map(b => b.key));
  const songCount = groupSongArrangements(allSongs).length;
  const sources = [...new Set(allSongs.map((s) => s.source))].map((s) => SOURCE_LABEL[s] || s);
  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      <button onClick={() => onToggle(g.artist)} aria-expanded={isOpen}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: compact ? "9px 4px" : "13px 4px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}>
        <ChevronRight size={15} style={{ color: C.faint, flex: "0 0 auto", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }} />
        <span title={g.artist} style={{ fontFamily: DISPLAY, fontSize: compact ? 16.5 : 21, color: C.ink, flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.artist}</span>
        <span className="kl-meta" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>{songCount} {songCount === 1 ? "song" : "songs"} <span className="library-chart-count">· {g.count} charts{partial ? " on this page" : ""}</span></span>
      </button>
      {isOpen && (
        <div style={{ paddingBottom: 10 }}>
          {allBundles.length > 100 && <nav aria-label={`${g.artist} song pages`}>
            <button className="bench-btn" disabled={!currentSongPage} onClick={() => setSongPage(currentSongPage - 1)}>Previous songs</button>
            <span role="status"> Songs {currentSongPage * 100 + 1}–{Math.min((currentSongPage + 1) * 100, allBundles.length)} of {allBundles.length} </span>
            <button className="bench-btn" disabled={(currentSongPage + 1) * 100 >= allBundles.length} onClick={() => setSongPage(currentSongPage + 1)}>Next songs</button>
          </nav>}
          {g.albums.filter(al => groupSongArrangements(al.songs).some(b => shown.has(b.key))).map((al, ai) => (
            <div key={ai}>
              {g.multiAlbum && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 4px 4px 31px" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 15.5, color: C.muted }}>{al.album || "Other"}</span>
                  <span className="kl-meta" style={{ color: C.faint, fontSize: 11 }}>{groupSongArrangements(al.songs).length} songs</span>
                  {al.album && al.songs[0]?.album === al.album && <button className="library-album-work" onClick={() => onAlbum?.(al.songs[0])}
                    aria-label={`Work through ${al.album} by ${al.songs[0].artist}`}><ListMusic size={13} /> Work through album</button>}
                  <span style={{ flex: 1, height: 1, background: C.line, marginLeft: 4 }} />
                </div>
              )}
              {groupSongArrangements(al.songs).filter(b => shown.has(b.key)).map((bundle) => (
                <SongBundle key={bundle.key} bundle={bundle} onOpen={onOpen} onTuning={onTuning} onRemove={onRemove}
                  selecting={selecting} sel={sel} onToggleSel={onToggleSel} />
              ))}
            </div>
          ))}
          {/* Provenance reads like a colophon — once, on the open shelf,
              instead of shouted from every closed row. */}
          <div className="kl-meta" style={{ color: C.faint, fontSize: 10.5, padding: "8px 4px 2px 31px" }}>
            from {sources.join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}

function SelMark({ on }) {
  return on
    ? <CircleCheck size={16} style={{ color: C.toneUi, flex: "0 0 auto" }} />
    : <Circle size={16} style={{ color: C.faint, flex: "0 0 auto" }} />;
}

function SongBundle({ bundle, onOpen, onTuning, onRemove, selecting, sel, onToggleSel }) {
  const [expanded, setExpanded] = useState(false);
  const [first, ...alternates] = bundle.rows;
  return <div className="library-song-bundle">
    <div className="library-song-line">
      <SongRow s={first} onOpen={onOpen} onTuning={onTuning} onRemove={onRemove}
        selecting={selecting} selected={sel.has(`${first.source}/${first.id}`)} onToggle={onToggleSel} />
      {alternates.length > 0 && <button className="library-arrangements" aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} arrangements of ${bundle.title}`} onClick={() => setExpanded((value) => !value)}>
        {bundle.rows.length} charts <ChevronRight size={12} style={{ transform: expanded ? "rotate(90deg)" : undefined }} />
      </button>}
    </div>
    {expanded && <div className="library-alternates">
      {alternates.map((s) => <SongRow key={`${s.source}/${s.id}`} s={s} arrangement
        onOpen={onOpen} onTuning={onTuning} onRemove={onRemove} selecting={selecting}
        selected={sel.has(`${s.source}/${s.id}`)} onToggle={onToggleSel} />)}
    </div>}
  </div>;
}

function SongRow({ s, onOpen, onTuning, onRemove, selecting, selected, onToggle, arrangement }) {
  const alt = s.tuningId && s.tuningId !== "standard";
  const mine = s.source === "user";
  return (
    <div className="library-song-row">
      <button className="library-song-open" onClick={() => (selecting ? onToggle?.(s) : onOpen?.(s))}>
      {selecting && <SelMark on={selected} />}
      {s.trackNumber && !arrangement && <span className="library-track">{String(s.trackNumber).padStart(2, "0")}</span>}
      <span className="library-song-title">{s.title}{arrangement && <small>{SOURCE_LABEL[s.source] || s.source}</small>}</span>
      {mine && <Tag color={C.toneText}>yours</Tag>}
      {["hidden", "bonus"].includes(s.albumTrackKind) && <Tag>{s.albumTrackKind}</Tag>}
      <Tag>{s.format === "tab" ? "tab" : s.format === "mixed" ? "chords + tab" : "chords"}</Tag>
      {s.capo ? <Tag color={C.rootText}>capo {s.capo}</Tag> : null}
      {s.key ? <span className="kl-meta kl-hide-sm" style={{ minWidth: 42, textAlign: "right" }}>{s.key}</span> : null}
      </button>
      {alt && <button onClick={() => onTuning?.(s.tuningId)}
        title={`Filter by ${s.tuningName}`}
        className="library-tuning-tag">{s.tuningName}</button>}
      {mine && (
        <button aria-label={`remove ${s.title} from your songbook`}
          onClick={() => onRemove?.(s.id)}
          title="Remove from your songbook"
          className="library-remove">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

const quietLink = { background: "transparent", border: 0, color: "var(--kl-faint)", fontSize: 11.5, padding: "2px 4px", cursor: "pointer" };

function Tag({ children, color }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em", color: color || C.muted, border: `1px solid ${color ? `${color}66` : C.line}`, borderRadius: 5, padding: "1px 6px" }}>
      {children}
    </span>
  );
}

function AlbumSongs({ bundles, ...props }) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(bundles.length / 100) - 1));
  return <>
    {bundles.length > 100 && <nav aria-label="Album song pages">
      <button className="bench-btn" disabled={!current} onClick={() => setPage(current - 1)}>Previous songs</button>
      <span role="status"> Songs {current * 100 + 1}–{Math.min((current + 1) * 100, bundles.length)} of {bundles.length} </span>
      <button className="bench-btn" disabled={(current + 1) * 100 >= bundles.length} onClick={() => setPage(current + 1)}>Next songs</button>
    </nav>}
    {bundles.slice(current * 100, (current + 1) * 100).map(bundle => <SongBundle key={bundle.key} bundle={bundle} {...props} />)}
  </>;
}
