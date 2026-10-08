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

  const track = tempoMeta(tempoBpm);

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

// Flatten timed events into sorted on/off moments; at equal ticks, offs go
// first so a re-struck note never gets swallowed by its own previous note-off.
function noteMoments(events, ticksPerBeat) {
  const spans = [];
  const latest = new Map();
  const ordered = (events || []).filter((e) => e && Number.isFinite(e.t) && Number.isFinite(e.dur) && e.t >= 0 && e.dur > 0).slice().sort((a, b) => a.t - b.t);
  for (const e of ordered) {
    const vel = Math.max(1, Math.min(127, Math.round((Number.isFinite(e.v) ? e.v : 0.75) * 127)));
    const on = Math.round(e.t * ticksPerBeat);
    const off = Math.max(on + 1, Math.round((e.t + e.dur) * ticksPerBeat));
    for (const n of new Set((e.midis || []).filter(Number.isFinite).map(Math.round))) {
      if (n < 0 || n > 127) continue;
      const previous = latest.get(n);
      if (previous && previous.on === on) {
        previous.off = Math.max(previous.off, off);
        previous.vel = Math.max(previous.vel, vel);
        continue;
      }
      if (previous && previous.off > on) previous.off = on;
      const span = { on, off, note: n, vel };
      spans.push(span); latest.set(n, span);
    }
  }
  const moments = [];
  for (const span of spans) {
    moments.push({ tick: span.on, kind: 1, note: span.note, vel: span.vel });
    moments.push({ tick: span.off, kind: 0, note: span.note, vel: 0 });
  }
  moments.sort((a, b) => a.tick - b.tick || a.kind - b.kind);
  return moments;
}

function tempoMeta(tempoBpm) {
  const usPerBeat = Math.min(0xffffff, Math.max(1, Math.round(60000000 / tempoBpm)));
  return [...vlq(0), 0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff];
}

const END_OF_TRACK = [0, 0xff, 0x2f, 0x00]; // delta 0 + meta

const trackChunk = (body) => [...str("MTrk"), ...u32(body.length), ...body];

/**
 * Build a MIDI file from absolute-timed events (the Arranger's output).
 * @param {Array<{t:number, dur:number, midis:number[], v?:number}>} events  beats domain
 * @param {object} opts  { tempoBpm=90, ticksPerBeat=480 }
 * @returns {Uint8Array} the .mid file bytes
 */
export function eventsToMidi(events, opts = {}) {
  const { tempoBpm = 90, ticksPerBeat = 480 } = opts;
  const track = tempoMeta(tempoBpm);
  let last = 0;
  for (const m of noteMoments(events, ticksPerBeat)) {
    track.push(...vlq(m.tick - last));
    last = m.tick;
    if (m.kind === 1) track.push(0x90, m.note, m.vel);
    else track.push(0x80, m.note, 0x00);
  }
  track.push(...END_OF_TRACK);

  const header = [...str("MThd"), ...u32(6), ...u16(0), ...u16(1), ...u16(ticksPerBeat)];
  return new Uint8Array([...header, ...trackChunk(track)]);
}

/**
 * Build a format-1 multi-track MIDI file — the Band's export. One conductor
 * track (tempo + time signature), then one track per part, each stamped with
 * its own channel (drums belong on channel 9 per General MIDI).
 * @param {Array<{name?:string, channel?:number, program?:number,
 *                events:Array<{t,dur,midis,v?}>}>} tracks
 * @param {object} opts  { tempoBpm=90, ticksPerBeat=480, timeSig?:{num,den} }
 * @returns {Uint8Array} the .mid file bytes
 */
export function eventsToMidiTracks(tracks, opts = {}) {
  const { tempoBpm = 90, ticksPerBeat = 480, timeSig } = opts;
  const parts = tracks || [];

  const conductor = tempoMeta(tempoBpm);
  if (timeSig) {
    // denominator is stored as a power of two (4 -> 2, 8 -> 3);
    // 24 MIDI clocks per metronome tick, 8 32nd notes per quarter (defaults).
    const denPow = Math.max(0, Math.round(Math.log2(timeSig.den || 4)));
    conductor.push(...vlq(0), 0xff, 0x58, 0x04, (timeSig.num || 4) & 0x7f, denPow, 24, 8);
  }
  conductor.push(...END_OF_TRACK);

  const chunks = [trackChunk(conductor)];
  for (const part of parts) {
    const ch = clampCh(part.channel ?? 0);
    const body = [];
    if (part.name) {
      const name = [...new TextEncoder().encode(String(part.name).slice(0, 96))];
      body.push(...vlq(0), 0xff, 0x03, ...vlq(name.length), ...name);
    }
    if (part.program != null) body.push(...vlq(0), 0xc0 | ch, part.program & 0x7f);
    let last = 0;
    for (const m of noteMoments(part.events, ticksPerBeat)) {
      body.push(...vlq(m.tick - last));
      last = m.tick;
      if (m.kind === 1) body.push(0x90 | ch, m.note, m.vel);
      else body.push(0x80 | ch, m.note, 0x00);
    }
    body.push(...END_OF_TRACK);
    chunks.push(trackChunk(body));
  }

  const header = [...str("MThd"), ...u32(6), ...u16(1), ...u16(1 + parts.length), ...u16(ticksPerBeat)];
  const out = [...header];
  for (const c of chunks) out.push(...c);
  return new Uint8Array(out);
}

/* ---- live MIDI messages (for Web MIDI output) — pure byte builders ---- */
const clampCh = (ch) => Math.max(0, Math.min(15, ch | 0));
const clampNote = (n) => Math.max(0, Math.min(127, n | 0));
const clampVel = (v) => Math.max(0, Math.min(127, v | 0));

export const noteOn = (note, velocity = 80, channel = 0) =>
  [0x90 | clampCh(channel), clampNote(note), clampVel(velocity)];

export const noteOff = (note, channel = 0) =>
  [0x80 | clampCh(channel), clampNote(note), 0];
