import { useEffect, useRef, useState } from "react";
import { Binoculars } from "lucide-react";
import { C, MONO } from "../ui/theme.js";

// TabHunt — type an artist, the local harvester daemon runs the whole hunt
// (Ultimate Guitar → Songsterr → index rebuild) and the shelf grows in place.
// Dev-only by construction: HUNTER is null in production builds, so everything
// behind the early return (hooks, fetches, JSX, the daemon address) is
// dead-code-eliminated — only an inert no-op stub of this component ships.
// With no daemon running the Library renders pixel-identical to today.
const HUNTER = import.meta.env.DEV ? "http://127.0.0.1:7433" : null;

// What each daemon stage sounds like while it works.
const STAGE_LINE = {
  ug: "crate-digging at ultimate-guitar",
  songsterr: "pulling songsterr transcriptions",
  manifest: "reshelving the library",
};

const tally = (st) =>
  st.written || st.skipped
    ? ` — ${st.written} kept · ${st.skipped} already shelved`
    : "…";

export default function TabHunt({ onDone }) {
  if (!HUNTER) return null;

  const [alive, setAlive] = useState(false);
  const [open, setOpen] = useState(false);
  const [artist, setArtist] = useState("");
  const [job, setJob] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const pollRef = useRef(null);
  const inFlightRef = useRef(false); // synchronous re-entrancy guard (state lags a click)

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    fetch(`${HUNTER}/health`, { signal: ctl.signal })
      .then((r) => r.ok && setAlive(true))
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => { ctl.abort(); clearTimeout(t); };
  }, []);

  useEffect(() => () => clearInterval(pollRef.current), []);

  if (!alive) return null;

  const begin = async () => {
    const name = artist.trim();
    // `job` state lags a fast double-click across the POST round-trip, so the
    // ref is the real guard — without it two clicks start two overlapping hunts
    // and the second's interval id clobbers the first's in pollRef.
    if (!name || job || inFlightRef.current) return;
    inFlightRef.current = true;
    setVerdict(null);
    try {
      const r = await fetch(`${HUNTER}/hunt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist: name }),
      });
      if (!r.ok) {
        setVerdict((await r.json()).err || "the hunter is busy");
        return;
      }
      const { id } = await r.json();
      setJob({ id, artist: name, stages: [] });
      // Each interval clears its own id, never whatever currently sits in the
      // ref, so a poll can't orphan a sibling's timer.
      const iv = setInterval(async () => {
        try {
          const s = await (await fetch(`${HUNTER}/hunt/${id}`)).json();
          setJob({ id, ...s });
          if (s.done) {
            clearInterval(iv);
            const kept = (s.stages || [])
              .filter((st) => st.key !== "manifest")
              .reduce((n, st) => n + st.written, 0);
            const shelf = s.manifest ? ` — the shelf now holds ${s.manifest.songs} songs` : "";
            setVerdict(
              s.error ? s.error
                : kept ? `the hunt brought home ${kept} new charts${shelf}`
                : "nothing new out there — the shelf already has it all",
            );
            setJob(null);
            if (!s.error && kept) onDone?.();
          }
        } catch {
          clearInterval(iv);
          setVerdict("lost the hunter mid-hunt — check the daemon");
          setJob(null);
        }
      }, 1200);
      pollRef.current = iv;
    } catch {
      setVerdict("the hunter stopped answering");
    } finally {
      inFlightRef.current = false;
    }
  };

  const meta = { fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.06em", color: C.faint };

  if (job) {
    const running = job.stages?.find((st) => st.status === "running");
    return (
      <div style={{ ...meta, margin: "6px 2px 0", display: "flex", alignItems: "center", gap: 8 }} aria-live="polite">
        <span className="kl-pulse" aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: "50%", background: C.root, flex: "none" }} />
        <span>
          hunting {job.artist}: {running ? `${STAGE_LINE[running.key] || running.label}${tally(running)}` : "setting out…"}
        </span>
      </div>
    );
  }

  return (
    <div style={{ margin: "6px 2px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {open ? (
        <>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") begin(); if (e.key === "Escape") setOpen(false); }}
            placeholder="artist to hunt"
            aria-label="artist to hunt"
            autoFocus
            style={{ ...meta, fontSize: 12, color: C.ink, background: "transparent",
              border: "none", borderBottom: `1px solid ${C.line}`, outline: "none",
              padding: "2px 2px 3px", width: 180 }}
          />
          <button onClick={begin} className="bench-btn" style={{ padding: "3px 10px", fontSize: 11 }}>
            go
          </button>
        </>
      ) : (
        <button onClick={() => setOpen(true)}
          style={{ ...meta, display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          title="the local harvester is running — hunt any artist's tabs into the library">
          <Binoculars size={12} aria-hidden="true" />
          go on a tab hunt
        </button>
      )}
      {verdict && <span style={{ ...meta, color: C.muted }} role="status">{verdict}</span>}
    </div>
  );
}
