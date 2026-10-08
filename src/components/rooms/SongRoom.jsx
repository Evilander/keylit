// SongRoom.jsx — the Song room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import { ChevronLeft, ChevronRight, Loader2, Lightbulb } from "lucide-react";
import { C, MONO } from "../../ui/theme.js";
import { BenchButton } from "../../ui/Bench.jsx";
import { SOURCE_LABEL } from "../../corpus.js";
import { hasTab } from "../../lib/tab.js";
import { buildUserSong } from "../../lib/usersong.js";
import { HandedBanner, ShareChart } from "../ShareChart.jsx";
import AddToSetlist from "../AddToSetlist.jsx";
import GuitarSetup from "../GuitarSetup.jsx";
import TabHomes from "../TabHomes.jsx";
import SongGrips from "../SongGrips.jsx";
import RetabPanel from "../RetabPanel.jsx";
import ChartView from "../ChartView.jsx";
import Coverize from "../Coverize.jsx";

const navChip = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 8, background: C.panel2,
  color: C.ink, border: `1px solid ${C.line}`, cursor: "pointer", flex: "0 0 auto",
};

function SongHeader({ loaded, keyName }) {
  if (!loaded) {
    return (
      <div>
        <div className="kl-eyebrow">Untitled chart · key of {keyName}</div>
        <h1 className="kl-title" style={{ marginTop: 4 }}>Your chart</h1>
      </div>
    );
  }
  const bits = [loaded.artist, `key of ${keyName}`].filter(Boolean);
  if (loaded.tuning && loaded.tuning !== "standard") bits.push(loaded.tuning);
  if (loaded.capo) bits.push(`capo ${loaded.capo}`);
  return (
    <div>
      <div className="kl-eyebrow">{bits.join(" · ")}</div>
      <h1 className="kl-title" style={{ marginTop: 4 }}>{loaded.title}</h1>
      {loaded.sourceUrl && (
        <a href={loaded.sourceUrl} target="_blank" rel="noreferrer" className="kl-meta" style={{ color: C.faint, textDecoration: "none", borderBottom: `1px solid ${C.line}` }}>
          {SOURCE_LABEL[loaded.source] || loaded.source}
        </a>
      )}
    </div>
  );
}

