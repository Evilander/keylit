// theme.js — shared palette + style helpers. Single source of truth so App.jsx
// and the components don't drift apart.
//
// TWO registers of the same instrument:
//   • "The Fretboard Press" (light) — a warm songbook: near-white paper, warm
//     brown-black ink, one dark element (the keyboard's recessed deck).
//   • "After Hours" (dark) — the same shop with the lamps low: warm dark wood,
//     lamplit ink, the deck sinking a shade deeper. Never slate, never blue.
//
// C is a LIVE object: applyTheme() re-points its values and flips the CSS
// custom properties (bench.css [data-kl-theme="dark"]). Components read C in
// render, so a state change in App repaints everything — no remounts, no
// context plumbing. FUNCTION_COLOR/FILL are getters for the same reason.

const LIGHT = {
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

const DARK = {
  // warm dark wood, not slate
  bg: "#161210", panel: "#1F1A15", panel2: "#292219",
  line: "#383026", lineStrong: "#4C4234",
  // lamplit inks
  ink: "#EDE6DA", muted: "#A99F90", faint: "#7B7266",
  // the deck sinks one shade deeper than the room
  deck: "#0D0A08", deckEdge: "#050303", felt: "#26120F",
  // keys read the same under the lamp
  white: "#f3ede2", whiteShadow: "#cfc6b6", black: "#221d18",
  // raw hues unchanged (they were born for dark surfaces); text/UI variants brighten
  root: "#f0b429", rootGlow: "#f6c95a", rootText: "#DCA62F", rootUi: "#C9962C",
  tone: "#46cfc2", toneGlow: "#74e3d8", toneText: "#54C9BB", toneUi: "#3AB3A6",
  bass: "#f08a5d", bassGlow: "#f6a982", bassText: "#F09363", bassUi: "#E97B47",
  ai: "#9d8ee0", aiGlow: "#b6a6ef",
};

export const C = { ...LIGHT };

const THEME_KEY = "keylit.theme.v1";

/** Current theme id: "light" | "dark". */
export function currentTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage-less context */ }
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  } catch { /* no matchMedia */ }
  return "light";
}

/** Re-point C, flip the CSS layer, persist. Caller re-renders (App state). */
export function applyTheme(mode) {
  Object.assign(C, mode === "dark" ? DARK : LIGHT);
  try { document.documentElement.dataset.klTheme = mode; } catch { /* SSR/tests */ }
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
  return mode;
}

// Harmonic-function colors for TEXT on the current surface (Tonic / Subdominant /
// Dominant). Getters so a theme swap re-reads the live palette.
export const FUNCTION_COLOR = {
  get T() { return C.toneText; },  // home / rest
  get S() { return C.rootText; },  // motion away
  get D() { return C.bassText; },  // tension / pull home
  get "?"() { return C.faint; },
  get color() { return C.muted; },
};

// Raw fills for key-lighting / large badges on the dark deck.
export const FUNCTION_FILL = {
  get T() { return C.tone; },
  get S() { return C.root; },
  get D() { return C.bass; },
  get "?"() { return C.faint; },
  get color() { return C.ai; },
};

export const FUNCTION_LABEL = {
  T: "tonic", S: "subdominant", D: "dominant", "?": "chromatic", color: "color",
};

// Three deliberate voices — no system-font fallback as the primary face.
// Newsreader (display/editorial serif) · Bricolage Grotesque (UI/body) · Berkeley Mono (data).
export const MONO = "'Berkeley Mono', ui-monospace, Menlo, Consolas, monospace";
export const SANS = "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const DISPLAY = "'Newsreader', Georgia, 'Times New Roman', serif";
