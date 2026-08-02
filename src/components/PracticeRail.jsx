// PracticeRail.jsx — the practice room's right rail: what you worked lately,
// what's gone cold, and where the clock stands. Reads the same Bench Book log
// the play-along writes; the cold shelf is bench.coldSongs' honest ranking
// (staleness × how it went), never an SRS cosplay.
import { useEffect, useMemo, useState } from "react";
import { Snowflake, History, Clock3 } from "lucide-react";
import { coldSongs } from "../lib/bench.js";
import { benchBook } from "../storage.js";
import { metronome } from "../audio/metronome.js";
import { C, MONO } from "../ui/theme.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const agoWords = (at, now) => {
  const d = Math.floor((now - at) / DAY_MS);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const kindWords = (e) =>
  e.kind === "playalong"
    ? `play-along${Number.isFinite(e.accuracy) ? ` · ${Math.round(e.accuracy * 100)}%` : ""}`
    : "ran it";

export default function PracticeRail({ book = benchBook, now = () => Date.now(), refreshKey, onOpenClock }) {
  // refreshKey (the active practice tab) re-reads the log after a run logs itself.
  const log = useMemo(() => book.log(), [book, refreshKey]);
  const at = now();
  const recent = log.slice(0, 4);
  const cold = useMemo(() => coldSongs(log, at, { limit: 5 }), [log, at]);
  const weekCount = log.filter((e) => at - (e.at || 0) < 7 * DAY_MS).length;

  const [clock, setClock] = useState(() => metronome.getState());
  useEffect(() => metronome.subscribe(setClock), []);

  return (
    <aside className="practice-rail" aria-label="practice memory">
      <button className="practice-rail-clock" onClick={onOpenClock}
        title={clock.running ? "the click is running — go to it" : "open the metronome"}>
        <Clock3 size={13} />
        {clock.running
          ? <span style={{ color: C.rootText }}>click at {clock.bpm} · {clock.meterId}</span>
          : <span style={{ color: C.muted }}>no clock running</span>}
      </button>

      <div className="practice-rail-head"><History size={12} /> Lately</div>
      {recent.length === 0 && <small>Nothing logged yet — a play-along run writes itself here.</small>}
      {recent.map((e, i) => (
        <div key={`${e.at}-${i}`} className="practice-rail-row">
          <span className="practice-rail-title">{e.title || e.songKey}</span>
          <span className="practice-rail-meta" style={{ fontFamily: MONO }}>{kindWords(e)} · {agoWords(e.at || 0, at)}</span>
        </div>
      ))}
      {log.length > 0 && (
        <small style={{ color: C.faint }}>{weekCount} session{weekCount === 1 ? "" : "s"} this week</small>
      )}

      <div className="practice-rail-head"><Snowflake size={12} /> Gone cold</div>
      {cold.length === 0 && <small>The cold shelf fills once songs have history.</small>}
      {cold.map((s) => (
        <div key={s.songKey} className="practice-rail-row">
          <span className="practice-rail-title">{s.title}</span>
          <span className="practice-rail-meta" style={{ fontFamily: MONO }}>
            {s.daysSince === 0 ? "warm" : `${s.daysSince}d cold`}
            {s.lastAccuracy != null ? ` · last ${Math.round(s.lastAccuracy * 100)}%` : ""}
          </span>
        </div>
      ))}
    </aside>
  );
}
