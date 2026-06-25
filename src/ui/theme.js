// theme.js — shared palette + small style helpers. Single source of truth so
// App.jsx and the new components don't drift apart.

export const C = {
  bg: "#14110f", panel: "#1d1916", panel2: "#241f1a", line: "#322b24",
  ink: "#ece6dd", muted: "#9a9082", faint: "#6b6256",
  white: "#f3ede2", whiteShadow: "#cfc6b6", black: "#221d18",
  root: "#f0b429", rootGlow: "#f6c95a",
  tone: "#46cfc2", toneGlow: "#74e3d8",
  bass: "#f08a5d", bassGlow: "#f6a982",
  ai: "#b48ef0", aiGlow: "#cdb2f6", // deep-mode accent
};

// Harmonic-function colors (Tonic / Subdominant / Dominant).
export const FUNCTION_COLOR = {
  T: C.tone,   // home / rest
  S: C.root,   // motion away
  D: C.bass,   // tension / pull home
  "?": C.faint,
  color: C.ai,
};

export const FUNCTION_LABEL = {
  T: "tonic", S: "subdominant", D: "dominant", "?": "chromatic", color: "color",
};

// Three deliberate voices — no system-font fallback as the primary face.
// Fraunces (display) · Space Grotesk (UI/body) · Berkeley Mono (data/readouts).
export const MONO = "'Berkeley Mono', ui-monospace, Menlo, Consolas, monospace";
export const SANS = "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
