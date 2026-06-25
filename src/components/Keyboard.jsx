// Keyboard.jsx — the shared instrument. One lit keyboard every room writes to.
// Pure presentational: caller supplies roleFor(midi) -> { role, label, ghost } | null.
// Tactile "Bench" rendering (key depth, felt, tube-glow on lit keys).
import { KEYS, KEY_W, KEY_H, BLK_W, BLK_H, midiOctave } from "../lib/voicing.js";
import { C } from "../ui/theme.js";

// role -> [fill, glow]
const ROLE_COLORS = {
  root: [C.root, C.rootGlow],
  tone: [C.tone, C.toneGlow],
  bass: [C.bass, C.bassGlow],
  scale: [C.tone, C.toneGlow],
  pedal: [C.ai, C.aiGlow],
};

export default function Keyboard({ roleFor, onKey, flash, ariaLabel = "piano keyboard" }) {
  const isFlash = (m) => flash && flash.has(m);

  const renderWhite = (k) => {
    const info = roleFor ? roleFor(k.midi) : null;
    const flashed = isFlash(k.midi);
    const role = info?.role || null;
    const ghost = info?.ghost;
    const lit = (!!role && !ghost) || flashed;
    const [rc, rg] = role ? (ROLE_COLORS[role] || ROLE_COLORS.tone) : [C.toneGlow, C.toneGlow];
    const fill = role && !ghost ? rc : flashed ? C.toneGlow : "url(#klWhite)";
    const isC = k.midi % 12 === 0;
    return (
      <g key={k.midi} onClick={() => onKey?.(k.midi)} style={{ cursor: onKey ? "pointer" : "default" }}>
        <rect
          x={k.x + 1} y={2} width={KEY_W - 2} height={KEY_H} rx={6}
          fill={fill}
          stroke={lit ? rg : ghost && role ? rc : C.whiteShadow}
          strokeWidth={lit ? 1.6 : ghost && role ? 1.5 : 1}
          style={{
            filter: lit ? `drop-shadow(0 0 13px ${rg}cc)` : "none",
            transition: "fill 130ms ease, filter 180ms ease, stroke 130ms ease",
          }}
        />
        {ghost && role && (
          <circle cx={k.x + KEY_W / 2} cy={KEY_H - 26} r={4} fill={rc} opacity={0.9} />
        )}
        {info?.label && (
          <text x={k.x + KEY_W / 2} y={KEY_H - 13} textAnchor="middle" fontSize="12" fontWeight="700"
            fill={role && !ghost ? "#241a08" : C.muted}
            style={{ fontFamily: "var(--kl-mono)", pointerEvents: "none" }}>{info.label}</text>
        )}
        {!info?.label && isC && !lit && (
          <text x={k.x + KEY_W / 2} y={KEY_H - 12} textAnchor="middle" fontSize="9" fill={C.faint}
            style={{ fontFamily: "var(--kl-mono)", pointerEvents: "none" }}>C{midiOctave(k.midi)}</text>
        )}
      </g>
    );
  };

  const renderBlack = (k) => {
    const info = roleFor ? roleFor(k.midi) : null;
    const flashed = isFlash(k.midi);
    const role = info?.role || null;
    const ghost = info?.ghost;
    const lit = (!!role && !ghost) || flashed;
    const [rc, rg] = role ? (ROLE_COLORS[role] || ROLE_COLORS.tone) : [C.toneGlow, C.toneGlow];
    const fill = role && !ghost ? rc : flashed ? C.toneGlow : "url(#klBlack)";
    return (
      <g key={k.midi} onClick={() => onKey?.(k.midi)} style={{ cursor: onKey ? "pointer" : "default" }}>
        <rect
          x={k.x} y={2} width={BLK_W} height={BLK_H} rx={4}
          fill={fill}
          stroke={lit ? rg : ghost && role ? rc : "#0c0a08"}
          strokeWidth={lit ? 1.6 : ghost && role ? 1.4 : 1}
          style={{
            filter: lit ? `drop-shadow(0 0 12px ${rg}dd)` : "none",
            transition: "fill 130ms ease, filter 180ms ease, stroke 130ms ease",
          }}
        />
        {ghost && role && (
          <circle cx={k.x + BLK_W / 2} cy={BLK_H - 16} r={3.5} fill={rc} opacity={0.95} />
        )}
        {info?.label && (
          <text x={k.x + BLK_W / 2} y={BLK_H - 10} textAnchor="middle" fontSize="9.5" fontWeight="700"
            fill={role && !ghost ? "#241a08" : C.toneGlow}
            style={{ fontFamily: "var(--kl-mono)", pointerEvents: "none" }}>{info.label}</text>
        )}
      </g>
    );
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${KEYS.width} ${KEY_H + 8}`} width="100%"
        style={{ display: "block", maxWidth: KEYS.width, margin: "0 auto", minWidth: 560 }}
        role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id="klWhite" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbf6ec" />
            <stop offset="62%" stopColor={C.white} />
            <stop offset="100%" stopColor={C.whiteShadow} />
          </linearGradient>
          <linearGradient id="klBlack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#342d26" />
            <stop offset="48%" stopColor={C.black} />
            <stop offset="100%" stopColor="#15110d" />
          </linearGradient>
        </defs>
        {KEYS.whiteKeys.map(renderWhite)}
        {KEYS.blackKeys.map(renderBlack)}
      </svg>
    </div>
  );
}
