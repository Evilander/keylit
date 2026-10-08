// usersong.js — build a corpus-shaped song record from the "Add a song" form.
// Pure (no React/DOM/storage). User songs get the SAME intelligence as the
// scraped corpus: explicit fields win, then the sheet's own evidence (string
// labels, prose declarations, capo headers), then sensible defaults.

import { detectCapo } from "./theory.js";
import { canonicalTuning, detectDeclaredTuning } from "./tuning.js";
import { findTabBlocks, parseTabBlock, hasTab } from "./tab.js";

// Encode every code point without case folding or Unicode normalization.
// Parts contain only hex and single hyphens, so the double-hyphen separator
// cannot alias an artist/title boundary. Exact-name edits retain saved IDs in storage.
const identitySlug = (s) => `u~${Array.from(s, (c) => c.codePointAt(0).toString(16)).join("-")}`;

// The transcription's own 6-line string labels, if any (4-line riffs excluded).
function labelsTuning(body) {
  for (const b of findTabBlocks(body || "")) {
    if (b.lines.length !== 6) continue;
    const pb = parseTabBlock(b.lines);
    if (pb.tuningFromLabels) return canonicalTuning(pb.tuning.id);
  }
  return null;
}

/**
 * fields: { artist*, title*, body*, album?, key?, capo?, tuning? }
 * Returns { song, row } — the full record and its light manifest row —
 * or { error } when required fields are missing.
 */
export function buildUserSong(fields, now = 0) {
  const artist = String(fields.artist || "").trim();
  const title = String(fields.title || "").trim();
  const body = String(fields.body || "").replace(/\r\n/g, "\n").trim();
  if (!artist || !title || !body) {
    return { error: "Artist, title, and the chart itself are all required." };
  }

  // Tuning: the field wins; else the sheet's own evidence; else standard.
  let t, tuningSource;
  const fieldTuning = String(fields.tuning || "").trim();
  if (fieldTuning) {
    t = canonicalTuning(fieldTuning);
    tuningSource = "meta";
  } else {
    const lab = labelsTuning(body);
    const dec = lab ? null : detectDeclaredTuning(body);
    t = lab && lab.id !== "standard" ? lab
      : dec && dec !== "standard" ? canonicalTuning(dec)
      : canonicalTuning("standard");
    tuningSource = lab && lab.id !== "standard" ? "labels" : dec ? "declared" : "meta";
  }

  // An explicit capo wins EVEN AT ZERO — "0" means "no capo, I checked",
  // not "go re-read the body's prose" (which may declare a stale capo the
  // re-fretted frets no longer assume). Only an empty field falls through.
  const capoRaw = String(fields.capo ?? "").trim();
  const capoField = Number(capoRaw);
  const capo = capoRaw !== "" && Number.isFinite(capoField) && capoField >= 0
    ? Math.min(11, Math.round(capoField))
    : detectCapo(body) || null;

  const song = {
    id: `user--${identitySlug(artist)}--${identitySlug(title)}`,
    artist, title,
    album: String(fields.album || "").trim() || null,
    albumOrder: 9999,
    source: "user", sourceUrl: null,
    tuning: t.id, tuningRaw: t.spelling, tuningSource,
    capo, key: String(fields.key || "").trim() || null,
    format: hasTab(body) ? "tab" : "chords",
    transcriber: null, fetchedAt: now ? new Date(now).toISOString().slice(0, 10) : null,
    body,
  };
  const { body: _b, ...row } = song;
  return { song, row: { ...row, tuningId: t.id, tuningName: t.name } };
}