export default function SongRoom({
  handed, handedKept, keepHanded, setHanded, setlistCtx, openSong,
  loaded, keyNameFull, transposeCtl, keyPicker, setSection, sheet, view, activeKey, ai, runAI,
  guitarTuning, setGuitarTuning, effectiveCapo, capoShift, setPlayCapo, capoBest,
  chartSpelling, setChartSpelling, shapeCurrent, soundingCurrent, readingKey, soundingKey,
  transpose, useDetunedSetup, songNumbersRailPanel, aiPanel, tabKeysPanel, readingView,
  strumNotes, guitarLens, currentRetab, keepToSongbook, displaySheet, readingShift,
  currentIdx, hearReadingChord, auditionChords, loadProgression, setLoaded, chartInput, loadSheet,
}) {
  return (
    <div className="kl-section">
      <HandedBanner handed={handed} kept={handedKept} onKeep={keepHanded} onDismiss={() => setHanded(null)} />
      {setlistCtx && setlistCtx.rows?.length > 0 && (
        <div className="flex items-center" style={{ gap: 10, marginBottom: 12, padding: "7px 12px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <span className="kl-eyebrow" style={{ whiteSpace: "nowrap" }}>{setlistCtx.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{setlistCtx.idx + 1} / {setlistCtx.rows.length}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {setlistCtx.rows[setlistCtx.idx + 1] ? <>next: {setlistCtx.rows[setlistCtx.idx + 1].title}</> : "last one — bring it home"}
          </span>
          <button onClick={() => openSong(setlistCtx.rows[setlistCtx.idx - 1], { ...setlistCtx, idx: setlistCtx.idx - 1 })}
            disabled={setlistCtx.idx === 0} aria-label="previous song in setlist"
            style={{ ...navChip, opacity: setlistCtx.idx === 0 ? 0.35 : 1 }}><ChevronLeft size={14} /></button>
          <button onClick={() => openSong(setlistCtx.rows[setlistCtx.idx + 1], { ...setlistCtx, idx: setlistCtx.idx + 1 })}
            disabled={setlistCtx.idx >= setlistCtx.rows.length - 1} aria-label="next song in setlist"
            style={{ ...navChip, opacity: setlistCtx.idx >= setlistCtx.rows.length - 1 ? 0.35 : 1 }}><ChevronRight size={14} /></button>
        </div>
      )}
      <SongHeader loaded={loaded} keyName={keyNameFull} />
      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap", margin: "14px 0 4px" }}>
        {transposeCtl}
        {keyPicker}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
          {/* Only songs with a source+id make live setlist entries;
              pasted/shared/ear charts would leave dead rows. */}
          {loaded?.id != null && <AddToSetlist song={loaded} onOpenSetlists={() => setSection("setlists")} />}
          {sheet.trim() && (!loaded || loaded.source === "user" || loaded.source === "shared" || loaded.source === "ear") && (
            <ShareChart data={{
              title: loaded?.title || "Untitled chart", artist: loaded?.artist || undefined,
              body: sheet, key: loaded?.key || undefined, capo: loaded?.capo || undefined,
              tuning: loaded?.tuningRaw || loaded?.tuning || undefined,
            }} />
          )}
          <BenchButton onClick={runAI} disabled={!view.prog.length || ai.loading}>
            {ai.loading ? <Loader2 size={15} className="kl-spin" /> : <Lightbulb size={15} />} Read the harmony
          </BenchButton>
        </span>
      </div>
      <GuitarSetup
        tuningId={guitarTuning}
        onTuningChange={setGuitarTuning}
        capo={effectiveCapo}
        chartCapo={capoShift}
        onCapoChange={setPlayCapo}
        onResetCapo={() => setPlayCapo(null)}
        bestCapo={capoBest}
        spelling={chartSpelling}
        onSpellingChange={setChartSpelling}
        shapeChord={shapeCurrent}
        soundingChord={soundingCurrent}
        shapeKey={readingKey}
        soundingKey={soundingKey}
        transpose={transpose}
        onUseDetunedSetup={useDetunedSetup}
      />
      {songNumbersRailPanel}
      {aiPanel}
      <SongGrips chords={readingView.unique} activeKey={readingKey}
        defaultOpen={false}
        shapeTuning={guitarLens.shapeTuning}
        strumTuning={guitarLens.strumTuning} strumCapo={guitarLens.strumCapo}
        onStrum={strumNotes} />
      <section className="song-chart" aria-label="Song chart" style={{ marginTop: 18 }}>
        <RetabPanel retab={currentRetab} loaded={loaded}
          onKeep={(body, meta) => {
            const built = buildUserSong({
              artist: meta.artist || "", title: meta.title || "Untitled",
              album: "", key: "", capo: meta.capo != null ? String(meta.capo) : "",
              tuning: meta.tuning || "", body,
            }, Date.now());
            if (built.error) return;
            keepToSongbook(built);
          }} />
        <ChartView text={displaySheet} activeKey={readingKey} transpose={readingShift}
          activeChord={readingView.prog[currentIdx] || null}
          onChordClick={hearReadingChord}
          guitar={guitarLens} />
      </section>
      {tabKeysPanel}
      <TabHomes sheet={sheet}
        sourceTuning={loaded?.tuningRaw || loaded?.tuning} sourceCapo={capoShift}
        currentTuningId={guitarTuning} currentCapo={effectiveCapo}
        onApply={(tuningId, capo) => { setGuitarTuning(tuningId); setPlayCapo(capo); }} />
      <Coverize prog={view.prog} activeKey={activeKey} loaded={loaded}
        sourceHasTab={hasTab(sheet)}
        onAudition={auditionChords}
        onApply={loadProgression}
        onKeep={(body, meta) => {
          const built = buildUserSong({
            artist: meta.artist || "", title: meta.title || "Untitled",
            album: "", key: meta.key || "", capo: meta.capo ? String(meta.capo) : "",
            tuning: "", body,
          }, Date.now());
          if (built.error) return;
          if (!keepToSongbook(built)) return;
          setLoaded({ id: built.song.id, title: built.song.title, artist: built.song.artist || null, source: "user", key: built.row.key, capo: built.row.capo });
          loadSheet(body);
        }} />
      {chartInput}
    </div>
  );
}
