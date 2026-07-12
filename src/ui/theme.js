// theme.js — shared palette + style helpers. Single source of truth so App.jsx
// and the components don't drift apart.
//
// "Color-Shift" (design handoff 2026-07-12) — TWO registers of one room:
//   • "Daylight" (light) — cream paper, warm ink, saturated tangerine/cyan/gold
//     accents, high-contrast serif headlines. Airy and editorial.
//   • "After hours" (dark) — warm brown-black, never slate; the accents don't
//     change, the paper does. The instrument dock stays #0D0C09 in both.
//
// C is a LIVE object: applyTheme() re-points its values and flips the CSS
// custom properties (bench.css [data-kl-theme="dark"]). Components read C in
// render, so a state change in App repaints everything — no remounts, no
// context plumbing. FUNCTION_COLOR/FILL are getters for the same reason.

const LIGHT = {
  // cream paper surfaces
  bg: "#F7F3E9", panel: "#FFFDF6", panel2: "#F0EAD9",
  line: "#E3DCC9", lineStrong: "#CFC6AE",
  // warm inks
  ink: "#221F1A", muted: "#6E6553", faint: "#A29578",
  // the instrument dock (the ONE dark element, both themes)
  deck: "#0D0C09", deckEdge: "#050403", felt: "#14110C",
  // piano keys (rendered on the dark deck)
  white: "#F5F0E1", whiteShadow: "#E4DCC8", black: "#211E19",
  // raw harmonic hues — key-lighting + large fills/badges only.
  // root = tangerine, tone = cyan, bass/slash = gold (identical in dark).
  root: "#E4602F", rootGlow: "#F0895E", rootText: "#B4491D", rootUi: "#D4552A",
  tone: "#2E9BA6", toneGlow: "#5CC1CA", toneText: "#1F7A84", toneUi: "#28929C",
  bass: "#D9A73E", bassGlow: "#E8C168", bassText: "#95701C", bassUi: "#BC8E28",
  // a 4th hue reserved strictly for the keyboard's "pedal" role glow — never UI chrome
  ai: "#8b7bd0", aiGlow: "#b6a6ef",
};

const DARK = {
  // warm brown-black, not slate
  bg: "#171511", panel: "#1F1C16", panel2: "#26221A",
  line: "#332F26", lineStrong: "#453F31",
  // lamplit inks
  ink: "#F0EADB", muted: "#A79C86", faint: "#79705C",
  // the dock doesn't move between themes
  deck: "#0D0C09", deckEdge: "#050403", felt: "#14110C",
  // keys read the same under the lamp
  white: "#F5F0E1", whiteShadow: "#E4DCC8", black: "#211E19",
  // raw hues unchanged (semantic, not decorative); text/UI variants brighten
  root: "#E4602F", rootGlow: "#F0895E", rootText: "#F08A5A", rootUi: "#E4602F",
  tone: "#2E9BA6", toneGlow: "#5CC1CA", toneText: "#57BEC8", toneUi: "#3AAAB4",
  bass: "#D9A73E", bassGlow: "#E8C168", bassText: "#E0B453", bassUi: "#D9A73E",
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
// Dominant). Getters so a theme swap re-reads the live palette. Tonic rests in
// cyan (home), Subdominant leans gold (motion away), Dominant pulls tangerine.
export const FUNCTION_COLOR = {
  get T() { return C.toneText; },  // home / rest
  get S() { return C.bassText; },  // motion away
  get D() { return C.rootText; },  // tension / pull home
  get "?"() { return C.faint; },
  get color() { return C.muted; },
};

// Raw fills for key-lighting / large badges on the dark deck.
export const FUNCTION_FILL = {
  get T() { return C.tone; },
  get S() { return C.bass; },
  get D() { return C.root; },
  get "?"() { return C.faint; },
  get color() { return C.ai; },
};

export const FUNCTION_LABEL = {
  T: "tonic", S: "subdominant", D: "dominant", "?": "chromatic", color: "color",
};

// Three deliberate voices — no system-font fallback as the primary face.
// Gloock (display/editorial serif) · Onest (UI/body) · Martian Mono (data).
// Berkeley Mono stays in the mono stack as the licensed fallback.
export const MONO = "'Martian Mono', 'Berkeley Mono', ui-monospace, Menlo, Consolas, monospace";
export const SANS = "'Onest', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const DISPLAY = "'Gloock', Georgia, 'Times New Roman', serif";
