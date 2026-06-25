import { describe, it, expect } from "vitest";
import { progressionToMidi, noteOn, noteOff } from "./midi.js";

const ascii = (bytes, start, len) =>
  String.fromCharCode(...bytes.slice(start, start + len));

describe("progressionToMidi", () => {
  it("writes a valid SMF header chunk", () => {
    const m = progressionToMidi([[60, 64, 67]]);
    expect(ascii(m, 0, 4)).toBe("MThd");
    expect([...m.slice(4, 8)]).toEqual([0, 0, 0, 6]); // header length 6
    expect([...m.slice(8, 10)]).toEqual([0, 0]);       // format 0
    expect([...m.slice(10, 12)]).toEqual([0, 1]);      // 1 track
    expect([...m.slice(12, 14)]).toEqual([1, 224]);    // 480 ticks/beat
  });

  it("writes a track chunk", () => {
    const m = progressionToMidi([[60, 64, 67]]);
    expect(ascii(m, 14, 4)).toBe("MTrk");
  });

  it("emits note-on (0x90) and note-off (0x80) events for each chord tone", () => {
    const m = progressionToMidi([[60, 64, 67]]);
    const noteOns = [...m].filter((b, i) => b === 0x90).length;
    const noteOffs = [...m].filter((b, i) => b === 0x80).length;
    expect(noteOns).toBeGreaterThanOrEqual(3);
    expect(noteOffs).toBeGreaterThanOrEqual(3);
  });

  it("ends with an end-of-track meta event", () => {
    const m = progressionToMidi([[60]]);
    const tail = [...m.slice(-4)];
    expect(tail.slice(-3)).toEqual([0xff, 0x2f, 0x00]);
  });

  it("encodes tempo as a meta event", () => {
    const m = progressionToMidi([[60]], { tempoBpm: 120 });
    // 120bpm => 500000 us/beat => 0x07A120
    const idx = [...m].findIndex((b, i) => b === 0xff && m[i + 1] === 0x51);
    expect(idx).toBeGreaterThan(0);
    expect([...m.slice(idx + 3, idx + 6)]).toEqual([0x07, 0xa1, 0x20]);
  });

  it("produces a non-trivial buffer for a multi-chord progression", () => {
    const m = progressionToMidi([[60, 64, 67], [62, 65, 69], [64, 67, 71]]);
    expect(m.length).toBeGreaterThan(40);
  });
});

describe("live MIDI messages", () => {
  it("builds a note-on with status, note, velocity", () => {
    expect(noteOn(60, 80, 0)).toEqual([0x90, 60, 80]);
  });
  it("builds a note-off (velocity 0)", () => {
    expect(noteOff(60, 0)).toEqual([0x80, 60, 0]);
  });
  it("encodes the channel in the status nibble", () => {
    expect(noteOn(60, 80, 3)).toEqual([0x93, 60, 80]);
  });
  it("clamps out-of-range values", () => {
    expect(noteOn(200, 999, 99)).toEqual([0x9f, 127, 127]);
  });
});
