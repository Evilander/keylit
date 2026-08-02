// onesong.js — the brains of the One Song room: Tweedy's assignment made
// habitual. A "bench day" is any day you did the work (started the clock,
// kept a sketch, worked a door, finished a song); the streak counts them;
// the shelf holds what you finished. Pure: every function takes time in and
// returns new state out. The gamification law holds here — days and finished
// songs are the only score, and neither ever scolds.

/** The six doors — Tweedy's unstuck exercises, paraphrased tight.
 *  Shared with the Write desk so the two rooms name them identically. */
export const EXERCISES = [
  ["Word ladder", "List ten verbs and ten visible nouns. Pair the combinations that should not work; keep the lines that surprise you."],
  ["Cut-ups", "Break an existing lyric into lines. Move the last line first, then rebuild by sound instead of story."],
  ["Wrong instrument", "Play the section on the instrument you know least. Keep the accident you would never choose on purpose."],
  ["Mumble translation", "Sing vowel shapes over the movement. Transcribe what the sounds almost say before polishing grammar."],
  ["Change the narrator", "Write the verse as a different person, object, or place. Distance often produces the honest line."],
  ["Start with the weak part", "Reverse the section, begin on its least convincing chord, or make the quiet part loud."],
];

const DOOR_NAMES = new Set(EXERCISES.map(([name]) => name));
const DAY_CAP = 400; // ~13 months of tallies is plenty of history
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local calendar date — the bench lives where the player does, so a late
 *  session before midnight is still "today", never UTC-tomorrow. */
export function dayKey(at) {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function normalizeOneSongState(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const days = {};
  if (r.days && typeof r.days === "object" && !Array.isArray(r.days)) {
    for (const [key, marks] of Object.entries(r.days)) {
      if (!DAY_RE.test(key) || !Array.isArray(marks)) continue;
      const clean = marks.filter((m) => typeof m === "string" && m).slice(0, 8);
      if (clean.length) days[key] = clean;
    }
  }
  const finished = Array.isArray(r.finished)
    ? r.finished
        .filter((f) => f && typeof f === "object" && typeof f.title === "string" && f.title.trim() && Number.isFinite(f.at))
        .map((f) => ({ title: f.title, at: f.at, draftId: typeof f.draftId === "string" ? f.draftId : null }))
    : [];
  const doors = {};
  if (r.doors && typeof r.doors === "object" && !Array.isArray(r.doors)) {
    for (const [name, at] of Object.entries(r.doors)) {
      if (DOOR_NAMES.has(name) && Number.isFinite(at)) doors[name] = at;
    }
  }
  return { days, finished, doors };
}

function trimDays(days) {
  const keys = Object.keys(days);
  if (keys.length <= DAY_CAP) return days;
  const keep = keys.sort().slice(keys.length - DAY_CAP);
  const out = {};
  for (const k of keep) out[k] = days[k];
  return out;
}

/** Record that the work happened today. `what` is the reason ("timer",
 *  "kept", "door", "finished") — kept for honesty, deduped per day. */
export function markDay(state, { at, what = "wrote" }) {
  const key = dayKey(at);
  const existing = state.days[key] || [];
  if (existing.includes(what)) return state;
  return { ...state, days: trimDays({ ...state.days, [key]: [...existing, what] }) };
}

/** The last `days` calendar days, oldest first, each with its lit flag. */
export function benchDays(state, { now, days = 14 }) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * MS_PER_DAY);
    out.push({ key, wrote: Boolean(state.days[key]) });
  }
  return out;
}

/** Consecutive bench days. Anti-guilt by construction: an unmarked TODAY
 *  doesn't break the run — the streak only resets once a full day was let
 *  pass. (Tweedy would rather you write than defend a number anyway.) */
export function streak(state, now) {
  let n = 0;
  let cursor = now;
  if (!state.days[dayKey(cursor)]) cursor -= MS_PER_DAY; // today still open
  while (state.days[dayKey(cursor)]) { n++; cursor -= MS_PER_DAY; }
  return n;
}

/** Put a song on the shelf. The title is the trophy; the number is its order. */
export function finishSong(state, { title, at, draftId = null }) {
  const clean = typeof title === "string" ? title.trim() : "";
  if (!clean) return state;
  if (draftId && state.finished.some((f) => f.draftId === draftId)) return state;
  const withDay = markDay(state, { at, what: "finished" });
  return { ...withDay, finished: [...withDay.finished, { title: clean, at, draftId }] };
}

export function removeFinished(state, index) {
  if (index < 0 || index >= state.finished.length) return state;
  return { ...state, finished: state.finished.filter((_, i) => i !== index) };
}

/** Stamp a door worked; the day lights with it. */
export function exerciseDone(state, name, at) {
  if (!DOOR_NAMES.has(name)) return state;
  const withDay = markDay(state, { at, what: "door" });
  return { ...withDay, doors: { ...withDay.doors, [name]: at } };
}

/** The door least recently opened — untouched doors first, list order breaks ties. */
export function nextDoor(state) {
  let best = null;
  let bestAt = Infinity;
  for (const [name] of EXERCISES) {
    const at = state.doors[name];
    if (at === undefined) return name; // never opened wins outright
    if (at < bestAt) { bestAt = at; best = name; }
  }
  return best;
}
