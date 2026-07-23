import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { THEMES, C, MONO } from "../ui/theme.js";

// ThemePicker — the top-bar swatch that opens the room of rooms. Replaces the
// old two-state pill: click for a popover of theme swatches (paper + ink + the
// three semantic accents), pick one, the whole app repaints live. Portaled to
// body because kl-rise creates a transform context that hijacks position:fixed.
function Swatch({ palette, size = 22 }) {
  return (
    <span aria-hidden="true" style={{
      display: "inline-grid", width: size, height: size, borderRadius: 6, overflow: "hidden",
      gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
      border: `1px solid ${palette.lineStrong}`, flex: "none",
      background: palette.bg,
    }}>
      <span style={{ background: palette.root }} />
      <span style={{ background: palette.tone }} />
      <span style={{ background: palette.bass }} />
      <span style={{ background: palette.ink }} />
    </span>
  );
}

export default function ThemePicker({ theme, onPick }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    // The menu is portaled to <body>, so it isn't inside btnRef — exclude it
    // explicitly or a click on a swatch closes the menu before its onClick fires.
    const onClick = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick, true); };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="theme"
        title={`Theme — ${current.label}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10,
          letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "transparent",
          border: `1.5px solid ${C.line}`, borderRadius: 999, padding: "5px 12px 5px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>
        <Swatch palette={current.palette} size={16} />
        {current.label}
      </button>
      {open && anchor && createPortal(
        <div role="menu" aria-label="themes" ref={menuRef}
          style={{ position: "fixed", top: anchor.top, right: anchor.right, zIndex: 300,
            background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12,
            boxShadow: `0 18px 50px ${C.shadow}`, padding: 6, minWidth: 220 }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase",
            color: C.faint, padding: "6px 10px 8px" }}>Rooms of light</div>
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button key={t.id} role="menuitemradio" aria-checked={active}
                onClick={() => { onPick(t.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                  background: active ? C.panel2 : "transparent", border: "none", borderRadius: 8,
                  padding: "8px 10px", cursor: "pointer",
                  fontFamily: "var(--kl-sans)", fontSize: 13.5, color: C.ink }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = C.panel2; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                <Swatch palette={t.palette} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {active && <span style={{ color: C.rootUi, fontFamily: MONO, fontSize: 11 }}>●</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
