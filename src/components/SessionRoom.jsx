// SessionRoom.jsx — The Session: a band that hears you and carries you.
// The tune loops in two-bar windows; each window is scheduled at the density
// the lock meter has earned (lib/session.js) — fall out and it thins to a
// heartbeat, lock in and it fills, and it NEVER stops and NEVER grades.
// Ears: a MIDI keyboard when you have one; the honest fallback is a fader
// you ride yourself (the loop is still a band). Every window butts against
// the last via engine.playEvents' startAt — drift-free.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Piano } from "lucide-react";
import { arrangeBand } from "../lib/band.js";
import { STYLES } from "../lib/arrange.js";
import { createLockMeter, noteScore, tierFor, eventsForTier, TIERS } from "../lib/session.js";
import { isMidiSupported, requestMidi, listInputs, watchInputs } from "../webmidi.js";
import { chordSymbol } from "../lib/theory.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const WINDOW_BARS = 2;

export default function SessionRoom({ prog, labelFor, audio, onClaimStage }) {
  const [running, setRunning] = useState(false);
  const [styleId, setStyleId] = useState("ballad");
  const [bpm, setBpm] = useState(84);
  const [lock, setLock] = useState(0);
  const [tier, setTier] = useState(0);
  const [nowIdx, setNowIdx] = useState(0);
  const [midiIn, setMidiIn] = useState(null); // input name, or null = fader mode
  const [pass, setPass] = useState(0);

  const meterRef = useRef(createLockMeter());
  const runRef = useRef(null); // { arrange, spb, base, passBeats, handles:Set, timers:Set, tier }
  const midiRef = useRef({ unsub: null });

  const chordNow = prog?.[nowIdx] || null;
  const style = STYLES[styleId] || STYLES.ballad;

  const stop = () => {
    const r = runRef.current;
    if (r) {
      for (const t of r.timers) clearTimeout(t);
      for (const h of r.handles) { try { h.stop(); } catch { /* done */ } }
    }
    runRef.current = null;
    setRunning(false);
  };
  useEffect(() => () => { stop(); midiRef.current.unsub?.(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const connectMidi = async () => {
    try {
      const access = await requestMidi();
      const inputs = listInputs(access);
      if (!inputs.length) { setMidiIn(null); return; }
      midiRef.current.unsub?.();
      midiRef.current.unsub = watchInputs(access, (e) => {
        if (e.type !== "down") return;
        const r = runRef.current;
        if (!r) return;
        const tBeat = (audio.now() - r.base) / r.spb;
        if (tBeat < 0) return;
        const beatInPass = tBeat % r.passBeats;
        const idx = Math.floor(beatInPass / r.arrange.beatsPerBar) % Math.max(1, prog.length);
        meterRef.current.feed(noteScore(e.note, beatInPass, prog[idx]));
      });
      setMidiIn(inputs[0].name);
    } catch { setMidiIn(null); }
  };

  const start = async () => {
    if (!prog?.length) return;
    onClaimStage?.(); // one act on stage: pads/arranger step aside, we self-manage
    await audio.init();
    meterRef.current = createLockMeter();
    setLock(0); setTier(0); setPass(0);

    const arrange = arrangeBand(prog, styleId, { bass: true, drums: true, count: false });
    const spb = 60 / bpm;
    const passBeats = arrange.totalBeats;
    const W = WINDOW_BARS * arrange.beatsPerBar;
    const windows = Math.max(1, Math.ceil(passBeats / W));
    const r = { arrange, spb, base: audio.now() + 0.15, passBeats, handles: new Set(), timers: new Set(), tier: 0 };
    runRef.current = r;
    setRunning(true);

    const scheduleWindow = (k) => {
      if (runRef.current !== r) return;
      const wi = k % windows;
      const t0 = wi * W;
      const at = r.base + k * W * spb;
      // density decided at schedule time — the band adjusts as the tune comes around
      const cur = tierFor(meterRef.current.lock(), r.tier);
      r.tier = cur;
      setTier(cur);
      if (wi === 0 && k > 0) setPass((p) => p + 1);
      const winEvents = arrange.events
        .filter((e) => e.t >= t0 && e.t < Math.min(t0 + W, passBeats))
        .map((e) => ({ ...e, t: e.t - t0 }));
      const played = eventsForTier(winEvents, cur, arrange.beatsPerBar);
      if (played.length) {
        const h = audio.playEvents({ events: played, totalBeats: Math.min(W, passBeats - t0) }, { bpm, startAt: at });
        r.handles.add(h);
        const cleanup = setTimeout(() => r.handles.delete(h), (W * spb + 2) * 1000);
        r.timers.add(cleanup);
      }
      // chain the next window half a bar before this one ends
      const lead = setTimeout(() => scheduleWindow(k + 1), Math.max(50, ((at + W * spb * 0.5) - audio.now()) * 1000));
      r.timers.add(lead);
    };
    scheduleWindow(0);

    // the meter breathes: decay in silence + UI refresh + chord clock
    const pulse = setInterval(() => {
      if (runRef.current !== r) { clearInterval(pulse); return; }
      meterRef.current.tick(0.5 / spb * 0.5);
      setLock(meterRef.current.lock());
      const tBeat = Math.max(0, (audio.now() - r.base) / spb) % passBeats;
      setNowIdx(Math.floor(tBeat / arrange.beatsPerBar) % Math.max(1, prog.length));
    }, 250);
    r.timers.add(pulse);

    if (isMidiSupported()) connectMidi();
  };

  const tierInfo = TIERS[tier];

  if (!prog?.length) {
    return (
      <div style={{ marginTop: 8, maxWidth: 560 }}>
        <div className="kl-eyebrow">The session</div>
        <h2 className="kl-h2" style={{ marginTop: 8 }}>The circle needs a tune.</h2>
        <p className="kl-prose" style={{ color: C.muted, marginTop: 10 }}>
          Open a song and the band will loop it — thinning to a heartbeat when you drift,
          filling back in when you lock. It never stops and it never grades.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ maxWidth: 620 }}>
        <div className="kl-eyebrow">The session</div>
        <p className="kl-prose" style={{ color: C.muted, margin: "8px 0 0" }}>
          For most of history you learned music inside a circle that carried you — the tune came
          around again whether you kept up or not. Every practice app chose the exam instead: stop,
          score, judge. This is the other lineage. <b style={{ color: C.ink }}>It never stops. Nobody's grading.</b>
        </p>
      </div>

      <div className="flex items-center" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button className={`bench-btn${running ? "" : " primary"}`} style={{ minWidth: 140 }} onClick={running ? stop : start}>
          {running ? <><Square size={14} /> Leave the circle</> : <><Play size={14} /> Join the circle</>}
        </button>
        <select value={styleId} onChange={(e) => setStyleId(e.target.value)} disabled={running} aria-label="band style"
          style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13 }}>
          {Object.values(STYLES).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="kl-meta" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.ink }}>{bpm}</span>
          <input type="range" min={50} max={140} value={bpm} onChange={(e) => setBpm(+e.target.value)} disabled={running}
            style={{ width: 120, accentColor: C.root }} aria-label="session tempo" />
        </label>
        <span className="kl-meta" style={{ marginLeft: "auto", color: C.faint }}>
          {midiIn ? <><Piano size={12} style={{ verticalAlign: -2 }} /> hearing {midiIn}</> : "no MIDI in — ride the fader below"}
          {running ? ` · pass ${pass + 1}` : ""}
        </span>
      </div>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, marginTop: 18, alignItems: "start" }}>
        {/* the tune, now */}
        <div className="faceplate" style={{ padding: "18px 20px" }}>
          <div className="kl-eyebrow">the tune, right now</div>
          <div key={nowIdx} className="kl-noteswap" style={{ fontFamily: MONO, fontSize: 56, fontWeight: 700, color: C.ink, lineHeight: 1, marginTop: 10 }}>
            {chordNow ? (labelFor ? labelFor(chordNow) : chordSymbol(chordNow)) : "—"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {prog.slice(0, 24).map((ch, i) => (
              <span key={i} style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                color: i === nowIdx ? "var(--kl-on-ink)" : C.muted,
                background: i === nowIdx ? C.ink : "transparent",
                border: `1px solid ${i === nowIdx ? C.ink : C.line}` }}>
                {labelFor ? labelFor(ch) : chordSymbol(ch)}
              </span>
            ))}
            {prog.length > 24 && <span className="kl-meta">+{prog.length - 24}</span>}
          </div>
          <p style={{ fontSize: 12, color: C.faint, margin: "14px 0 0" }}>
            Play along on anything. With a MIDI keyboard the band hears your notes against the chord
            and the grid; locked, in-chord playing fills the arrangement out.
          </p>
        </div>

        {/* the lock meter */}
        <div className="faceplate" style={{ padding: "18px 20px" }}>
          <div className="kl-eyebrow">the band's ears</div>
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginTop: 12 }}>
            <div style={{ position: "relative", width: 26, height: 180, borderRadius: 13, background: C.panel2, border: `1px solid ${C.line}`, overflow: "hidden", flex: "0 0 auto" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${Math.round(lock * 100)}%`,
                background: tier >= 3 ? C.root : tier === 2 ? C.bass : C.tone, transition: "height 240ms ease, background 400ms ease" }} />
              {[0.25, 0.5, 0.75].map((l) => (
                <div key={l} style={{ position: "absolute", bottom: `${l * 100}%`, left: 0, right: 0, height: 1, background: C.lineStrong }} />
              ))}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, color: C.ink }}>{tierInfo.name}</div>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "6px 0 0" }}>{tierInfo.line}</p>
              {!midiIn && running && (
                <label className="kl-meta" style={{ display: "block", marginTop: 14 }}>
                  your hand on the fader
                  <input type="range" min={0} max={100} value={Math.round(lock * 100)}
                    onChange={(e) => { const v = +e.target.value / 100; meterRef.current = createLockMeter(); for (let i = 0; i < 20; i++) meterRef.current.feed(v); setLock(v); }}
                    style={{ width: "100%", accentColor: C.tone, marginTop: 6 }} aria-label="lock fader" />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
