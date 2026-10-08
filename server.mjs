// server.mjs — tiny local dev server for the Keylit AI proxy.
//
//   ANTHROPIC_API_KEY=sk-ant-... node server.mjs
//
// Serves the same handler as api/analyze.js at POST http://localhost:8787/api/analyze.
// Point the UI at it with VITE_AI_PROXY_URL=http://localhost:8787/api/analyze.
//
// The handler answers only browser origins it knows, so a curl against this
// proxy needs KEYLIT_ALLOW_ORIGIN="*" set alongside the key.
//
// Requires `@anthropic-ai/sdk` (npm i -D @anthropic-ai/sdk). Kept out of the main
// app bundle on purpose — the browser never holds the key.

import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/analyze.js";
import tutor from "./api/tutor.js";

const PORT = Number(process.env.KEYLIT_PROXY_PORT || 8787);
// Loopback only: this proxy holds the API key, and there is no reason for the
// rest of the network to reach it.
const HOST = "127.0.0.1";

export function createProxyServer({ analyze = handler, tutorHandler = tutor } = {}) {
  return createServer(async (req, res) => {
    try {
      // This listener has no reverse proxy; forwarded identities are caller input.
      for (const header of ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for"]) delete req.headers[header];
      if (req.url === "/api/analyze") return await analyze(req, res);
      if (req.url === "/api/tutor") return await tutorHandler(req, res);
      if (req.url === "/health") { res.statusCode = 200; return res.end("ok"); }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    } catch {
      if (res.headersSent) { res.destroy(); return; }
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Proxy request failed" }));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createProxyServer().listen(PORT, HOST, () => {
  const keyOk = !!process.env.ANTHROPIC_API_KEY;
  console.log(`Keylit AI proxy on http://localhost:${PORT}/api/analyze`);
  console.log(`  model: ${process.env.KEYLIT_MODEL || "claude-opus-4-8"}`);
  console.log(`  ANTHROPIC_API_KEY: ${keyOk ? "set" : "MISSING — set it before calling"}`);
});
