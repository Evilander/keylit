import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { C, MONO, DISPLAY } from "../ui/theme.js";

// RoomKeys — number-row navigation for hands that live on instruments, not
// mice: 1–9, 0 and - jump straight to a room; ? shows the map. Never fires
// while typing (same guard Perform's transport keys use), never fights
// browser chords (ctrl/meta/alt pass through untouched).
const MAP = [
  ["1", "library", "Library"], ["2", "song", "Song"], ["3", "perform", "Perform"],
  ["4", "piano", "Piano"], ["5", "theory", "Theory"], ["6", "learn", "Learn"],
  ["7", "write", "Write"], ["8", "practice", "Practice"], ["9", "voice", "Voice"],
  ["0", "chords", "Chordbook"], ["-", "shed", "The Shed"], ["=", "setlists", "Setlists"],
  ["`", "onesong", "One Song"],
];

export default function RoomKeys({ onGo }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === "?") { e.preventDefault(); setOpen((o) => !o); return; }
      if (e.key === "Escape") { setOpen(false); return; }
      // Guarding on the focused element alone was not enough: a modal's own
      // buttons pass that check, so a digit still jumped rooms underneath an
      // open dialog. Any dialog but this map owns the number row while it is up.
      if (!open && document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const hit = MAP.find(([k]) => k === e.key);
      if (hit) { onGo(hit[1]); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onGo, open]);

  if (!open) return null;
  // Portaled to body: kl-rise creates a transform context that hijacks
  // position:fixed, so overlays never render in place.
  return createPortal(
    <div onClick={() => setOpen(false)} role="dialog" aria-label="room shortcuts"
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "grid", placeItems: "center",
        background: "rgba(13,12,9,.45)" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14,
          padding: "22px 26px", minWidth: 320, boxShadow: `0 18px 60px ${C.shadow}` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink, marginBottom: 14 }}>
          The rooms, by number
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 26px" }}>
          {MAP.map(([k, , label]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <kbd style={{ fontFamily: MONO, fontSize: 11, color: C.ink, background: C.panel2,
                border: `1px solid ${C.line}`, borderRadius: 5, padding: "2px 7px", minWidth: 14, textAlign: "center" }}>
                {k}
              </kbd>
              <span style={{ fontFamily: "var(--kl-sans)", fontSize: 13, color: C.muted }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.07em", color: C.faint, marginTop: 16 }}>
          ? toggles this map · esc closes · keys sleep while you type
        </div>
      </div>
    </div>,
    document.body,
  );
}
