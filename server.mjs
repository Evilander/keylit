// server.mjs — tiny local dev server for the Keylit AI proxy.
//
//   ANTHROPIC_API_KEY=sk-ant-... node server.mjs
//
// Serves the same handler as api/analyze.js at POST http://localhost:8787/api/analyze.
// Point the UI at it with VITE_AI_PROXY_URL=http://localhost:8787/api/analyze.
//
// Requires `@anthropic-ai/sdk` (npm i -D @anthropic-ai/sdk). Kept out of the main
// app bundle on purpose — the browser never holds the key.

import { createServer } from "node:http";
import handler from "./api/analyze.js";

const PORT = Number(process.env.KEYLIT_PROXY_PORT || 8787);

const server = createServer((req, res) => {
  if (req.url === "/api/analyze") return handler(req, res);
  if (req.url === "/health") { res.statusCode = 200; return res.end("ok"); }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  const keyOk = !!process.env.ANTHROPIC_API_KEY;
  console.log(`Keylit AI proxy on http://localhost:${PORT}/api/analyze`);
  console.log(`  model: ${process.env.KEYLIT_MODEL || "claude-opus-4-8"}`);
  console.log(`  ANTHROPIC_API_KEY: ${keyOk ? "set" : "MISSING — set it before calling"}`);
});
