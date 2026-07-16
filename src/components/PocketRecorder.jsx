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

export default function PocketRecorder() {
  const [rows, setRows] = useState([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [denied, setDenied] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const recRef = useRef(null);
  const startingRef = useRef(false);
  const failedBlobRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  const refresh = () => memos.list().then(setRows);
  useEffect(() => { refresh(); }, []);
  useEffect(() => () => {
    try { recRef.current?.stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    clearInterval(timerRef.current);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  if (!memos.supported()) return null;

  const start = async () => {
    // double-click guard: a second click during the permission wait would
    // spawn a second recorder and orphan the first one's mic stream
    if (startingRef.current || recRef.current?.state === "recording") return;
    startingRef.current = true;
    setDenied(false);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setDenied(true); startingRef.current = false; return; }
    const rec = new MediaRecorder(stream);
    // chunks are PER-SESSION: a shared ref let a quick stop→re-record wipe
    // the previous take's buffer before its onstop had built the blob
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size > 0) {
        const at = Date.now();
        const id = await memos.save({ name: `Hum — ${stamp(at)}`, blob, at });
        if (id) refresh();
        else { failedBlobRef.current = blob; setSaveFailed(true); } // say so — never silently drop a take
      }
    };
    rec.start();
    recRef.current = rec;
    startingRef.current = false;
    setSaveFailed(false);
    setRecording(true);
    setElapsed(0);
    const t0 = Date.now();
    timerRef.current = setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
  };

  const rescueDownload = () => {
    const blob = failedBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hum.webm";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setSaveFailed(false);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setRecording(false);
  };

  const play = async (row) => {
    const blob = await memos.blobOf(row.id);
    if (!blob) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = urlRef.current;
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play().catch(() => setPlayingId(null));
    setPlayingId(row.id);
  };
  const stopPlay = () => { try { audioRef.current?.pause(); } catch { /* noop */ } setPlayingId(null); };

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
          <button className="bench-btn" onClick={start}>
            <span className={recording ? "kl-pulse" : ""} style={{ width: 9, height: 9, borderRadius: "50%", background: C.root, display: "inline-block" }} />
            <Mic size={14} /> hum it before you lose it
          </button>
        )}
        {denied && <span style={{ fontSize: 12, color: C.bassText }}>mic said no — check the browser's permission</span>}
        {saveFailed && (
          <span style={{ fontSize: 12, color: C.rootText }}>
            storage refused that take — it is NOT saved.{" "}
            <button onClick={rescueDownload} style={{ background: "transparent", border: 0, padding: 0, color: C.rootText, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>
              download it instead
            </button>
          </span>
        )}
        {recording && <span className="kl-pulse" style={{ fontFamily: MONO, fontSize: 11, color: C.rootText }}>recording — stays on this machine</span>}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {rows.slice(0, 6).map((r) => (
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
          {rows.length > 6 && <div className="kl-meta" style={{ color: C.faint, marginTop: 6 }}>+{rows.length - 6} older hums on the shelf</div>}
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
