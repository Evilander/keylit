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
import { readJsonBody } from "../server/http-body.mjs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 7433;
const jobs = new Map();
let busy = false;
let nextId = 1;

// Only the local dev app may drive this. Binding to 127.0.0.1 keeps the port
// off the network, but a browser on this machine will still send any website's
// fetch here — so CORS is locked to localhost origins (any port, for Vite's
// shifting dev port) instead of "*", and cross-site POSTs are refused outright.
// A tool with no Origin header (curl, the test harness pre-navigation) is fine.
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
      cwd: ROOT, windowsHide: true, timeout: stage.key === "manifest" ? 2 * 60000 : 8 * 60000,
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
    child.on("close", (code, signal) => {
      st.status = code === 0 ? "done" : "failed";
      if (signal) job.log.push(`${stage.label} stopped after reaching its time limit`);
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
  try {
    for (const stage of STAGES) {
      const ok = await runStage(job, stage, artist);
      // Source failures still allow rebuilding the successfully acquired charts.
      if (!ok && stage.key === "manifest") {
        job.error = "the index rebuild failed — corpus files are on disk but the Library can't see them";
        break;
      }
      if (!ok || job.stages.at(-1).failed > 0) {
        job.error = "Some sources could not finish. The charts acquired so far are kept.";
      }
    }
  } catch {
    job.error = "The hunt stopped unexpectedly. The charts acquired so far are kept.";
  } finally {
    job.done = true;
    job.stage = "done";
    busy = false;
  }
}

export async function handler(req, res) {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);
  try {
    // A cross-site page must never be able to start a hunt on the dev's box.
    if (req.method === "POST" && !localOrigin(origin))
      return send(res, 403, { err: "cross-site requests are refused" }, origin);

    if (req.method === "GET" && req.url === "/health")
      return send(res, 200, { ok: true, corpus: path.join(ROOT, "public", "corpus"), busy }, origin);

    if (req.method === "POST" && req.url === "/hunt") {
      if (busy) return send(res, 409, { err: "a hunt is already running" }, origin);
      // Claim the flag synchronously, before the first await — two requests
      // arriving together (a double-click on "go") would otherwise both pass
      // the check during readBody's async gap and spawn overlapping pipelines
      // that race the same manifest rewrite. Release it on every bail-out path.
      busy = true;
      let artist;
      try {
        ({ artist } = await readJsonBody(req, 4096));
      } catch (error) {
        busy = false;
        return send(res, error.tooLarge ? 413 : 400, { err: "bad json" }, origin);
      }
      if (!artist || typeof artist !== "string" || !artist.trim() || artist.length > 160) {
        busy = false;
        return send(res, 400, { err: "missing artist" }, origin);
      }
      const id = String(nextId++);
      const job = { artist: artist.trim(), stage: "starting", stages: [], log: [], done: false, error: null, manifest: null };
      jobs.set(id, job);
      if (jobs.size > 50) jobs.delete(jobs.keys().next().value);
      hunt(job, artist.trim());
      return send(res, 200, { id }, origin);
    }

    const m = req.url.match(/^\/hunt\/(\d+)$/);
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]);
      if (!job) return send(res, 404, { err: "no such hunt" }, origin);
      return send(res, 200, job, origin);
    }

    send(res, 404, { err: "not found" }, origin);
  } catch (e) {
    busy = false;
    send(res, 500, { err: e.message }, origin);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) http.createServer(handler).listen(PORT, "127.0.0.1", () => {
  console.log(`harvester listening on http://127.0.0.1:${PORT} — corpus: ${path.join(ROOT, "public", "corpus")}`);
});
