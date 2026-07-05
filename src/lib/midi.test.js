import { describe, it, expect } from "vitest";
import { progressionToMidi, eventsToMidi, eventsToMidiTracks, noteOn, noteOff } from "./midi.js";

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

  it("clamps note-on velocity to 0-127 (every data byte must keep its high bit clear)", () => {
    const m = progressionToMidi([[60]], { velocity: 200 });
    const idx = [...m].findIndex((b) => b === 0x90); // first note-on status byte
    expect(idx).toBeGreaterThan(0);
    expect(m[idx + 2]).toBe(127); // velocity byte clamped, not 200 (0xC8)
  });

  it("keeps the tempo meta event within its 24-bit field for tiny tempos", () => {
    const m = progressionToMidi([[60]], { tempoBpm: 1 });
    const idx = [...m].findIndex((b, i) => b === 0xff && m[i + 1] === 0x51);
    const us = (m[idx + 3] << 16) | (m[idx + 4] << 8) | m[idx + 5];
    expect(us).toBeLessThanOrEqual(0xffffff);
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

/* ---- eventsToMidi: absolute-timed arrangement events ---- */

// Minimal SMF track decoder: walks deltas, returns {tick, type, note, vel}.
function decodeTrack(bytes) {
  let i = 14 + 8; // MThd(14) + "MTrk"+len(8)
  let tick = 0;
  const out = [];
  const b = bytes;
  const vlq = () => { let n = 0; for (;;) { const x = b[i++]; n = (n << 7) | (x & 0x7f); if (!(x & 0x80)) return n; } };
  while (i < b.length) {
    tick += vlq();
    const status = b[i++];
    if (status === 0xff) { const type = b[i++]; const len = b[i++]; i += len; if (type === 0x2f) break; continue; }
    const hi = status & 0xf0;
    if (hi === 0x90) { const note = b[i++], vel = b[i++]; out.push({ tick, type: vel > 0 ? "on" : "off", note, vel }); }
    else if (hi === 0x80) { const note = b[i++]; i++; out.push({ tick, type: "off", note, vel: 0 }); }
    else { i += 2; }
  }
  return out;
}

describe("eventsToMidi", () => {
  const events = [
    { t: 0, dur: 1, midis: [60], v: 0.9 },
    { t: 1, dur: 0.5, midis: [64, 67], v: 0.5 },
  ];

  it("places note on/offs at the right absolute ticks", () => {
    const bytes = eventsToMidi(events, { tempoBpm: 120, ticksPerBeat: 480 });
    expect(ascii(bytes, 0, 4)).toBe("MThd");
    const evs = decodeTrack(bytes);
    const find = (type, note) => evs.find((e) => e.type === type && e.note === note);
    expect(find("on", 60).tick).toBe(0);
    expect(find("off", 60).tick).toBe(480);
    expect(find("on", 64).tick).toBe(480);
    expect(find("on", 67).tick).toBe(480);
    expect(find("off", 64).tick).toBe(720);
    expect(find("off", 67).tick).toBe(720);
  });

  it("an off and an on landing on the same tick emit the off first", () => {
    const bytes = eventsToMidi([
      { t: 0, dur: 1, midis: [60], v: 0.8 },
      { t: 1, dur: 1, midis: [60], v: 0.8 },   // same note re-struck back-to-back
    ], { ticksPerBeat: 100 });
    const evs = decodeTrack(bytes).filter((e) => e.note === 60);
    expect(evs.map((e) => e.type)).toEqual(["on", "off", "on", "off"]);
  });

  it("maps v 0..1 onto velocity 1..127", () => {
    const bytes = eventsToMidi([{ t: 0, dur: 1, midis: [60], v: 1 }, { t: 1, dur: 1, midis: [62], v: 0.01 }]);
    const evs = decodeTrack(bytes);
    expect(evs.find((e) => e.note === 60 && e.type === "on").vel).toBe(127);
    expect(evs.find((e) => e.note === 62 && e.type === "on").vel).toBeGreaterThanOrEqual(1);
  });

  it("writes the tempo meta", () => {
    const m = eventsToMidi(events, { tempoBpm: 60 });
    const idx = [...m].findIndex((x, k) => x === 0xff && m[k + 1] === 0x51);
    const us = (m[idx + 3] << 16) | (m[idx + 4] << 8) | m[idx + 5];
    expect(us).toBe(1000000);
  });
});

/* ---- eventsToMidiTracks: format-1 multi-track (the Band's export) ---- */

// Full SMF parser for the multi-track tests: header + every chunk, channel-aware.
function parseSmf(bytes) {
  const b = bytes;
  const ntrks = (b[10] << 8) | b[11];
  const header = { format: (b[8] << 8) | b[9], ntrks, division: (b[12] << 8) | b[13] };
  const tracks = [];
  let i = 14;
  while (i < b.length) {
    const tag = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const len = (b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7];
    const end = i + 8 + len;
    i += 8;
    const track = { tag, events: [], metas: [], programs: [] };
    let tick = 0;
    const vlq = () => { let n = 0; for (;;) { const x = b[i++]; n = (n << 7) | (x & 0x7f); if (!(x & 0x80)) return n; } };
    while (i < end) {
      tick += vlq();
      const status = b[i++];
      if (status === 0xff) {
        const type = b[i++]; const len2 = b[i++];
        track.metas.push({ tick, type, data: [...b.slice(i, i + len2)] });
        i += len2;
        continue;
      }
      const hi = status & 0xf0, ch = status & 0x0f;
      if (hi === 0x90) { const note = b[i++], vel = b[i++]; track.events.push({ tick, type: vel > 0 ? "on" : "off", ch, note, vel }); }
      else if (hi === 0x80) { const note = b[i++]; i++; track.events.push({ tick, type: "off", ch, note, vel: 0 }); }
      else if (hi === 0xc0) { track.programs.push({ tick, ch, program: b[i++] }); }
      else { i += 2; }
    }
    tracks.push(track);
    i = end;
  }
  return { header, tracks };
}

describe("eventsToMidiTracks", () => {
  const piano = [{ t: 0, dur: 2, midis: [60, 64, 67], v: 0.8 }];
  const bass = [{ t: 0, dur: 1, midis: [36], v: 0.9 }, { t: 2, dur: 1, midis: [43], v: 0.8 }];
  const drums = [{ t: 0, dur: 0.1, midis: [36], v: 0.9 }, { t: 1, dur: 0.1, midis: [38], v: 0.7 }];

  const build = () => eventsToMidiTracks([
    { name: "Piano", channel: 0, program: 0, events: piano },
    { name: "Bass", channel: 1, program: 32, events: bass },
    { name: "Drums", channel: 9, events: drums },
  ], { tempoBpm: 120, ticksPerBeat: 480, timeSig: { num: 4, den: 4 } });

  it("writes a format-1 header with a conductor track plus one track per part", () => {
    const { header } = parseSmf(build());
    expect(header.format).toBe(1);
    expect(header.ntrks).toBe(4); // conductor + piano + bass + drums
    expect(header.division).toBe(480);
  });

  it("puts tempo and time signature in the conductor track", () => {
    const { tracks } = parseSmf(build());
    const tempo = tracks[0].metas.find((m) => m.type === 0x51);
    expect(tempo).toBeTruthy();
    expect((tempo.data[0] << 16) | (tempo.data[1] << 8) | tempo.data[2]).toBe(500000); // 120bpm
    const ts = tracks[0].metas.find((m) => m.type === 0x58);
    expect(ts).toBeTruthy();
    expect(ts.data[0]).toBe(4);      // numerator
    expect(ts.data[1]).toBe(2);      // denominator as power of two: 4 = 2^2
  });

  it("stamps each part's channel into its status bytes (drums live on channel 9)", () => {
    const { tracks } = parseSmf(build());
    expect(tracks[1].events.every((e) => e.ch === 0)).toBe(true);
    expect(tracks[2].events.every((e) => e.ch === 1)).toBe(true);
    expect(tracks[3].events.every((e) => e.ch === 9)).toBe(true);
  });

  it("emits a program change for pitched parts and names every track", () => {
    const { tracks } = parseSmf(build());
    expect(tracks[2].programs).toEqual([{ tick: 0, ch: 1, program: 32 }]);
    expect(tracks[3].programs).toEqual([]); // drums: no program change
    const name = (tr) => String.fromCharCode(...(tr.metas.find((m) => m.type === 0x03)?.data ?? []));
    expect(name(tracks[1])).toBe("Piano");
    expect(name(tracks[2])).toBe("Bass");
    expect(name(tracks[3])).toBe("Drums");
  });

  it("keeps absolute ticks correct inside each track", () => {
    const { tracks } = parseSmf(build());
    const bassEvents = tracks[2].events;
    expect(bassEvents.find((e) => e.type === "on" && e.note === 36).tick).toBe(0);
    expect(bassEvents.find((e) => e.type === "off" && e.note === 36).tick).toBe(480);
    expect(bassEvents.find((e) => e.type === "on" && e.note === 43).tick).toBe(960);
  });

  it("an off and an on at the same tick emit the off first, per track", () => {
    const bytes = eventsToMidiTracks([{
      channel: 0,
      events: [
        { t: 0, dur: 1, midis: [60], v: 0.8 },
        { t: 1, dur: 1, midis: [60], v: 0.8 },
      ],
    }], { ticksPerBeat: 100 });
    const { tracks } = parseSmf(bytes);
    const evs = tracks[1].events.filter((e) => e.note === 60);
    expect(evs.map((e) => e.type)).toEqual(["on", "off", "on", "off"]);
  });

  it("a part with no events still writes a valid (empty) track", () => {
    const bytes = eventsToMidiTracks([{ name: "Empty", channel: 2, events: [] }], {});
    const { header, tracks } = parseSmf(bytes);
    expect(header.ntrks).toBe(2);
    expect(tracks[1].events).toEqual([]);
    expect(tracks[1].metas.some((m) => m.type === 0x2f)).toBe(true); // end-of-track
  });

  it("waltz time signature encodes 3/4", () => {
    const bytes = eventsToMidiTracks([{ channel: 0, events: [] }], { timeSig: { num: 3, den: 4 } });
    const ts = parseSmf(bytes).tracks[0].metas.find((m) => m.type === 0x58);
    expect(ts.data[0]).toBe(3);
    expect(ts.data[1]).toBe(2);
  });
});
