import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare, buildShareUrl } from "./sharelink.js";
import { compressToEncodedURIComponent } from "lz-string";

const candle = {
  title: "Candle",
  artist: "Buck Meek",
  body: "[Verse]\nG        C\nWax on the sill…\nEm       D/F#\nlow flame holds\n",
  key: "G",
  capo: 2,
  tuning: "standard",
};

describe("share links — a song as a URL fragment", () => {
  it("round-trips every field", () => {
    const out = decodeShare(encodeShare(candle));
    expect(out).toEqual(candle);
  });

  it("round-trips minimal charts and unicode", () => {
    const min = { title: "Añoranza ♭9", body: "C  G  A♭maj7\nla niña’s song — équipe" };
    const out = decodeShare(encodeShare(min));
    expect(out.title).toBe(min.title);
    expect(out.body).toBe(min.body);
    expect(out.artist).toBeUndefined();
  });

  it("accepts the payload with or without the #s= dressing", () => {
    const p = encodeShare(candle);
    expect(decodeShare(`#s=${p}`)).toEqual(candle);
    expect(decodeShare(`s=${p}`)).toEqual(candle);
  });

  it("rejects garbage, emptiness and foreign versions", () => {
    expect(decodeShare("")).toBe(null);
    expect(decodeShare("#s=!!!not-a-payload!!!")).toBe(null);
    expect(decodeShare("#other=thing")).toBe(null);
    // a valid lz payload of the wrong shape is still refused
    expect(decodeShare(`#s=${encodeShare({ title: "x", body: "y" }).replace(/./, "Q")}`)).toBe(null);
  });

  it("keeps a real chart around 2–4KB of URL", () => {
    const body = Array.from({ length: 60 }, (_, i) => `G        C        Em       D\nline ${i} of the song with words under the chords`).join("\n");
    const p = encodeShare({ title: "Long One", artist: "Somebody", body });
    expect(p.length).toBeLessThan(4500);
  });

  it("refuses bodies past the cap instead of minting a mega-URL", () => {
    expect(encodeShare({ title: "x", body: "n".repeat(30001) })).toBe(null);
  });

  it("round-trips maximum valid fields even when JSON escapes every character", () => {
    const song = { title: "\0".repeat(300), artist: "\0".repeat(300), key: "\0".repeat(80),
      tuning: "\0".repeat(120), body: "\0".repeat(30000) };
    expect(decodeShare(encodeShare(song))).toEqual(song);
  });

  it("refuses compressed expansion before parsing an oversized JSON body", () => {
    const payload = compressToEncodedURIComponent(JSON.stringify({ v: 1, b: "x".repeat(1000000) }));
    expect(payload.length).toBeLessThan(2500);
    expect(decodeShare(payload)).toBeNull();
  });

  it("keeps explicit capo zero authoritative over a stale chart header", () => {
    expect(decodeShare(encodeShare({ title: "Re-fretted", body: "Capo 2\nC G", capo: 0 })).capo).toBe(0);
  });

  it("rejects hostile metadata types before they reach song rendering", () => {
    for (const field of ["t", "a", "k", "tn"]) {
      const payload = compressToEncodedURIComponent(JSON.stringify({ v: 1, t: "Song", b: "C G", [field]: { bad: true } }));
      expect(decodeShare(payload)).toBeNull();
    }
    expect(encodeShare({ title: {}, body: "C G" })).toBeNull();
    expect(decodeShare(compressToEncodedURIComponent(JSON.stringify({ v: 1, b: "C G", c: 40 })))).toBeNull();
    expect(decodeShare("A".repeat(60000))).toBeNull();
  });

  it("buildShareUrl composes origin + path + fragment", () => {
    const url = buildShareUrl("https://tylereveland.com/keylit", candle);
    expect(url.startsWith("https://tylereveland.com/keylit#s=")).toBe(true);
    expect(decodeShare(url.slice(url.indexOf("#")))).toEqual(candle);
  });

  it("replaces an existing fragment rather than appending a second hash", () => {
    const url = buildShareUrl("https://example.test/keylit#old", candle);
    expect(decodeShare(url.slice(url.indexOf("#")))).toEqual(candle);
  });
});
