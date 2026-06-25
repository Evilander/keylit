// voice.js — the authored tutor voice. PURE: no React, no audio, no DOM, no
// network. This is Keylit's personality as data + deterministic helpers, kept
// model-agnostic so the Claude proxy (and the local UI) share one source of
// truth. PERSONA is injected into the proxy system prompt; CONCEPTS is static
// microcopy for the tutor surface; reaction()/buildSuggestionChips() are
// deterministic so they're testable and render identically every time.

import { spellPc, spellChord } from "./spelling.js";

// System-prompt-ready spec for the tutor voice. Concise on purpose: it's a
// character brief, not a manual. Edit the principles, not the framing.
export const PERSONA = [
  "You are the Keylit tutor: a warm, opinionated, seasoned bandmate teaching a",
  "touring guitarist how to think at the piano. You've played the rooms; you",
  "explain like you're leaning over the keys between songs, not lecturing.",
  "",
  "How you talk:",
  "- Lead with the ONE sentence that makes it click, then support it. Never bury",
  "  the punchline under setup.",
  "- Speak Nashville numbers and the fretboard FIRST, then bridge to standard",
  "  theory. They already know shapes and the 1-4-5 — meet them there, then name",
  "  the textbook term so it sticks.",
  "- Have taste. When there's a choice, name your favorite and give the one-line",
  "  why. Never hide behind 'it depends' mush — pick, then note the exception.",
  "- A little earned humor, zero condescension. You're rooting for them.",
  "- Be proactive: end by offering the next rung — the move, drill, or chord that",
  "  naturally follows what they just got.",
  "",
  "Hard rules: stay concrete (real notes, real chords, real keys). If they're",
  "wrong, correct kindly and immediately — no scolding, no 'well, technically'.",
].join("\n");

// Keyed one-liner explanations for the tutor UI. Each has `line` (one vivid
// clicking sentence) and `bridge` (a fretboard -> piano analogy). Written in the
// PERSONA voice. Keep them short and great.
export const CONCEPTS = {
  "scale-formula": {
    line: "A major scale is just one fixed pattern of steps — whole whole half, whole whole whole half — and every major key is that same pattern started on a different note.",
    bridge: "It's the do-re-mi you already hum walking up a single string: same spacing every time, the note you start on just renames the key.",
  },
  "why-one-sharp": {
    line: "G major needs F# because the pattern demands a half step into the 8, and F-natural would land a whole step short — the sharp is the scale fixing its own spacing.",
    bridge: "On the neck it's the difference between fretting the F-natural and nudging up one fret to F#: that one fret is the whole reason G has a sharp.",
  },
  "half-steps": {
    line: "A half step is the smallest move there is — the very next key, black or white — and a whole step is just two of those stacked.",
    bridge: "One fret is a half step, two frets is a whole step; the piano's just the same ruler stood on end with the frets painted black and white.",
  },
  "degrees": {
    line: "Number the notes of the key 1 through 7 and you stop memorizing songs — you start hearing 'that's the 4 going to the 5' no matter what key you're in.",
    bridge: "It's the Nashville number you already call out on stage, just mapped onto seven keys instead of six strings.",
  },
  "diatonic-qualities": {
    line: "Stack thirds inside a major key and the chords fall out in a fixed order — major, minor, minor, major, major, minor, diminished — the same every time, so the 2 and 6 are always minor.",
    bridge: "Same reason your open chords in a key are mostly the comfy ones: the key decides which shapes are major and which are minor for you.",
  },
  "function-tsd": {
    line: "Every chord is doing one of three jobs — home (tonic), tension (dominant), or the in-between that leads to tension (subdominant) — and music is just leaving home and coming back.",
    bridge: "It's the pull you feel from the 5 back to the 1 in a blues turnaround, named: that itch to resolve is the dominant doing its job.",
  },
  "pedal": {
    line: "A pedal tone is one note you hold steady while the chords change over it — when it's a chord tone it glows, when it isn't it grinds, and that grind is the whole point.",
    bridge: "It's a droning open string you let ring while you move a shape up the neck: same note, shifting harmony underneath.",
  },
  "nashville-roman": {
    line: "Nashville numbers and Roman numerals say the exact same thing — '1 4 5' is 'I IV V' — one's the studio shorthand, the other's the textbook, and the case of the Roman tells you major or minor.",
    bridge: "You already count songs off in numbers on stage; Roman numerals are just that chart dressed up for the page, with lowercase meaning a minor chord.",
  },
};

// Encouraging bandmate lines for a correct answer. Kept short; selected
// deterministically by seed so the UI and tests are reproducible.
const CORRECT_LINES = [
  "There it is — locked in.",
  "Yep, that's the one. You're hearing it now.",
  "Nailed it. That's exactly the move.",
  "Clean. You could call that one on stage.",
  "That's it — and you got there fast.",
];

// Kind, no-scold correction lines for a wrong answer. They redirect, never
// shame, and keep the player moving.
const WRONG_LINES = [
  "Close — let's nudge that one and try again.",
  "Not quite, but I see the logic. Here's the fix.",
  "Almost. Listen for it one more time.",
  "That's the common trap — easy to land on. Let's reset.",
  "No worries, that one's slippery. Walk it back with me.",
];

// Deterministic reaction to an answer. correct -> encouragement, else a kind
// correction. `seed` picks the variant (no Math.random, fully testable).
export function reaction(correct, seed = 0) {
  const pool = correct ? CORRECT_LINES : WRONG_LINES;
  const i = ((Math.trunc(seed) % pool.length) + pool.length) % pool.length;
  return pool[i];
}

// Human key name for a label, e.g. "G major" / "A minor", spelled for the key.
function keyName(key) {
  const tonicName = spellPc(key.tonic, key);
  return `${tonicName} ${key.mode === "minor" ? "minor" : "major"}`;
}

// Build up to 4 suggestion chips for the tutor surface. Pure + deterministic —
// derived entirely from the key/chord context, never from a model call. Chips
// carry an `intent` from a fixed vocabulary the caller routes on. Order is
// stable: diatonic and relative are always first (so they survive the cap),
// then a pedal chip when a chord is in context, then drills to fill to 4.
export function buildSuggestionChips(context = {}) {
  const key = context.key || { tonic: 0, mode: "major" };
  const chord = context.chord;
  const chips = [];

  chips.push({
    id: "diatonic",
    label: `Show the chords in ${keyName(key)}`,
    intent: "diatonic",
  });

  chips.push({
    id: "relative",
    label: key.mode === "minor" ? "Jump to its relative major" : "Jump to its relative minor",
    intent: "relative",
  });

  if (chord) {
    const name = spellChord(chord, key) || chord.raw || "this chord";
    chips.push({
      id: "pedal",
      label: `Try a pedal tone under ${name}`,
      intent: "pedal",
    });
  }

  // Fill remaining slots (cap at 4) with drills, in priority order.
  const fillers = [
    { id: "degree-drill", label: "Quiz me on the degrees", intent: "degree-drill" },
    { id: "numbers", label: "See it in Nashville numbers", intent: "numbers" },
  ];
  for (const f of fillers) {
    if (chips.length >= 4) break;
    chips.push(f);
  }

  return chips.slice(0, 4);
}
