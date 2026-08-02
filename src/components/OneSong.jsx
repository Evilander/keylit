// OneSong.jsx — the front porch of the Write desk: Tweedy's one-song
// assignment given its own room. The room keeps the habit visible (bench
// days as tally marks that never scold), suggests one unstuck door a day,
// and shelves every finished song by number. The only score kept is days
// shown up and songs finished — that's the gamification law here.
import { useMemo, useState } from "react";
import { DoorOpen, Feather, Timer, X } from "lucide-react";
import { EXERCISES, benchDays, streak, nextDoor, dayKey } from "../lib/onesong.js";
import { QUOTES } from "../lib/quotes.js";
import { onesongBook, draftBook } from "../storage.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const BOOK_QUOTES = QUOTES.filter((quote) => quote.by.includes("How to Write One Song"));
const DAY_MS = 24 * 60 * 60 * 1000;

// "today" / "yesterday" / "n days ago" — the doors speak in days, not stamps.
function agoWords(at, now) {
  if (!at) return "never opened";
  if (dayKey(at) === dayKey(now)) return "today";
  if (dayKey(at) === dayKey(now - DAY_MS)) return "yesterday";
  return `${Math.max(2, Math.round((now - at) / DAY_MS))} days ago`;
}

export default function OneSong({ onStart, onPlay, goWrite, book = onesongBook, drafts = draftBook, now = () => Date.now() }) {
  const [st, setSt] = useState(() => book.state());
  const [mins, setMins] = useState(10);
  const [pickId, setPickId] = useState("");
  const [freeTitle, setFreeTitle] = useState("");
  const [notice, setNotice] = useState("");

  const at = now();
  // One line from the book per day — tomorrow the porch greets you differently.
  const quote = BOOK_QUOTES[Math.floor(at / DAY_MS) % BOOK_QUOTES.length] || QUOTES[0];
  const strip = benchDays(st, { now: at, days: 14 });
  const run = streak(st, at);
  const door = nextDoor(st);
  const savedDrafts = useMemo(
    () => drafts.list().filter((d) => !st.finished.some((f) => f.draftId === d.id)),
    [drafts, st.finished],
  );

  const runLine = run >= 2 ? `Day ${run} at the bench.`
    : run === 1 ? "Day one at the bench."
    : "The bench is quiet. One line today starts the count.";

  const workDoor = (name) => {
    try { setSt(book.doorDone(name, now())); } catch { /* tally is optional, the work isn't */ }
  };

  const finish = () => {
    const picked = savedDrafts.find((d) => d.id === pickId);
    const title = freeTitle.trim() || picked?.name?.trim();
    if (!title) { setNotice("Name it first — even badly."); return; }
    let next;
    try { next = book.finish({ title, draftId: picked?.id || null, at: now() }); }
    catch { setNotice("Storage is full — the shelf couldn't take it. Export a backup and clear space."); return; }
    setSt(next);
    setPickId("");
    setFreeTitle("");
    setNotice(`“${title}” is song No. ${next.finished.length}. It exists now.`);
    // the amen: IV falls home to I — a finished song deserves a cadence
    onPlay?.([41, 53, 57, 60], 0.7);
    setTimeout(() => onPlay?.([36, 52, 55, 60], 1.4), 650);
  };

  const unfinish = (index) => {
    try { setSt(book.removeFinished(index)); } catch { /* storage optional */ }
  };

  return (
    <div className="onesong">
      {/* the porch: his words on the left, your days on the right */}
      <div className="onesong-hero">
        <div>
          <div className="onesong-quote" style={{ fontFamily: DISPLAY, color: C.ink }}>{quote.q}</div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: "0.05em", color: C.muted, marginTop: 10 }}>— {quote.by}</div>
        </div>
        <div className="onesong-bench" aria-label={`last fourteen days at the bench, ${strip.filter((d) => d.wrote).length} with writing`}>
          <div className="onesong-tally">
            {strip.map((d) => (
              <span key={d.key} className={`onesong-mark${d.wrote ? " lit" : ""}`} title={d.key} />
            ))}
          </div>
          <div className="onesong-runline" style={{ color: run ? C.ink : C.muted }}>{runLine}</div>
        </div>
      </div>

      {/* the assignment — one button, one clock, no preconditions */}
      <div className="onesong-ritual faceplate">
        <div className="onesong-ritual-copy">
          <strong style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 400 }}>Write one song today.</strong>
          <span style={{ color: C.muted }}>Not a great song. A finished one. The clock keeps it small; whatever exists when it rings counts.</span>
        </div>
        <div className="onesong-ritual-controls">
          <div className="kl-seg" role="group" aria-label="session length">
            {[5, 10, 15].map((value) => (
              <button key={value} aria-pressed={mins === value} onClick={() => setMins(value)}>{value}m</button>
            ))}
          </div>
          <button className="bench-btn primary onesong-start" onClick={() => onStart?.(mins)}>
            <Timer size={15} /> Sit down and write
          </button>
          <button className="bench-btn" onClick={() => goWrite?.()} title="the desk, no clock">
            <Feather size={13} /> Just the desk
          </button>
        </div>
      </div>

      {/* the six doors — ways out of stuck; one is suggested, none is required */}
      <div className="onesong-doors-head">
        <span className="kl-eyebrow">Six doors out of stuck</span>
        <span style={{ color: C.faint, fontSize: 12.5 }}>worked one? mark it — the day lights either way</span>
      </div>
      <div className="onesong-doors">
        {EXERCISES.map(([name, text]) => (
          <article key={name} className={`onesong-door${name === door ? " suggested" : ""}`}>
            {name === door && <span className="onesong-door-tag" style={{ color: C.rootText }}>today’s door</span>}
            <strong>{name}</strong>
            <p>{text}</p>
            <footer>
              <button className="bench-btn" onClick={() => workDoor(name)}><DoorOpen size={13} /> Worked it</button>
              <span style={{ color: C.faint }}>{agoWords(st.doors[name], at)}</span>
            </footer>
          </article>
        ))}
      </div>

      {/* the shelf — every spine is a song that exists because you finished it */}
      <div className="onesong-shelf-head">
        <span className="kl-eyebrow">Finished songs</span>
        <span style={{ color: C.faint, fontSize: 12.5 }}>
          {st.finished.length
            ? `${st.finished.length} on the shelf`
            : "the shelf is waiting for No. 1 — done beats good"}
        </span>
      </div>
      <div className="onesong-shelf" role="list">
        {st.finished.map((f, index) => (
          <div key={`${f.at}-${index}`} className="onesong-spine" role="listitem" title={new Date(f.at).toLocaleDateString()}>
            <span className="onesong-spine-no" style={{ fontFamily: MONO }}>No. {index + 1}</span>
            <span className="onesong-spine-title">{f.title}</span>
            <button aria-label={`take “${f.title}” back off the shelf`} onClick={() => unfinish(index)}><X size={11} /></button>
          </div>
        ))}
        <div className="onesong-finish">
          {savedDrafts.length > 0 && (
            <select aria-label="pick a sketch to finish" value={pickId} onChange={(event) => { setPickId(event.target.value); setFreeTitle(""); }}>
              <option value="">finish a saved sketch…</option>
              {savedDrafts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <input aria-label="or name a song finished elsewhere" placeholder="…or name one finished off-desk"
            value={freeTitle} onChange={(event) => { setFreeTitle(event.target.value); setPickId(""); }} />
          <button className="bench-btn primary" onClick={finish}>Call it finished</button>
        </div>
      </div>
      <div role="status" style={{ minHeight: 20, color: C.toneText, fontSize: 13, marginTop: 6 }}>{notice}</div>
    </div>
  );
}
