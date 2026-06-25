// Bench.jsx — reusable "Bench" UI primitives (the analog-gear vocabulary).
// Structural styling lives in bench.css; these wrap it with content + a11y.
import { C, DISPLAY } from "./theme.js";

// Raised module with an optional engraved label header.
export function Faceplate({ label, right, screws, children, style, className = "", as: As = "section" }) {
  return (
    <As className={`faceplate ${screws ? "plate-screws" : ""} ${className}`} style={{ padding: 16, ...style }}>
      {(label || right) && (
        <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 10 }}>
          {label ? <span className="engraved">{label}</span> : <span />}
          {right}
        </div>
      )}
      {children}
    </As>
  );
}

// Recessed well — for the instrument / anything that should read as "inset".
export function Deck({ children, style, className = "" }) {
  return <div className={`deck ${className}`} style={{ padding: 16, ...style }}>{children}</div>;
}

export function EngLabel({ children, style }) {
  return <span className="engraved" style={style}>{children}</span>;
}

export function Readout({ children, style }) {
  return <div className="readout" style={{ padding: "8px 12px", ...style }}>{children}</div>;
}

export function BenchButton({ primary, className = "", children, ...props }) {
  return (
    <button className={`bench-btn ${primary ? "primary" : ""} ${className}`} {...props}>
      {children}
    </button>
  );
}

// A small vertical VU column. `level` of `max` bars lit, in `color`.
export function Vu({ level = 0, max = 5, color = C.tone, title }) {
  return (
    <span className="vu" style={{ color }} title={title} aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < level ? "on" : ""} style={{ height: `${30 + i * 17}%` }} />
      ))}
    </span>
  );
}

export function RoomTabs({ value, onChange, tabs }) {
  return (
    <div className="room-tabs" role="tablist" aria-label="Rooms">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id}
          className="room-tab" onClick={() => onChange(t.id)} style={value === t.id ? { color: t.color } : undefined}>
          <span className="dot" style={{ background: t.color, boxShadow: `0 0 7px ${t.color}` }} />
          <span style={{ color: value === t.id ? C.ink : undefined }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// The proactive "next rung" chips. chips: [{id,label,intent}]; onIntent(intent, chip).
export function SuggestionChips({ chips, onIntent }) {
  if (!chips || !chips.length) return null;
  return (
    <div className="flex items-center kl-stagger" style={{ gap: 8, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <button key={c.id} className="chip" onClick={() => onIntent?.(c.intent, c)}>
          <span className="lead">&rsaquo;</span>{c.label}
        </button>
      ))}
    </div>
  );
}

// A big Fraunces section title with a mono kicker — the "room" heading.
export function RoomTitle({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {kicker && <div className="engraved" style={{ marginBottom: 6 }}>{kicker}</div>}
      <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink }}>{title}</h2>
      {sub && <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 13.5, lineHeight: 1.5, maxWidth: 640 }}>{sub}</p>}
    </div>
  );
}
