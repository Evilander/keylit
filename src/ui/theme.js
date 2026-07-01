// theme.js — shared palette + style helpers. Single source of truth so App.jsx
// and the components don't drift apart.
//
// "The Fretboard Press" — a warm LIGHT songbook. Surfaces are warm near-whites
// (never cream), ink is a warm brown-black. The ONE dark element is the piano
// keyboard's recessed deck, where the saturated T/S/D hues glow as lit keys.
//
// Two color registers for the harmonic-function system:
//   • raw hues (tone/root/bass + *Glow) — key-lighting on the dark deck, large fills.
//   • on-light text/UI variants (*Text WCAG-AA on light, *Ui for ≥18px/badges).

export const C = {
  // light surfaces
  bg: "#FAFAF8", panel: "#FFFFFF", panel2: "#F2EFEA",
  line: "#E5E0D8", lineStrong: "#D2CABE",
  // warm-brown inks
  ink: "#2A2521", muted: "#6B645C", faint: "#9A938A",
  // the dark keyboard stage (the one place dark material survives)
  deck: "#171310", deckEdge: "#0d0a08", felt: "#2a1714",
  // piano keys (rendered on the dark deck)
  white: "#f3ede2", whiteShadow: "#cfc6b6", black: "#221d18",
  // raw harmonic hues — key-lighting + large fills/badges only
  root: "#f0b429", rootGlow: "#f6c95a", rootText: "#966C0B", rootUi: "#BD880D",
  tone: "#46cfc2", toneGlow: "#74e3d8", toneText: "#218178", toneUi: "#2AA296",
  bass: "#f08a5d", bassGlow: "#f6a982", bassText: "#C94A13", bassUi: "#EC6B32",
  // a 4th hue reserved strictly for the keyboard's "pedal" role glow — never UI chrome
  ai: "#8b7bd0", aiGlow: "#b6a6ef",
};

// Harmonic-function colors for TEXT on light surfaces (Tonic / Subdominant / Dominant).
export const FUNCTION_COLOR = {
  T: C.toneText,  // home / rest
  S: C.rootText,  // motion away
  D: C.bassText,  // tension / pull home
  "?": C.faint,
  color: C.muted,
};

// Raw fills for key-lighting / large badges on the dark deck.
export const FUNCTION_FILL = { T: C.tone, S: C.root, D: C.bass, "?": C.faint, color: C.ai };

export const FUNCTION_LABEL = {
  T: "tonic", S: "subdominant", D: "dominant", "?": "chromatic", color: "color",
};

// Three deliberate voices — no system-font fallback as the primary face.
// Newsreader (display/editorial serif) · Bricolage Grotesque (UI/body) · Berkeley Mono (data).
export const MONO = "'Berkeley Mono', ui-monospace, Menlo, Consolas, monospace";
export const SANS = "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const DISPLAY = "'Newsreader', Georgia, 'Times New Roman', serif";
