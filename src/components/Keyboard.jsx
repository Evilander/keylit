// Keyboard.jsx — the shared instrument. One lit keyboard every room writes to,
// now living in the persistent dock. Pure presentational: caller supplies
// roleFor(midi) -> { role, label, ghost } | null.
//
// DOM keys (not SVG) so the instrument stretches to ANY container height —
// the dock's 76px↔220px morph is a plain CSS height transition on the parent
// and the keys simply fill it. Same public API as the old SVG version.
import { KEYS, midiOctave } from "../lib/voicing.js";
import { C } from "../ui/theme.js";

// role -> [fill, glow], read at render time so applyTheme's live palette applies
const roleColors = (role) => {
  switch (role) {
    case "root": return [C.root, C.rootGlow];
    case "bass": return [C.bass, C.bassGlow];
    case "pedal": return [C.ai, C.aiGlow];
    case "scale": return [C.tone, C.toneGlow];
    default: return [C.tone, C.toneGlow]; // tone fallback
  }
};

// Real off-center nudges (fraction of a white key's width) so the black keys
// sit the way a piano actually casts them, not on a grid.
const BLACK_NUDGE = { 1: -0.13, 3: 0.13, 6: -0.16, 8: 0, 10: 0.16 };

// Where a key sits, as {left, width} percentages of the instrument — the same
// math the render uses, exported so overlays (the waterfall lane) can align
// their marks to the real keys instead of re-deriving a near-miss layout.
export function keyGeometry(midi) {
  const whites = KEYS.whiteKeys;
  const whiteW = 100 / whites.length;
  const wi = whites.findIndex((w) => w.midi === midi);
  if (wi >= 0) return { left: wi * whiteW, width: whiteW };
  const below = whites.findIndex((w) => w.midi === midi - 1);
  if (below < 0) return null;
  const bw = whiteW * 0.58;
  return { left: (below + 1) * whiteW - bw / 2 + (BLACK_NUDGE[midi % 12] || 0) * whiteW, width: bw };
}

const WHITE_GRADIENT = "linear-gradient(180deg,#FBF7EC 0%,#F1EBDC 82%,#E4DCC8 100%)";
const BLACK_GRADIENT = "linear-gradient(180deg,#3A362E 0%,#211E19 12%,#16130F 100%)";

export default function Keyboard({ roleFor, onKey, flash, height = 190, ariaLabel = "piano keyboard" }) {
  const whites = KEYS.whiteKeys;
  const whiteW = 100 / whites.length;
  const isFlash = (m) => flash && flash.has(m);

  const whiteInfo = whites.map((k) => (roleFor ? roleFor(k.midi) : null));

  const blacks = KEYS.blackKeys.map((k) => {
    const wi = whites.findIndex((w) => w.midi === k.midi - 1);
    const bw = whiteW * 0.58;
    return {
      midi: k.midi,
      left: (wi + 1) * whiteW - bw / 2 + (BLACK_NUDGE[k.midi % 12] || 0) * whiteW,
      width: bw,
      info: roleFor ? roleFor(k.midi) : null,
    };
  });

  return (
    <div role="group" aria-label={ariaLabel}
      style={{ position: "relative", height, minHeight: 56, userSelect: "none" }}>
      <div style={{ display: "flex", gap: 1, height: "100%" }}>
        {whites.map((k, i) => {
          const info = whiteInfo[i];
          const role = info?.role || null;
          const ghost = info?.ghost;
          const flashed = isFlash(k.midi);
          const lit = (!!role && !ghost) || flashed;
          const [fill, glow] = role ? roleColors(role) : [null, null];
          const isC = k.midi % 12 === 0;
          return (
            <div key={k.midi} onClick={() => onKey?.(k.midi)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end",
                alignItems: "center", minWidth: 0,
                background: flashed ? "#fff" : lit ? fill : WHITE_GRADIENT,
                borderRadius: "0 0 2px 2px",
                cursor: onKey ? "pointer" : "default",
                transition: "background 180ms ease, box-shadow 250ms ease",
                boxShadow: lit
                  ? `0 0 14px ${glow || "#fff"}`
                  : "inset -1px 0 0 rgba(0,0,0,.08), inset 0 -2px 0 rgba(0,0,0,.1)",
              }}>
              {ghost && role && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: fill, marginBottom: 8, boxShadow: `0 0 8px ${fill}` }} />
              )}
              {info?.label ? (
                <span style={{ fontFamily: "var(--kl-mono)", fontSize: 10, fontWeight: 600, color: lit ? "rgba(13,12,9,.72)" : "#8C8272", paddingBottom: 5, pointerEvents: "none" }}>
                  {info.label}
                </span>
              ) : isC && !lit && !ghost ? (
                <span style={{ fontFamily: "var(--kl-mono)", fontSize: 8, color: "#B7AD99", paddingBottom: 4, pointerEvents: "none" }}>
                  C{midiOctave(k.midi)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {blacks.map((b) => {
        const role = b.info?.role || null;
        const ghost = b.info?.ghost;
        const flashed = isFlash(b.midi);
        const lit = (!!role && !ghost) || flashed;
        const [fill, glow] = role ? roleColors(role) : [null, null];
        return (
          <div key={b.midi} onClick={() => onKey?.(b.midi)}
            style={{
              position: "absolute", top: 0, left: `${b.left.toFixed(3)}%`, width: `${b.width.toFixed(3)}%`,
              height: "63%", zIndex: 2,
              display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center",
              background: flashed ? "#fff" : lit ? fill : BLACK_GRADIENT,
              borderRadius: "0 0 3px 3px",
              cursor: onKey ? "pointer" : "default",
              transition: "background 180ms ease, box-shadow 250ms ease",
              boxShadow: lit
                ? `0 0 12px ${glow || "#fff"}`
                : "inset 0 -4px 0 rgba(255,255,255,.06), 0 3px 5px rgba(0,0,0,.55)",
            }}>
            {ghost && role && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: fill, marginBottom: 6, boxShadow: `0 0 7px ${fill}` }} />
            )}
            {b.info?.label && (
              <span style={{ fontFamily: "var(--kl-mono)", fontSize: 9, fontWeight: 600, color: lit ? "rgba(13,12,9,.72)" : "#C7BFAE", paddingBottom: 4, pointerEvents: "none" }}>
                {b.info.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
