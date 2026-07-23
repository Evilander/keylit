// theme.js — shared palette + style helpers. Single source of truth so App.jsx
// and the components don't drift apart.
//
// "Color-Shift": one instrument, many rooms of light. A theme is ONE palette
// object; applyTheme() re-points the live C object AND writes every --kl-* CSS
// custom property from that same palette, so JS inline styles (read C) and CSS
// (read var(--kl-*)) can never disagree. Adding a theme = adding a palette.
//
// Two laws hold across every theme:
//   • The semantic accents are stable — root=tangerine, tone=cyan, bass=gold.
//     Only their text/ui brightness shifts to stay legible on the surface; the
//     hue families never change (a musician learns the colors once).
//   • The instrument is always the same dark slab (#0D0C09) — lamplight ignores
//     the theme, so the keys read identically in every room and every palette.

// Shared, theme-invariant blocks ---------------------------------------------
const DECK = { deck: "#0D0C09", deckEdge: "#050403", felt: "#14110C",
  white: "#F5F0E1", whiteShadow: "#E4DCC8", black: "#211E19" };
// core accent hues (never change) + the pedal 4th hue
const HUES = { root: "#E4602F", rootGlow: "#F0895E", tone: "#2E9BA6", toneGlow: "#5CC1CA",
  bass: "#D9A73E", bassGlow: "#E8C168" };
// accent text/ui variants — one set for light grounds, one for dark
const LIGHT_INK = { rootText: "#B4491D", rootUi: "#D4552A", toneText: "#1F7A84", toneUi: "#28929C",
  bassText: "#95701C", bassUi: "#BC8E28", ai: "#8b7bd0", aiGlow: "#b6a6ef" };
const DARK_INK = { rootText: "#F08A5A", rootUi: "#E4602F", toneText: "#57BEC8", toneUi: "#3AAAB4",
  bassText: "#E0B453", bassUi: "#D9A73E", ai: "#9d8ee0", aiGlow: "#b6a6ef" };

const accents = (dark) => ({ ...HUES, ...(dark ? DARK_INK : LIGHT_INK) });

// The palettes -----------------------------------------------------------------
const daylight = {
  bg: "#F7F3E9", panel: "#FFFDF6", panel2: "#F0EAD9", line: "#E3DCC9", lineStrong: "#CFC6AE",
  ink: "#221F1A", muted: "#5C5342", faint: "#8A7C60",
  shadow: "rgba(34,31,26,0.08)", shadowSoft: "rgba(34,31,26,0.05)",
  glass: "rgba(247,243,233,0.88)", onInk: "#F7F3E9",
  ...DECK, ...accents(false),
};

const afterhours = {
  bg: "#171511", panel: "#1F1C16", panel2: "#26221A", line: "#332F26", lineStrong: "#453F31",
  ink: "#F0EADB", muted: "#B5AA93", faint: "#92876F",
  shadow: "rgba(0,0,0,0.5)", shadowSoft: "rgba(0,0,0,0.32)",
  glass: "rgba(23,21,17,0.88)", onInk: "#171511",
  ...DECK, ...accents(true),
};

// Nightshade — a cool deep-violet dark. Where After Hours is warm brown-black,
// this is indigo/plum at midnight; the warm tangerine/gold accents sing hardest
// against a cool ground.
const nightshade = {
  bg: "#14131C", panel: "#1C1B28", panel2: "#232232", line: "#302F42", lineStrong: "#423F5A",
  ink: "#ECEAF4", muted: "#ABA6C2", faint: "#857FA0",
  shadow: "rgba(0,0,0,0.55)", shadowSoft: "rgba(0,0,0,0.34)",
  glass: "rgba(20,19,28,0.88)", onInk: "#14131C",
  ...DECK, ...accents(true),
};

