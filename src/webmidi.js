// webmidi.js — thin Web MIDI OUT wrapper. Lets Keylit send live MIDI to a
// connected device or a virtual port (e.g. loopMIDI on Windows, IAC on macOS)
// so the chords play through your DAW + VSTs. Kept out of lib/ (touches navigator).

import { noteOn, noteOff } from "./lib/midi.js";

export const isMidiSupported = () =>
  typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";

// Request access (prompts the user once). Returns the MIDIAccess or throws.
export async function requestMidi() {
  if (!isMidiSupported()) throw new Error("Web MIDI not supported in this browser");
  return navigator.requestMIDIAccess({ sysex: false });
}

export function listOutputs(access) {
  if (!access) return [];
  return [...access.outputs.values()].map((o) => ({ id: o.id, name: o.name || "MIDI out", port: o }));
}

// Send a chord: note-ons now, note-offs scheduled `durationMs` later.
export function sendChordToOutput(port, midis, { durationMs = 1200, velocity = 80, channel = 0 } = {}) {
  if (!port || !midis || !midis.length) return;
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  for (const n of midis) {
    if (!Number.isFinite(n)) continue;
    port.send(noteOn(n, velocity, channel));
    port.send(noteOff(n, channel), now + durationMs);
  }
}

// Panic: all-notes-off on a channel.
export function allNotesOff(port, channel = 0) {
  if (!port) return;
  try { port.send([0xb0 | (channel & 0x0f), 0x7b, 0x00]); } catch { /* noop */ }
}
