// harvester_server.mjs — the Tab Hunt daemon. A localhost-only service the dev
// build's Library detects; type an artist in the app and this runs the whole
// hunt (ug_fetch --alts 3 → songsterr_harvest → build_manifest) and streams
// progress. Dev-time tool, never shipped; corpus stays gitignored.
//   node tools/harvester_server.mjs        (listens on 127.0.0.1:7433)
//
//   GET  /health         → { ok, corpus, busy }
//   POST /hunt {artist}  → { id }            409 while a hunt is running
//   GET  /hunt/<id>      → { artist, stage, stages, log, done, error }
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 7433;
const jobs = new Map();
let busy = false;
let nextId = 1;

const send = (res, code, body) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // 127.0.0.1-bound; only local pages can reach it
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// Each stage is one of the existing CLI tools run as a child process; the
// daemon adds nothing musical — it only supervises and keeps score.
const STAGES = [
  { key: "ug", label: "Ultimate Guitar", script: "tools/ug_fetch.mjs", args: (a) => ["--artist", a, "--alts", "3"] },
  { key: "songsterr", label: "Songsterr", script: "tools/songsterr_harvest.mjs", args: (a) => ["--artist", a] },
  { key: "manifest", label: "rebuild the index", script: "tools/build_manifest.mjs", args: () => [] },
];

const TALLY = /written (\d+) · skipped (\d+) · failed (\d+)/;

function runStage(job, stage, artist) {
  return new Promise((resolve) => {
    const st = { key: stage.key, label: stage.label, status: "running", written: 0, skipped: 0, failed: 0 };
    job.stages.push(st);
    job.stage = stage.key;
    const child = spawn(process.execPath, [path.join(ROOT, stage.script), ...stage.args(artist)], {
      cwd: ROOT, windowsHide: true,
    });
    let buf = "";
    const eat = (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trimEnd();
        buf = buf.slice(i + 1);
        if (!line) continue;
        job.log.push(line);
        if (job.log.length > 40) job.log.shift();
        const t = line.match(TALLY);
        if (t) { st.written = +t[1]; st.skipped = +t[2]; st.failed = +t[3]; }
        const m = line.match(/manifest: (\d+) songs, (\d+) artists/);
        if (m) { job.manifest = { songs: +m[1], artists: +m[2] }; }
      }
    };
    child.stdout.on("data", eat);
    child.stderr.on("data", eat);
    child.on("close", (code) => {
      st.status = code === 0 ? "done" : "failed";
      resolve(code === 0);
    });
    child.on("error", (err) => {
      st.status = "failed";
      job.log.push(`spawn error: ${err.message}`);
      resolve(false);
    });
  });
}

async function hunt(job, artist) {
  for (const stage of STAGES) {
    const ok = await runStage(job, stage, artist);
    // A source having nothing for an artist is a finding, not a failure —
    // only a broken manifest rebuild aborts the hunt.
    if (!ok && stage.key === "manifest") {
      job.error = "the index rebuild failed — corpus files are on disk but the Library can't see them";
      break;
    }
  }
  job.done = true;
  job.stage = "done";
  busy = false;
}

const readBody = async (req) => { let b = ""; for await (const c of req) b += c; return b; };

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    if (req.method === "GET" && req.url === "/health")
      return send(res, 200, { ok: true, corpus: path.join(ROOT, "public", "corpus"), busy });

    if (req.method === "POST" && req.url === "/hunt") {
      if (busy) return send(res, 409, { err: "a hunt is already running" });
      const { artist } = JSON.parse(await readBody(req));
      if (!artist || typeof artist !== "string" || !artist.trim())
        return send(res, 400, { err: "missing artist" });
      busy = true;
      const id = String(nextId++);
      const job = { artist: artist.trim(), stage: "starting", stages: [], log: [], done: false, error: null, manifest: null };
      jobs.set(id, job);
      hunt(job, artist.trim());
      return send(res, 200, { id });
    }

    const m = req.url.match(/^\/hunt\/(\d+)$/);
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]);
      if (!job) return send(res, 404, { err: "no such hunt" });
      return send(res, 200, job);
    }

    send(res, 404, { err: "not found" });
  } catch (e) {
    busy = false;
    send(res, 500, { err: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`harvester listening on http://127.0.0.1:${PORT} — corpus: ${path.join(ROOT, "public", "corpus")}`);
});
