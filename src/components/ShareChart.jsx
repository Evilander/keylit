// ShareChart.jsx — "pass the chart". Two small pieces:
//   <ShareChart>  — the copy-a-link button. Only rendered for YOUR material
//                   (user songbook + pasted charts); corpus rows never get it.
//   <HandedBanner> — greets a chart that arrived via #s=… and offers to keep it.
// The link is a URL fragment: it never touches a server.
import { useState } from "react";
import { Link2, Check, BookmarkPlus } from "lucide-react";
import { buildShareUrl } from "../lib/sharelink.js";
import { C, MONO } from "../ui/theme.js";

export function ShareChart({ data }) {
  const [state, setState] = useState("idle"); // idle | copied | manual
  const [url, setUrl] = useState(null);

  const share = async () => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const u = buildShareUrl(base, data);
    if (!u) { setState("manual"); setUrl("chart is too large to share as a link"); return; }
    setUrl(u);
    try {
      await navigator.clipboard.writeText(u);
      setState("copied");
      setTimeout(() => setState("idle"), 2600);
    } catch {
      setState("manual"); // clipboard blocked: show the URL to copy by hand
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="bench-btn" onClick={share} title="copy a link that carries this whole chart — no account, no upload">
        {state === "copied" ? <><Check size={14} /> link copied</> : <><Link2 size={14} /> Pass the chart</>}
      </button>
      {state === "manual" && url && (
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="share link"
          style={{ width: 210, background: C.panel2, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 8px", fontFamily: MONO, fontSize: 11 }} />
      )}
    </span>
  );
}

export function HandedBanner({ handed, onKeep, onDismiss, kept }) {
  if (!handed) return null;
  return (
    <div className="faceplate kl-rise" style={{ margin: "0 0 16px", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13.5, color: C.ink }}>
        <b>Someone handed you a chart:</b> {handed.title || "Untitled"}{handed.artist ? ` — ${handed.artist}` : ""}.
        <span style={{ color: C.muted }}> It lives in this link only until you keep it.</span>
      </span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
        {kept ? (
          <span style={{ fontSize: 12.5, color: C.toneText, display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={14} /> in your songbook</span>
        ) : (
          <button className="bench-btn primary" onClick={onKeep}><BookmarkPlus size={14} /> Keep it</button>
        )}
        <button onClick={onDismiss} style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer", fontSize: 12 }}>dismiss</button>
      </span>
    </div>
  );
}
