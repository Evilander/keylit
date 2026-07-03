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

/* ---- MIDI IN: the player's hands ---------------------------------------- */

export function listInputs(access) {
  if (!access) return [];
  return [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name || "MIDI in", port: i }));
}

// Watch every input (or one, by id) and keep a running held-note set.
// cb({ type: "down"|"up", note, velocity, held }) — held is a fresh copy per
// event so React state can take it directly. Re-attaches on hot-plug.
// Returns an unsubscribe function.
export function watchInputs(access, cb, { inputId = null } = {}) {
  if (!access) return () => {};
  const held = new Set();
  const handler = (e) => {
    const [status, note, vel] = e.data || [];
    const cmd = status & 0xf0;
    if (cmd === 0x90 && vel > 0) {
      held.add(note);
      cb({ type: "down", note, velocity: vel, held: new Set(held) });
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      if (held.delete(note)) cb({ type: "up", note, velocity: 0, held: new Set(held) });
    }
  };
  const attach = () => {
    for (const inp of access.inputs.values()) {
      if (!inputId || inp.id === inputId) inp.onmidimessage = handler;
    }
  };
  attach();
  const onState = () => attach();
  try { access.addEventListener("statechange", onState); } catch { /* older impls */ }
  return () => {
    try { access.removeEventListener("statechange", onState); } catch { /* noop */ }
    for (const inp of access.inputs.values()) {
      if (inp.onmidimessage === handler) inp.onmidimessage = null;
    }
  };
}
