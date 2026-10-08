import { describe, expect, it } from "vitest";
import { compressToEncodedURIComponent } from "lz-string";
import { decompressShare } from "./lz.js";

describe("bounded share decompression", () => {
  it("reads existing URL payloads exactly across Unicode, control characters and dictionaries", () => {
    for (const text of ["", "x", "C G Am F", "Añoranza ♭9\nC#", "\0\u0001".repeat(10000),
      "lyrics and chords\n".repeat(2000), Array.from({ length: 20000 }, (_, i) => String.fromCharCode((i * 173) % 65536)).join("")]) {
      expect(decompressShare(compressToEncodedURIComponent(text), text.length + 1)).toBe(text);
    }
  });
  it("rejects an expanding payload at the output limit", () => {
    const payload = compressToEncodedURIComponent("x".repeat(1000000));
    expect(payload.length).toBeLessThan(2500);
    expect(decompressShare(payload, 50000)).toBeNull();
    expect(decompressShare(compressToEncodedURIComponent("abc"), 2)).toBeNull();
  });
  it("rejects malformed and unterminated streams", () => {
    for (const payload of ["?", "A", "not-a-payload", "", "!!!"]) expect(decompressShare(payload, 100)).toBeNull();
  });
});
