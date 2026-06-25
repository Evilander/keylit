import React, { useState, useRef, useEffect } from "react";
import { ClipboardPaste, X } from "lucide-react";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const PLACEHOLDER = `Paste a chord chart here, e.g.

[Verse]
C        G        Am       F
the words go under the chords

Works with Ultimate-Guitar ([ch]Am[/ch]),
ChordPro ([C]lyric), or plain text.`;

/**
 * ImportModal — a centered paste dialog. Opens in place (no scrolling), so the
 * "where do I paste?" question disappears. Loads the text straight into the app.
 *
 * Props: open, initialText, onLoad(text), onClose
 */
export default function ImportModal({ open, initialText = "", onLoad, onClose }) {
  const [text, setText] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (open) {
      setText("");
      // focus after paint
      const id = setTimeout(() => ref.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  if (!open) return null;

  const submit = () => {
    const t = text.trim();
    if (t) onLoad(t);
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#0a0807cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20, backdropFilter: "blur(2px)" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(680px, 100%)", maxHeight: "86vh", overflow: "auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 22px", boxShadow: "0 24px 60px #000a" }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 4 }}>
          <ClipboardPaste size={18} color={C.tone} />
          <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink }}>Paste your chords here</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: C.faint, margin: "0 0 12px" }}>
          Paste a chart from Ultimate-Guitar, ChordPro, or any chords-over-lyrics text. Then hit <b style={{ color: C.muted }}>Load</b>.
        </p>
        <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER} spellCheck={false}
          style={{ width: "100%", minHeight: 280, resize: "vertical", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", fontFamily: MONO, fontSize: 13, lineHeight: 1.55, outline: "none", boxSizing: "border-box" }} />
        <div className="flex items-center" style={{ gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={!text.trim()}
            style={{ background: text.trim() ? C.tone : C.panel2, color: text.trim() ? "#06201d" : C.faint, border: "none", borderRadius: 9, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: text.trim() ? "pointer" : "default" }}>
            Load chords
          </button>
        </div>
      </div>
    </div>
  );
}
