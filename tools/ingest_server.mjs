// ingest_server.mjs — a tiny localhost sink so browser-side UG extraction writes
// straight to the corpus on disk (keeps large tab bodies out of the agent's
// context). CORS-open to localhost only; dev-time tool, not shipped.
//   node tools/ingest_server.mjs
import http from "node:http";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = "B:/projects/claude/keylit/public/corpus";
const URLS_FILE = path.join(ROOT, "_state", "ug_urls.json");
let written = 0;

const send = (res, code, body) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const readBody = async (req) => { let b = ""; for await (const c of req) b += c; return b; };

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  try {
    if (req.method === "POST" && req.url === "/song") {
      const song = JSON.parse(await readBody(req));
      if (!song.id || !song.source) return send(res, 400, { err: "missing id/source" });
      const dir = path.join(ROOT, song.source);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${song.id}.json`), JSON.stringify(song), "utf8");
      written++;
      return send(res, 200, { ok: true, written });
    }
    if (req.method === "POST" && req.url === "/urls") {
      await mkdir(path.dirname(URLS_FILE), { recursive: true });
      await writeFile(URLS_FILE, await readBody(req), "utf8");
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && req.url === "/urls") {
      return send(res, 200, await readFile(URLS_FILE, "utf8").catch(() => "[]"));
    }
    return send(res, 200, { up: true, written });
  } catch (e) { return send(res, 500, { err: e.message }); }
});
server.listen(8787, () => console.log("ingest server on http://localhost:8787 (written=0)"));
