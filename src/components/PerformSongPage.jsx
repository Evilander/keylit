import PerformChart from "./PerformChart.jsx";

export default function PerformSongPage({ slot, index, active, activeChordIndex, onRetry, registerPage, registerSentinel }) {
  const entry = slot.entry;
  if (slot.status === "error") {
    return (
      <article className="perform-song-page perform-song-page--skipped" data-entry-id={entry.entryId} data-testid={`perform-page-${entry.entryId}`}
        aria-current={active ? "true" : undefined} ref={registerPage}>
        <div className="perform-song-page__skipped">Skipped: {entry.title}</div>
        <p>{slot.error || "Unable to load this chart."}</p>
        <button className="bench-btn" onClick={onRetry}>Retry</button>
        <div className="perform-preload-sentinel" data-testid={`preload-sentinel-${entry.entryId}`} data-index={index} ref={registerSentinel} />
      </article>
    );
  }
  if (slot.status !== "ready" || !slot.page) {
    return (
      <article className="perform-song-page perform-song-page--loading" data-entry-id={entry.entryId} data-testid={`perform-page-${entry.entryId}`}
        aria-current={active ? "true" : undefined} ref={registerPage}>
        <div className="kl-eyebrow">{entry.artist || "Loading chart"}</div>
        <h2>{entry.title}</h2>
        <p>{slot.status === "loading" ? "Putting the chart on the stand…" : "Waiting to load…"}</p>
        <div className="perform-preload-sentinel" data-testid={`preload-sentinel-${entry.entryId}`} data-index={index} ref={registerSentinel} />
      </article>
    );
  }
  const { page } = slot;
  const chord = activeChordIndex == null ? null : page.progression[activeChordIndex] || null;
  const anchor = activeChordIndex == null ? null : page.anchors[activeChordIndex] || null;
  return (
    <article className="perform-song-page" data-entry-id={entry.entryId} data-testid={`perform-page-${entry.entryId}`}
      data-active-chord={activeChordIndex == null ? undefined : activeChordIndex}
      aria-current={active ? "true" : undefined} ref={registerPage}>
      <header className="perform-song-page__head">
        <div className="kl-eyebrow">{page.loaded?.artist || entry.artist || ""}{page.keyName ? ` · ${page.keyName}` : ""}{page.retabTag ? ` · ${page.retabTag}` : ""}</div>
        <h2>{page.loaded?.title || entry.title}</h2>
        <div className="perform-song-page__setup">{page.tuning || "standard"}{page.capo ? ` · capo ${page.capo}` : ""}{page.transpose ? ` · ${page.transpose > 0 ? "+" : ""}${page.transpose}` : ""}</div>
      </header>
      <PerformChart outline={page.outline} activeKey={page.activeKey} transpose={page.transpose}
        activeChord={chord} anchor={anchor} size={20} />
      <div className="perform-preload-sentinel" data-testid={`preload-sentinel-${entry.entryId}`} data-index={index} ref={registerSentinel} />
    </article>
  );
}
