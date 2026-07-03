// sharelink.js — pass the chart: a whole song as a URL fragment. Zero
// backend, and the fragment never leaves the browser (servers don't see
// #…). lz-string's URI-safe alphabet keeps a real chart around 2–4KB.
// Versioned so future shapes can coexist; capped so nobody mints a mega-URL.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

const VERSION = 1;
const BODY_CAP = 30000;

/** → URI-safe payload string, or null when the body is over the cap. */
export function encodeShare({ title, artist, body, key, capo, tuning } = {}) {
  if (typeof body !== "string" || body.length > BODY_CAP) return null;
  const packed = { v: VERSION, t: title, b: body };
  if (artist) packed.a = artist;
  if (key) packed.k = key;
  if (capo) packed.c = capo;
  if (tuning) packed.tn = tuning;
  return compressToEncodedURIComponent(JSON.stringify(packed));
}

/** Accepts "#s=…", "s=…" or the bare payload. → song fields or null. */
export function decodeShare(fragment) {
  if (!fragment || typeof fragment !== "string") return null;
  let p = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (p.includes("=")) {
    if (!p.startsWith("s=")) return null;
    p = p.slice(2);
  }
  if (!p) return null;
  try {
    const json = decompressFromEncodedURIComponent(p);
    if (!json) return null;
    const packed = JSON.parse(json);
    if (packed?.v !== VERSION || typeof packed.b !== "string" || packed.b.length > BODY_CAP) return null;
    const out = { title: packed.t, body: packed.b };
    if (packed.a) out.artist = packed.a;
    if (packed.k) out.key = packed.k;
    if (packed.c) out.capo = packed.c;
    if (packed.tn) out.tuning = packed.tn;
    return out;
  } catch {
    return null;
  }
}

export function buildShareUrl(baseUrl, data) {
  const p = encodeShare(data);
  return p ? `${baseUrl}#s=${p}` : null;
}
