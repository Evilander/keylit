// sharelink.js — pass the chart: a whole song as a URL fragment. Zero
// backend, and the fragment never leaves the browser (servers don't see
// #…). lz-string's URI-safe alphabet keeps a real chart around 2–4KB.
// Versioned so future shapes can coexist; capped so nobody mints a mega-URL.
import { compressToEncodedURIComponent } from "lz-string";
import { decompressShare } from "./lz.js";

const VERSION = 1;
const BODY_CAP = 30000;
const PAYLOAD_CAP = 50000;
const metadataValid = ({ title, artist, key, capo, tuning }) =>
  [[title, 300], [artist, 300], [key, 80], [tuning, 120]].every(([value, cap]) => value == null || (typeof value === "string" && value.length <= cap)) &&
  (capo == null || (Number.isInteger(capo) && capo >= 0 && capo <= 11));

/** → URI-safe payload string, or null when the body is over the cap. */
export function encodeShare({ title, artist, body, key, capo, tuning } = {}) {
  if (typeof body !== "string" || body.length > BODY_CAP || !metadataValid({ title, artist, key, capo, tuning })) return null;
  const packed = { v: VERSION, t: title, b: body };
  if (artist) packed.a = artist;
  if (key) packed.k = key;
  if (capo != null) packed.c = capo;
  if (tuning) packed.tn = tuning;
  const payload = compressToEncodedURIComponent(JSON.stringify(packed));
  return payload.length <= PAYLOAD_CAP ? payload : null;
}

/** Accepts "#s=…", "s=…" or the bare payload. → song fields or null. */
export function decodeShare(fragment) {
  if (!fragment || typeof fragment !== "string") return null;
  let p = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (p.includes("=")) {
    if (!p.startsWith("s=")) return null;
    p = p.slice(2);
  }
  if (!p || p.length > PAYLOAD_CAP) return null;
  try {
    const json = decompressShare(p, BODY_CAP * 6 + 6000);
    if (!json) return null;
    const packed = JSON.parse(json);
    if (packed?.v !== VERSION || typeof packed.b !== "string" || packed.b.length > BODY_CAP) return null;
    if (!metadataValid({ title: packed.t, artist: packed.a, key: packed.k, capo: packed.c, tuning: packed.tn })) return null;
    const out = { title: packed.t, body: packed.b };
    if (packed.a) out.artist = packed.a;
    if (packed.k) out.key = packed.k;
    if (packed.c != null) out.capo = packed.c;
    if (packed.tn) out.tuning = packed.tn;
    return out;
  } catch {
    return null;
  }
}

export function buildShareUrl(baseUrl, data) {
  const p = encodeShare(data);
  return p && typeof baseUrl === "string" ? `${baseUrl.split("#")[0]}#s=${p}` : null;
}
