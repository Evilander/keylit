import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare, buildShareUrl } from "./sharelink.js";

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

  it("buildShareUrl composes origin + path + fragment", () => {
    const url = buildShareUrl("https://tylereveland.com/keylit", candle);
    expect(url.startsWith("https://tylereveland.com/keylit#s=")).toBe(true);
    expect(decodeShare(url.slice(url.indexOf("#")))).toEqual(candle);
  });
});
