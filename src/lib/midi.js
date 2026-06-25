// midi.js — pure, dependency-free Standard MIDI File (type 0) writer.
// Turns a sequence of chord voicings (arrays of MIDI note numbers) into .mid
// bytes you can drop into any DAW. No external library, no DOM.

// Variable-length quantity (MIDI delta-time encoding).
function vlq(n) {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}

function str(s) { return [...s].map((c) => c.charCodeAt(0)); }
function u32(n) { return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]; }
function u16(n) { return [(n >>> 8) & 0xff, n & 0xff]; }

/**
 * Build a MIDI file from chord voicings.
 * @param {number[][]} voicings  one array of MIDI notes per chord
 * @param {object} opts  { tempoBpm=90, beatsPerChord=2, ticksPerBeat=480, velocity=80 }
 * @returns {Uint8Array} the .mid file bytes
 */
export function progressionToMidi(voicings, opts = {}) {
  const { tempoBpm = 90, beatsPerChord = 2, ticksPerBeat = 480, velocity = 80 } = opts;
  const vel = Math.max(0, Math.min(127, velocity | 0)); // data bytes must be 0-127
  const chordTicks = Math.round(beatsPerChord * ticksPerBeat);

  const track = [];
  // tempo meta: microseconds per quarter note (24-bit field, so cap at 0xFFFFFF)
  const usPerBeat = Math.min(0xffffff, Math.max(1, Math.round(60000000 / tempoBpm)));
  track.push(...vlq(0), 0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff);

  for (const notes of voicings) {
    const safe = (notes || []).map((n) => Math.round(n)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 127);
    if (!safe.length) {
      // a rest: still advance time via the next note's delta
      track.push(...vlq(chordTicks), 0xb0, 0x7b, 0x00); // all-notes-off as a time filler
      continue;
    }
    // note-ons at delta 0
    safe.forEach((n) => track.push(...vlq(0), 0x90, n, vel));
    // note-offs: first after chordTicks, rest at delta 0
    safe.forEach((n, i) => track.push(...vlq(i === 0 ? chordTicks : 0), 0x80, n, 0x00));
  }
  // end of track
  track.push(...vlq(0), 0xff, 0x2f, 0x00);

  const header = [...str("MThd"), ...u32(6), ...u16(0), ...u16(1), ...u16(ticksPerBeat)];
  const trackChunk = [...str("MTrk"), ...u32(track.length), ...track];
  return new Uint8Array([...header, ...trackChunk]);
}

// Convenience for the browser: a Blob ready for download.
export function midiBlob(voicings, opts) {
  return new Blob([progressionToMidi(voicings, opts)], { type: "audio/midi" });
}

/* ---- live MIDI messages (for Web MIDI output) — pure byte builders ---- */
const clampCh = (ch) => Math.max(0, Math.min(15, ch | 0));
const clampNote = (n) => Math.max(0, Math.min(127, n | 0));
const clampVel = (v) => Math.max(0, Math.min(127, v | 0));

export const noteOn = (note, velocity = 80, channel = 0) =>
  [0x90 | clampCh(channel), clampNote(note), clampVel(velocity)];

export const noteOff = (note, channel = 0) =>
  [0x80 | clampCh(channel), clampNote(note), 0];
