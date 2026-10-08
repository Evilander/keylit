import { describe, expect, it, vi } from "vitest";
import { allNotesOff, watchInputs } from "./webmidi.js";

function input(id) {
  const listeners = new Set();
  return {
    id, state: "connected", onmidimessage: null,
    addEventListener: (_type, handler) => listeners.add(handler),
    removeEventListener: (_type, handler) => listeners.delete(handler),
    send(data) { const event = { data, currentTarget: this }; this.onmidimessage?.(event); for (const handler of listeners) handler(event); },
  };
}
function access(...ports) {
  const listeners = new Set();
  return {
    inputs: new Map(ports.map((port) => [port.id, port])),
    addEventListener: (_type, handler) => listeners.add(handler),
    removeEventListener: (_type, handler) => listeners.delete(handler),
    change() { for (const handler of listeners) handler(); },
  };
}

describe("MIDI input ownership", () => {
  it("keeps a key held while another channel or input still holds it", () => {
    const a = input("a"), b = input("b");
    const changes = [];
    const stop = watchInputs(access(a, b), (event) => changes.push(event));
    a.send([0x90, 60, 100]);
    a.send([0x91, 60, 100]);
    b.send([0x90, 60, 100]);
    a.send([0x80, 60, 0]);
    expect([...changes.at(-1).held]).toEqual([60]);
    a.send([0x81, 60, 0]);
    expect([...changes.at(-1).held]).toEqual([60]);
    b.send([0x80, 60, 0]);
    expect([...changes.at(-1).held]).toEqual([]);
    stop();
  });

  it("clears disconnected device keys and ignores subsequent stale messages", () => {
    const a = input("a"), b = input("b");
    const midi = access(a, b);
    const changes = [];
    const stop = watchInputs(midi, (event) => changes.push(event));
    a.send([0x90, 60, 100]); b.send([0x90, 64, 100]);
    midi.inputs.delete(a.id); a.state = "disconnected"; midi.change();
    expect([...changes.at(-1).held]).toEqual([64]);
    const count = changes.length;
    a.send([0x90, 67, 100]);
    expect(changes).toHaveLength(count);
    stop();
  });

  it("supports independent watchers without overwriting device listeners", () => {
    const port = input("a"), midi = access(port);
    const original = vi.fn(); port.onmidimessage = original;
    const first = vi.fn(), second = vi.fn();
    const stopFirst = watchInputs(midi, first);
    const stopSecond = watchInputs(midi, second);
    port.send([0x90, 60, 100]);
    expect(original).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst(); port.send([0x80, 60, 0]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(port.onmidimessage).toBe(original);
  });

  it("clears only the addressed channel on all-notes-off and ignores incomplete messages", () => {
    const port = input("a"), changes = [];
    const stop = watchInputs(access(port), (event) => changes.push(event));
    port.send([0x90, 60, 100]); port.send([0x91, 64, 100]);
    port.send([0xb0, 123, 0]);
    expect([...changes.at(-1).held]).toEqual([64]);
    const count = changes.length;
    port.send([0x91, 65]); port.send([0x91, 200, 100]);
    expect(changes).toHaveLength(count);
    stop();
  });
});

it("MIDI panic cancels queued messages and lifts sustain before releasing notes", () => {
  const port = { clear: vi.fn(), send: vi.fn() };
  allNotesOff(port, 2);
  expect(port.clear).toHaveBeenCalledOnce();
  expect(port.send.mock.calls.map(([data]) => data)).toEqual([[0xb2, 64, 0], [0xb2, 123, 0], [0xb2, 120, 0]]);
});
