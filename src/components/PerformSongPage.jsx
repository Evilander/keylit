import PerformChart from "./PerformChart.jsx";
import { TUNINGS } from "../lib/tuning.js";

// The same guitar tunings the Song room's GuitarSetup offers — the perform
// page is a reading surface, so it speaks the same shape-shift language.
const GUITAR_TUNING_IDS = ["standard", "ebStandard", "dStandard"];

const signed = (n) => `${n > 0 ? "+" : ""}${n}`;

export default function PerformSongPage({ slot, index, active, activeChordIndex, onRetry, onSetupChange, registerPage, registerSentinel }) {
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
  const title = page.loaded?.title || entry.title;
  const capo = page.capo || 0;
  const transpose = page.transpose || 0;
  return (
    <article className="perform-song-page" data-entry-id={entry.entryId} data-testid={`perform-page-${entry.entryId}`}
      data-active-chord={activeChordIndex == null ? undefined : activeChordIndex}
      aria-current={active ? "true" : undefined} ref={registerPage}>
      <header className="perform-song-page__head">
        <div className="kl-eyebrow">{page.loaded?.artist || entry.artist || ""}{page.keyName ? ` · ${page.keyName}` : ""}{page.retabTag ? ` · ${page.retabTag}` : ""}</div>
        <h2>{title}</h2>
        <div className="perform-song-page__setup" aria-label={`guitar setup for ${title}`}>
          <select aria-label={`tuning for ${title}`} value={page.tuning || "standard"}
            onChange={(event) => onSetupChange?.({ tuning: event.target.value })}>
            {GUITAR_TUNING_IDS.map((id) => <option key={id} value={id}>{TUNINGS[id].name}</option>)}
          </select>
          <span className="perform-song-page__stepper">
            <button aria-label={`capo down for ${title}`} disabled={capo <= 0}
              onClick={() => onSetupChange?.({ capo: capo - 1 })}>−</button>
            <span>{capo === 0 ? "no capo" : `capo ${capo}`}</span>
            <button aria-label={`capo up for ${title}`} disabled={capo >= 11}
              onClick={() => onSetupChange?.({ capo: capo + 1 })}>+</button>
          </span>
          <span className="perform-song-page__stepper">
            <button aria-label={`transpose down for ${title}`} disabled={transpose <= -12}
              onClick={() => onSetupChange?.({ transpose: transpose - 1 })}>−</button>
            <span>transpose {signed(transpose)}</span>
            <button aria-label={`transpose up for ${title}`} disabled={transpose >= 12}
              onClick={() => onSetupChange?.({ transpose: transpose + 1 })}>+</button>
          </span>
        </div>
      </header>
      <PerformChart outline={page.outline} activeKey={page.activeKey} transpose={page.transpose}
        activeChord={chord} anchor={anchor} size={20} />
      <div className="perform-preload-sentinel" data-testid={`preload-sentinel-${entry.entryId}`} data-index={index} ref={registerSentinel} />
    </article>
  );
}
