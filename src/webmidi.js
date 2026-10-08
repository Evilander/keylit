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
  const status = 0xb0 | Math.max(0, Math.min(15, channel | 0));
  try { port.clear?.(); } catch { /* older or disconnected output */ }
  for (const control of [64, 123, 120]) {
    try { port.send([status, control, 0]); } catch { /* noop */ }
  }
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
  const ports = new Map();
  let active = true;
  const heldNotes = () => new Set([...ports.values()].flatMap(({ channels }) => [...channels.values()].flatMap((notes) => [...notes])));
  const emit = (type, note, velocity = 0) => {
    try { cb({ type, note, velocity, held: heldNotes() }); } catch { /* a listener cannot break device bookkeeping */ }
  };
  const handler = (port, e) => {
    if (!active || !ports.has(port) || port.state === "disconnected") return;
    const [status, note, vel] = e.data || [];
    if (![status, note, vel].every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) || note > 127 || vel > 127) return;
    const cmd = status & 0xf0;
    const channel = status & 0x0f;
    const channels = ports.get(port).channels;
    if (!channels.has(channel)) channels.set(channel, new Set());
    const held = channels.get(channel);
    if (cmd === 0x90 && vel > 0) {
      held.add(note);
      emit("down", note, vel);
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      if (held.delete(note)) emit("up", note);
    } else if (cmd === 0xb0 && (note === 120 || note === 123)) {
      const released = [...held]; held.clear();
      for (const midi of released) emit("up", midi);
    }
  };
  const attach = () => {
    const wanted = new Set([...access.inputs.values()].filter((port) => (!inputId || port.id === inputId) && port.state !== "disconnected"));
    const before = heldNotes();
    for (const [port, info] of ports) {
      if (!wanted.has(port)) { info.detach(); ports.delete(port); }
    }
    const after = heldNotes();
    for (const midi of before) if (!after.has(midi)) emit("up", midi);
    for (const inp of access.inputs.values()) {
      if (!wanted.has(inp) || ports.has(inp)) continue;
      const listener = (event) => handler(inp, event);
      let detach;
      if (typeof inp.addEventListener === "function") {
        inp.addEventListener("midimessage", listener);
        detach = () => inp.removeEventListener("midimessage", listener);
      } else {
        const previous = inp.onmidimessage;
        const combined = (event) => { previous?.call(inp, event); listener(event); };
        inp.onmidimessage = combined;
        detach = () => { if (inp.onmidimessage === combined) inp.onmidimessage = previous; };
      }
      ports.set(inp, { channels: new Map(), detach });
    }
  };
  attach();
  const onState = () => attach();
  try { access.addEventListener("statechange", onState); } catch { /* older impls */ }
  return () => {
    active = false;
    try { access.removeEventListener("statechange", onState); } catch { /* noop */ }
    for (const info of ports.values()) info.detach();
    ports.clear();
  };
}
