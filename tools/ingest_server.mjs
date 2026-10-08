// ingest_server.mjs — a tiny localhost sink so browser-side UG extraction writes
// straight to the corpus on disk (keeps large tab bodies out of the agent's
// context). Dev-time tool, not shipped.
//   node tools/ingest_server.mjs
import http from "node:http";
import { readJsonBody } from "../server/http-body.mjs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");
const URLS_FILE = path.join(ROOT, "_state", "ug_urls.json");
const HOST = "127.0.0.1";
const PORT = 8787;
const MAX_BODY = 8 * 1024 * 1024; // the longest tab bodies run ~100 KB
let written = 0;

// Binding to loopback keeps the port off the network, but a browser on this
// machine will still send any website's fetch here — and a text/plain POST is
// a "simple" request that skips the preflight entirely, so withholding the
// CORS header would only hide the reply, not stop the write. Foreign origins
// are refused outright instead. A tool with no Origin (curl) is fine.
const localOrigin = (origin) => {
  if (!origin) return true;
  try { return ["localhost", "127.0.0.1"].includes(new URL(origin).hostname); }
  catch { return false; }
};

const send = (res, code, body, origin) => {
  if (origin && localOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};


// `source` and `id` become path segments, so they get the strictest reading the
// corpus actually uses: tools/ug_fetch.mjs and tools/songsterr_harvest.mjs both
// slug down to [a-z0-9-]. Leading character must be alphanumeric, so "..": no.
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/;
const insideRoot = (p) => {
  const rel = path.relative(ROOT, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

export async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && !localOrigin(origin)) return send(res, 403, { err: "cross-site" }, null);
  if (req.method === "OPTIONS") return send(res, 204, "", origin);
  try {
    if (req.method === "POST" && req.url === "/song") {
      const song = await readJsonBody(req, MAX_BODY);
      if (!validSongRecord(song) || typeof song.source !== "string" || !SLUG.test(song.id) || !SLUG.test(song.source)) {
        return send(res, 400, { err: "invalid song metadata or id/source slug" }, origin);
      }
      const dir = path.resolve(ROOT, song.source);
      const file = path.resolve(dir, `${song.id}.json`);
      // Belt and braces: the pattern already forbids a separator, but the
      // resolved path is what actually gets written, so that is what we check.
      if (!insideRoot(dir) || !insideRoot(file)) return send(res, 400, { err: "outside corpus" }, origin);
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify(song), "utf8");
      written++;
      return send(res, 200, { ok: true, written }, origin);
    }
    if (req.method === "POST" && req.url === "/urls") {
      const body = JSON.stringify(await readJsonBody(req, MAX_BODY)); // a malformed list would poison the next run silently
      await mkdir(path.dirname(URLS_FILE), { recursive: true });
      await writeFile(URLS_FILE, body, "utf8");
      return send(res, 200, { ok: true }, origin);
    }
    if (req.method === "GET" && req.url === "/urls") {
      return send(res, 200, await readFile(URLS_FILE, "utf8").catch(() => "[]"), origin);
    }
    return send(res, 200, { up: true, written }, origin);
  } catch (e) { return send(res, e.tooLarge ? 413 : e instanceof SyntaxError ? 400 : 500, { err: e.message }, origin); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) http.createServer(handler).listen(PORT, HOST, () => console.log(`ingest server on http://${HOST}:${PORT} (written=0)`));

export function validSongRecord(song) {
  return !!song && typeof song === "object" && !Array.isArray(song)
    && ["id", "title"].every(key => typeof song[key] === "string" && song[key].trim())
    && ["artist", "body", "source", "sourceUrl", "album", "format", "tuningRaw", "tuningSource", "key", "albumTrackKind"].every(key => song[key] == null || typeof song[key] === "string")
    && (song.tuning == null || typeof song.tuning === "string");
}
