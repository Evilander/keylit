import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ListMusic, Play } from "lucide-react";
import { loadSong, SOURCE_LABEL } from "../corpus.js";
import { benchBook } from "../storage.js";
import { loadAlbumCharts } from "../albumloader.js";
import { albumTracks, chartIdentity, chartSetlistSong, chooseAlbumChart } from "../lib/library.js";
import { canonicalTuning } from "../lib/tuning.js";

const formatName = (row) => row.format === "tab" ? "tab" : row.format === "mixed" ? "chords + tab" : "chords";
const setupName = (row) => `${canonicalTuning(row.tuningId || row.tuningRaw || row.tuning || "standard").name} · ${row.capo ? `capo ${row.capo}` : "no capo"}`;

export default function AlbumSession({ album, session, onChange, onBack, onOpen, onSetlist, onPerform }) {
  const tracks = useMemo(() => albumTracks(album), [album]);
  const focused = tracks.find((track) => track.key === session.focused) || tracks[0];
  const excluded = new Set(session.excluded || tracks.filter((track) => track.kind !== "main").map((track) => track.key));
  const preference = session.preference || "tabs";
  const chosen = (track) => chooseAlbumChart(track, { preference, choice: session.choices?.[track.key] });
  const row = focused && chosen(focused);
  const rowId = row && chartIdentity(row);
  const included = tracks.filter((track) => !excluded.has(track.key));
  const extras = tracks.filter((track) => track.kind !== "main");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveRequest = useRef(null);
  const heading = useRef(null);
  const inspectorHeading = useRef(null);
  const change = (patch) => onChange({ ...session, ...patch });

  useEffect(() => {
    heading.current?.focus();
    return () => saveRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!row) return;
    const controller = new AbortController();
    setPreview({ id: rowId, status: "loading" });
    loadAlbumCharts([row], { loadSong, signal: controller.signal }).then(([song]) => {
      if (!controller.signal.aborted) setPreview({ id: rowId, status: "ready", song });
    }).catch((failure) => {
      if (!controller.signal.aborted) setPreview({ id: rowId, status: "error", error: failure.message });
    });
    return () => controller.abort();
  }, [row, rowId]);

  const toggleTrack = (track) => {
    excluded.has(track.key) ? excluded.delete(track.key) : excluded.add(track.key);
    change({ excluded: [...excluded] });
  };
  const focusTrack = (track) => {
    change({ focused: track.key });
    if (window.matchMedia?.("(max-width: 800px)")?.matches) requestAnimationFrame(() => {
      inspectorHeading.current?.focus({ preventScroll: true });
      inspectorHeading.current?.closest(".album-inspector-heading")?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };
  const save = async (perform) => {
    if (!included.length || saveRequest.current) return;
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving(true);
    setError("");
    let setlist;
    try {
      const rows = included.map(chosen);
      const songs = await loadAlbumCharts(rows, { loadSong, signal: controller.signal });
      if (controller.signal.aborted) return;
      setlist = benchBook.saveSetlistSongs({
        name: session.name?.trim() || `${album.artist} — ${album.album}`,
        songs: rows.map((entry, index) => chartSetlistSong(entry, songs[index])),
      });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.name === "QuotaExceededError"
        ? "Storage is full. The setlist was not saved. Export a backup and clear space before trying again."
        : `${failure.message} The setlist was not saved.`);
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      saveRequest.current = null;
    }
    if (setlist) perform ? onPerform?.(setlist) : onSetlist?.(setlist);
  };

  const currentPreview = preview?.id === rowId ? preview : null;
  const sourceUrl = currentPreview?.song?.sourceUrl;
  const sourceLink = typeof sourceUrl === "string" && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null;
  return <section className="kl-section album-session" aria-label={`${album.album} album session`}>
    <button className="album-back" onClick={onBack}><ArrowLeft size={15} /> Back to the library</button>
    <header className="album-session-heading">
      <div>
        <div className="kl-eyebrow">{album.artist}{album.year ? ` · ${album.year}` : ""}</div>
        <h1 className="kl-title" ref={heading} tabIndex={-1}>{album.album}</h1>
      </div>
      <div className="album-session-count"><strong>{tracks.length}</strong><span>tracks on the shelf<br />{album.songs.length} charts</span></div>
    </header>
    <div className="album-session-options">
      <div className="library-switch" role="group" aria-label="Preferred album charts">
        {[["tabs", "Tabs first"], ["chords", "Chords first"]].map(([id, label]) => <button key={id} disabled={saving}
          aria-pressed={preference === id} onClick={() => change({ preference: id })}>{label}</button>)}
      </div>
      {extras.length > 0 && <label className="album-extras"><input type="checkbox" disabled={saving}
        checked={extras.every((track) => !excluded.has(track.key))}
        onChange={(event) => {
          extras.forEach((track) => event.target.checked ? excluded.delete(track.key) : excluded.add(track.key));
          change({ excluded: [...excluded] });
        }} /> Include hidden &amp; bonus tracks</label>}
      <p>Choose a chart for each track. Your individual choices stay selected when you change the preference.</p>
    </div>
    <div className="album-session-layout">
      <div className="album-tracklist" role="group" aria-label="Album tracks" tabIndex={0}>
        <div className="album-tracklist-heading"><span>Track</span><span>Charts</span></div>
        {tracks.map((track) => {
          const chart = chosen(track);
          return <div key={track.key} className={`album-track${focused?.key === track.key ? " active" : ""}${excluded.has(track.key) ? " excluded" : ""}`}>
            <input type="checkbox" checked={!excluded.has(track.key)} disabled={saving} onChange={() => toggleTrack(track)} aria-label={`Include ${track.title}`} />
            <button aria-pressed={focused?.key === track.key} onClick={() => focusTrack(track)}>
              <span className="album-track-number">{Number.isFinite(track.trackNumber) ? String(track.trackNumber).padStart(2, "0") : "—"}</span>
              <span className="album-track-title">{track.title}<small>{formatName(chart)} · {setupName(chart)}{track.kind !== "main" ? ` · ${track.kind}` : ""}</small></span>
              <span className="album-track-charts">{track.rows.length}</span>
            </button>
          </div>;
        })}
      </div>
      {focused && <section className="album-inspector" aria-label={`Arrangements of ${focused.title}`}>
        <div className="album-inspector-heading"><div><div className="kl-eyebrow">Choose an arrangement</div><h2 className="kl-h2" ref={inspectorHeading} tabIndex={-1}>{focused.title}</h2></div>
          <button className="bench-btn" disabled={currentPreview?.status !== "ready" || saving} onClick={() => onOpen?.(row)}>Open chart <ArrowUpRight size={14} /></button></div>
        <fieldset className="album-arrangements"><legend className="sr-only">Arrangement for {focused.title}</legend>
          {focused.rows.map((chart, index) => <label key={chartIdentity(chart)} className={chartIdentity(chart) === rowId ? "selected" : ""}>
            <input type="radio" name="album-arrangement" disabled={saving} checked={chartIdentity(chart) === rowId}
              onChange={() => change({ choices: { ...session.choices, [focused.key]: chartIdentity(chart) } })} />
            <span><strong>{SOURCE_LABEL[chart.source] || chart.source} <span>· {index + 1}</span></strong><small>{formatName(chart)} · {setupName(chart)}</small></span>
          </label>)}
        </fieldset>
        <div className="album-preview-heading"><span className="kl-eyebrow">Chart preview</span>{sourceLink && <a href={sourceLink} target="_blank" rel="noopener noreferrer">View source <ArrowUpRight size={12} /></a>}</div>
        {currentPreview?.status === "ready" ? <pre className="album-preview" tabIndex={0} aria-label={`${focused.title} chart preview`}>{currentPreview.song.body}</pre>
          : <p className="album-preview-message" role="status">{currentPreview?.error || "Loading chart…"}</p>}
      </section>}
    </div>
    <footer className="album-session-footer">
      <label>Setlist name<input value={session.name ?? `${album.artist} — ${album.album}`} disabled={saving}
        onChange={(event) => change({ name: event.target.value })} /></label>
      <span className="kl-meta" aria-live="polite">{included.length} of {tracks.length} tracks</span>
      <div><button className="bench-btn" disabled={saving || !included.length} onClick={() => save(false)}><ListMusic size={14} /> Create setlist</button>
        {onPerform && <button className="bench-btn primary" disabled={saving || !included.length} onClick={() => save(true)}><Play size={14} /> {saving ? "Checking charts…" : "Save & perform"}</button>}</div>
      {error && <p className="album-session-error" role="alert">{error}</p>}
    </footer>
  </section>;
}
