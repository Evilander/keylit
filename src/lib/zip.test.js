import { describe, it, expect } from "vitest";
import { crc32, makeZip } from "./zip.js";

const enc = new TextEncoder();
const dv = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

describe("crc32", () => {
  it("matches the canonical check value for '123456789'", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xCBF43926);
  });
  it("empty input is 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("makeZip", () => {
  const when = new Date(2026, 6, 5, 12, 30, 42);
  const zip = makeZip(
    [
      { name: "Artist/Song One.txt", data: "E A D G B E\nhello chart\n" },
      { name: "b.txt", data: enc.encode("x") },
    ],
    when,
  );

  it("starts with a local file header and ends with EOCD", () => {
    const d = dv(zip);
    expect(d.getUint32(0, true)).toBe(0x04034b50);
    expect(d.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });

  it("EOCD counts both entries", () => {
    const d = dv(zip);
    expect(d.getUint16(zip.length - 22 + 8, true)).toBe(2);
    expect(d.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });

  it("stores the first entry uncompressed with a correct CRC and name", () => {
    const d = dv(zip);
    const body = enc.encode("E A D G B E\nhello chart\n");
    expect(d.getUint16(8, true)).toBe(0);                    // method: store
    expect(d.getUint32(14, true)).toBe(crc32(body));         // crc
    expect(d.getUint32(18, true)).toBe(body.length);         // sizes
    const nameLen = d.getUint16(26, true);
    const name = new TextDecoder().decode(zip.slice(30, 30 + nameLen));
    expect(name).toBe("Artist/Song One.txt");
    const data = zip.slice(30 + nameLen, 30 + nameLen + body.length);
    expect(new TextDecoder().decode(data)).toBe("E A D G B E\nhello chart\n");
  });

  it("central directory offset in EOCD points at a central header", () => {
    const d = dv(zip);
    const cdOffset = d.getUint32(zip.length - 22 + 16, true);
    expect(d.getUint32(cdOffset, true)).toBe(0x02014b50);
  });

  it("second entry's local header sits right after the first entry", () => {
    const d = dv(zip);
    const first = 30 + "Artist/Song One.txt".length + 24;
    expect(d.getUint32(first, true)).toBe(0x04034b50);
  });
});
