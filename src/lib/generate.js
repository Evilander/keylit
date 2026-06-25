// generate.js — pure: write a fresh chord progression from a key + mood.
// For songwriting starts. Templates are scale-degree patterns realised into the
// chosen key; "seventhsBias" toggles triads vs. 7th chords.

import { diatonicChord, buildChord } from "./theory.js";

// A template step: { d: scaleDegree(0-6), q?: qualityOverride, seventh?: bool }.
// q overrides the diatonic quality (e.g. a major V in a minor key, or a borrowed
// chord). Without q, the diatonic chord for that degree is used.
export const TEMPLATES = {
  pop: [
    { name: "I–V–vi–IV (the four-chord song)", steps: [{ d: 0 }, { d: 4 }, { d: 5 }, { d: 3 }] },
    { name: "vi–IV–I–V (sensitive)", steps: [{ d: 5 }, { d: 3 }, { d: 0 }, { d: 4 }] },
    { name: "I–vi–IV–V (50s doo-wop)", steps: [{ d: 0 }, { d: 5 }, { d: 3 }, { d: 4 }] },
    { name: "I–IV–vi–V", steps: [{ d: 0 }, { d: 3 }, { d: 5 }, { d: 4 }] },
  ],
  folk: [
    { name: "I–IV–I–V", steps: [{ d: 0 }, { d: 3 }, { d: 0 }, { d: 4 }] },
    { name: "I–V–IV–I", steps: [{ d: 0 }, { d: 4 }, { d: 3 }, { d: 0 }] },
    { name: "I–iii–IV–V", steps: [{ d: 0 }, { d: 2 }, { d: 3 }, { d: 4 }] },
  ],
  jazz: [
    { name: "ii–V–I–VI (turnaround)", steps: [{ d: 1, seventh: true }, { d: 4, q: "7" }, { d: 0, seventh: true }, { d: 5, q: "7" }] },
    { name: "I–vi–ii–V (rhythm changes)", steps: [{ d: 0, seventh: true }, { d: 5, seventh: true }, { d: 1, seventh: true }, { d: 4, q: "7" }] },
    { name: "iii–VI–ii–V–I", steps: [{ d: 2, seventh: true }, { d: 5, q: "7" }, { d: 1, seventh: true }, { d: 4, q: "7" }, { d: 0, seventh: true }] },
  ],
  soul: [
    { name: "I–iii–IV–iv (cry)", steps: [{ d: 0, seventh: true }, { d: 2, seventh: true }, { d: 3, seventh: true }, { d: 3, q: "m" }] },
    { name: "ii–V with extensions", steps: [{ d: 1, seventh: true }, { d: 4, q: "9" }, { d: 0, seventh: true }, { d: 0, seventh: true }] },
  ],
  cinematic: [
    { name: "i–VI–III–VII (epic minor)", steps: [{ d: 0 }, { d: 5 }, { d: 2 }, { d: 6 }] },
    { name: "i–VII–VI–V (andalusian-ish)", steps: [{ d: 0 }, { d: 6 }, { d: 5 }, { d: 4, q: "" }] },
    { name: "i–iv–i–V", steps: [{ d: 0 }, { d: 3 }, { d: 0 }, { d: 4, q: "" }] },
  ],
};

export const GEN_STYLES = Object.keys(TEMPLATES);

// Realise a template into concrete chords for { tonic, mode }. Pure + deterministic.
export function realizeTemplate(template, tonic, mode, { seventhsBias = false } = {}) {
  return template.steps.map((step) => {
    if (step.q !== undefined) {
      // explicit quality override at the degree's scale root
      const scale = mode === "minor"
        ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      const rootSemi = (tonic + scale[step.d]) % 12;
      return buildChord(rootSemi, step.q);
    }
    return diatonicChord(tonic, mode, step.d, step.seventh || seventhsBias);
  });
}

// Generate a progression. style picks a template family; `pick` chooses which
// template (default random — runtime only; pass an index in tests/replays).
export function generateProgression({ tonic = 0, mode = "major", style = "pop", seventhsBias = false, pick } = {}) {
  const fam = TEMPLATES[style] || TEMPLATES.pop;
  const idx = Number.isInteger(pick) ? ((pick % fam.length) + fam.length) % fam.length
    : Math.floor(Math.random() * fam.length);
  const template = fam[idx];
  const chords = realizeTemplate(template, tonic, mode, { seventhsBias })
    .map((ch) => ({ ...ch, section: template.name }));
  return { name: template.name, chords };
}
