// PocketRecorder.jsx — "Don't take for granted that your ideas are so great
// that you'll remember them." (Tweedy). One red button, hums go to IndexedDB,
// nothing ever leaves the machine. Renders nothing at all when the browser
// can't record — absence over apology.
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Download, Check } from "lucide-react";
import { memos } from "../audio/memos.js";
import { C, MONO } from "../ui/theme.js";

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const stamp = (at) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Keep unsaved audio through room changes, including saves still in flight.
// Never evict a take: reserve space before asking for the microphone.
const MAX_TAKES = 4, MAX_TAKE_BYTES = 16 * 1024 * 1024, MAX_SECONDS = 300;
const recoveryTakes = [], recoveryListeners = new Set();
let nextTake = 0;
const notifyRecovery = () => { for (const listener of recoveryListeners) listener(); };
const discardTake = (take) => {
  const index = recoveryTakes.indexOf(take);
  if (index >= 0) { recoveryTakes.splice(index, 1); notifyRecovery(); }
};
const recoveryFull = () => recoveryTakes.length >= MAX_TAKES ||
  recoveryTakes.reduce((sum, take) => sum + (take.blob?.size || MAX_TAKE_BYTES), 0) + MAX_TAKE_BYTES > MAX_TAKES * MAX_TAKE_BYTES;