// Newsprint — a crisp, cool, high-contrast light. Bright near-white paper and
// near-black ink (vs Daylight's warm cream), so the accents pop like spot color
// on a printed page.
const newsprint = {
  bg: "#FBFAF8", panel: "#FFFFFF", panel2: "#F1F0EC", line: "#E2E0DA", lineStrong: "#C7C4BB",
  ink: "#17150F", muted: "#55524A", faint: "#857F72",
  shadow: "rgba(20,18,12,0.09)", shadowSoft: "rgba(20,18,12,0.05)",
  glass: "rgba(251,250,248,0.9)", onInk: "#FBFAF8",
  ...DECK, ...accents(false),
};

// Foolscap — warm aged paper, a songwriter's legal pad left in the sun. Dimmer
// and tannier than Daylight; the Write desk feels like a notebook in it.
const foolscap = {
  bg: "#EFE7D2", panel: "#F6F0DE", panel2: "#E6DBC0", line: "#D8CBA9", lineStrong: "#C0AF88",
  ink: "#2B2416", muted: "#635839", faint: "#96865E",
  shadow: "rgba(43,36,22,0.1)", shadowSoft: "rgba(43,36,22,0.06)",
  glass: "rgba(239,231,210,0.9)", onInk: "#EFE7D2",
  ...DECK, ...accents(false),
};

// The registry — order is the picker order. `dot` is the swatch accent shown in
// the picker; `dark` drives the one-bit "is this a dark room" checks in the UI.
export const THEMES = [
  { id: "daylight", label: "Daylight", dark: false, palette: daylight },
  { id: "afterhours", label: "After hours", dark: true, palette: afterhours },
  { id: "nightshade", label: "Nightshade", dark: true, palette: nightshade },
  { id: "newsprint", label: "Newsprint", dark: false, palette: newsprint },
  { id: "foolscap", label: "Foolscap", dark: false, palette: foolscap },
];

const BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const C = { ...daylight };

const THEME_KEY = "keylit.theme.v2"; // v1 stored only "light"/"dark"

export function themeIsDark(id) {
  return !!BY_ID[id]?.dark;
}

/** Current theme id — a valid registry id, migrating the old light/dark key. */
export function currentTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && BY_ID[saved]) return saved;
    const legacy = localStorage.getItem("keylit.theme.v1");
    if (legacy === "dark") return "afterhours";
    if (legacy === "light") return "daylight";
  } catch { /* storage-less context */ }
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "afterhours";
  } catch { /* no matchMedia */ }
  return "daylight";
}

// palette key → CSS custom property. The names diverge (bg→base) for historical
// reasons; this is the one place that mapping lives.
const CSS_VARS = {
  bg: "--kl-base", panel: "--kl-raised", panel2: "--kl-sunken", line: "--kl-hair",
  lineStrong: "--kl-line", ink: "--kl-ink", muted: "--kl-muted", faint: "--kl-faint",
  shadow: "--kl-shadow", shadowSoft: "--kl-shadow-soft", glass: "--kl-glass",
  onInk: "--kl-on-ink", deck: "--kl-deck",
  root: "--kl-root", rootText: "--kl-root-text", rootUi: "--kl-root-ui",
  tone: "--kl-tone", toneText: "--kl-tone-text", toneUi: "--kl-tone-ui",
  bass: "--kl-bass", bassText: "--kl-bass-text", bassUi: "--kl-bass-ui",
};

/** Re-point C, write the CSS var layer from the same palette, persist. Caller
 * re-renders (App state). Falls back to Daylight for an unknown id. */
export function applyTheme(id) {
  const theme = BY_ID[id] || THEMES[0];
  Object.assign(C, theme.palette);
  try {
    const root = document.documentElement;
    root.dataset.klTheme = theme.id;
    // keep the light/dark hint for anything (incl. the browser) reading it
    root.style.colorScheme = theme.dark ? "dark" : "light";
    for (const [key, cssVar] of Object.entries(CSS_VARS)) {
      if (theme.palette[key] != null) root.style.setProperty(cssVar, theme.palette[key]);
    }
  } catch { /* SSR/tests */ }
  try { localStorage.setItem(THEME_KEY, theme.id); } catch { /* private mode */ }
  return theme.id;
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