export default function PocketRecorder() {
  const [rows, setRows] = useState([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [denied, setDenied] = useState(false);
  const [recovery, setRecovery] = useState(() => recoveryTakes.slice());
  const [playingId, setPlayingId] = useState(null);
  const recRef = useRef(null);
  const startingRef = useRef(false);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const mountedRef = useRef(true);
  const playGenerationRef = useRef(0);

  const refresh = () => memos.list().then((list) => { if (mountedRef.current) setRows(list); }).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    mountedRef.current = true;
    const recoveryChanged = () => { setRecovery(recoveryTakes.slice()); refresh(); };
    recoveryListeners.add(recoveryChanged);
    setRecovery(recoveryTakes.slice());
    return () => {
      mountedRef.current = false;
      recoveryListeners.delete(recoveryChanged);
      playGenerationRef.current++;
      try { if (recRef.current?.state === "recording") recRef.current.stop(); } catch { /* already stopped */ }
      try { recRef.current?.stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      clearInterval(timerRef.current);
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  if (!memos.supported()) return null;

  const start = async () => {
    // double-click guard: a second click during the permission wait would
    // spawn a second recorder and orphan the first one's mic stream
    if (startingRef.current || recRef.current?.state === "recording" || recoveryFull()) return;
    startingRef.current = true;
    setDenied(false);
    const take = { id: ++nextTake, status: "recording", at: Date.now(), blob: null };
    recoveryTakes.push(take); notifyRecovery();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { discardTake(take); if (mountedRef.current) setDenied(true); startingRef.current = false; return; }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      discardTake(take);
      startingRef.current = false;
      return;
    }
    let rec;
    try { rec = new MediaRecorder(stream); }
    catch {
      stream.getTracks().forEach((track) => track.stop());
      discardTake(take);
      startingRef.current = false;
      setDenied(true);
      return;
    }
    // chunks are PER-SESSION: a shared ref let a quick stop→re-record wipe
    // the previous take's buffer before its onstop had built the blob
    const chunks = [];
    let bytes = 0;
    rec.ondataavailable = (e) => {
      if (e.data.size) { chunks.push(e.data); bytes += e.data.size; }
      // A final browser chunk may cross the limit; keep it and stop collecting.
      if (bytes >= MAX_TAKE_BYTES && rec.state === "recording") { try { rec.stop(); } catch { /* already stopped */ } }
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recRef.current === rec) {
        clearInterval(timerRef.current);
        if (mountedRef.current) setRecording(false);
      }
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      chunks.length = 0;
      if (blob.size > 0) {
        const at = Date.now();
        take.blob = blob; take.at = at; take.status = "saving"; notifyRecovery();
        let id;
        try { id = await memos.save({ name: `Hum — ${stamp(at)}`, blob, at }); } catch { /* rescue below */ }
        if (id) discardTake(take);
        else { take.status = "failed"; notifyRecovery(); }
      } else discardTake(take);
    };
    try { rec.start(1000); }
    catch {
      stream.getTracks().forEach((track) => track.stop());
      discardTake(take);
      startingRef.current = false;
      setDenied(true);
      return;
    }
    recRef.current = rec;
    startingRef.current = false;
    setRecording(true);
    setElapsed(0);
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - t0) / 1000;
      if (mountedRef.current) setElapsed(seconds);
      if (seconds >= MAX_SECONDS) { clearInterval(timerRef.current); try { rec.stop(); } catch { /* already stopped */ } }
    }, 250);
  };

  const rescueDownload = (take) => {
    const blob = take.blob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hum-${take.id}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setRecording(false);
  };

  const play = async (row) => {
    const generation = ++playGenerationRef.current;
    const blob = await memos.blobOf(row.id);
    if (!blob || !mountedRef.current || generation !== playGenerationRef.current) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = urlRef.current;
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play().catch(() => setPlayingId(null));
    setPlayingId(row.id);
  };
  const stopPlay = () => { playGenerationRef.current++; try { audioRef.current?.pause(); } catch { /* noop */ } setPlayingId(null); };

  const download = async (row) => {
    const blob = await memos.blobOf(row.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.name.replace(/[^\w\s-]+/g, "").trim() || "hum"}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        {recording ? (
          <button className="bench-btn" onClick={stop} style={{ borderColor: C.rootUi, color: C.rootText }}>
            <Square size={14} /> keep it · {fmtTime(elapsed)}
          </button>
        ) : (
          <button className="bench-btn" onClick={start} disabled={recoveryFull()}>
            <span className={recording ? "kl-pulse" : ""} style={{ width: 9, height: 9, borderRadius: "50%", background: C.root, display: "inline-block" }} />
            <Mic size={14} /> hum it before you lose it
          </button>
        )}
        {denied && <span style={{ fontSize: 12, color: C.bassText }}>mic said no — check the browser's permission</span>}
        {!recording && recoveryFull() && <span style={{ fontSize: 12, color: C.rootText }}>Recovery is full. Download and discard a take before recording again.</span>}
        {recording && <span className="kl-pulse" style={{ fontFamily: MONO, fontSize: 11, color: C.rootText }}>recording — stays on this machine</span>}
      </div>

      {recovery.some((take) => take.status !== "recording") && (
        <div style={{ marginTop: 10 }} aria-live="polite">
          <div style={{ fontSize: 12, color: C.rootText }}>Unsaved takes stay here until saved or discarded. Download them before closing this app. If saving stays unavailable, close other Keylit windows and reopen after downloading your takes.</div>
          {recovery.filter((take) => take.status !== "recording").map((take) => (
            <div key={take.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
              <span style={{ flex: 1, fontSize: 12 }}>Take {take.id} · {stamp(take.at)} · {take.status === "saving" ? "saving…" : "storage refused — not saved"}</span>
              <button className="bench-btn" onClick={() => rescueDownload(take)} aria-label={`download unsaved take ${take.id}`}><Download size={13} /> download</button>
              {take.status === "failed" && <button className="bench-btn" onClick={() => discardTake(take)} aria-label={`discard unsaved take ${take.id}`}><Trash2 size={13} /> discard</button>}
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
              <button onClick={() => (playingId === r.id ? stopPlay() : play(r))}
                aria-label={playingId === r.id ? "stop" : `play ${r.name}`}
                style={{ background: "transparent", border: `1.5px solid ${C.lineStrong}`, borderRadius: "50%", width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: playingId === r.id ? C.rootText : C.ink, flex: "0 0 auto" }}>
                {playingId === r.id ? <Square size={11} /> : <span style={{ width: 0, height: 0, borderLeft: `8px solid currentColor`, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", marginLeft: 2 }} />}
              </button>
              <RenameableName row={r} onRenamed={refresh} />
              <span className="kl-meta" style={{ color: C.faint, flex: "0 0 auto" }}>{Math.round((r.size || 0) / 1024)}kb</span>
              <button onClick={() => download(r)} aria-label={`download ${r.name}`} style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer", display: "inline-flex", padding: 2 }}><Download size={13} /></button>
              <button onClick={() => { if (playingId === r.id) stopPlay(); memos.remove(r.id).then(refresh); }} aria-label={`delete ${r.name}`}
                style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer", display: "inline-flex", padding: 2 }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RenameableName({ row, onRenamed }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.name);
  useEffect(() => setVal(row.name), [row.name]);
  const commit = async () => { await memos.rename(row.id, val.trim() || row.name); setEditing(false); onRenamed(); };
  if (editing) {
    return (
      <span style={{ flex: 1, minWidth: 0, display: "inline-flex", gap: 6, alignItems: "center" }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit()} autoFocus
          aria-label="memo name"
          style={{ flex: 1, minWidth: 0, background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 7px", fontSize: 12.5 }} />
        <button onClick={commit} aria-label="save name" style={{ background: "transparent", border: 0, color: C.toneText, cursor: "pointer", display: "inline-flex" }}><Check size={14} /></button>
      </span>
    );
  }
  return (
    <button onClick={() => setEditing(true)} title="rename"
      style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: 0, cursor: "text", fontSize: 12.5, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {row.name}
    </button>
  );
}
