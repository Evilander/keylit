import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createServer } from "vite";
import liveCorpus, { createCorpusMiddleware } from "../vite-corpus.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "keylit-corpus-"));
after(() => rm(root, { recursive: true, force: true }));
const publicDir = path.join(root, "public");
await mkdir(path.join(publicDir, "corpus", "fan"), { recursive: true });
const middleware = createCorpusMiddleware({ publicDir, base: "/keylit/" });
const request = async (url, method = "GET") => {
  const result = { status: null, headers: {}, body: null, passed: false };
  const res = { setHeader: (key, value) => { result.headers[key] = value; }, end: (body) => { result.body = body?.toString(); }, set statusCode(status) { result.status = status; } };
  await middleware({ url, method }, res, () => { result.passed = true; });
  return result;
};

test("serves files added after the middleware was installed", async () => {
  await writeFile(path.join(publicDir, "corpus", "fan", "fresh.json"), '{"body":"C G"}');
  const response = await request("/keylit/corpus/fan/fresh.json?v=1");
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).body, "C G");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("reads the manifest afresh after a hunt", async () => {
  const manifest = path.join(publicDir, "corpus", "manifest.json");
  await writeFile(manifest, "[]");
  assert.equal((await request("/keylit/corpus/manifest.json")).body, "[]");
  await writeFile(manifest, '[{"id":"new"}]');
  assert.equal(JSON.parse((await request("/keylit/corpus/manifest.json")).body)[0].id, "new");
});

test("returns JSON 404 for a missing chart, never the app HTML", async () => {
  const response = await request("/keylit/corpus/fan/missing.json");
  assert.equal(response.status, 404);
  assert.equal(response.body, "null");
});

test("rejects traversal, encoded separators, malformed escapes and non-chart paths", async () => {
  for (const url of ["../secret.json", "fan/..%5csecret.json", "fan/%2e%2e%2fsecret.json", "_state/private.json", "fan/file.txt", "fan/deep/file.json"]) {
    assert.equal((await request(`/keylit/corpus/${url}`)).status, 404);
  }
  assert.equal((await request("/keylit/corpus/fan/%invalid.json")).status, 400);
});

test("does not serve a junction that escapes the corpus", async () => {
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "private.json"), '{"secret":true}');
  await symlink(outside, path.join(publicDir, "corpus", "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await request("/keylit/corpus/escape/private.json")).status, 404);
});

test("supports HEAD, rejects writes, and leaves other application routes alone", async () => {
  await writeFile(path.join(publicDir, "corpus", "fan", "head.json"), "{}");
  const head = await request("/keylit/corpus/fan/head.json", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  assert.equal((await request("/keylit/corpus/fan/head.json", "POST")).status, 405);
  assert.equal((await request("/keylit/songbook/manifest.json")).passed, true);
});

test("runs behind Vite's host and CORS guards and serves a chart added after startup", async () => {
  const server = await createServer({ configFile: false, root, publicDir, base: "/keylit/", plugins: [liveCorpus()],
    server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  const httpServer = http.createServer(server.middlewares);
  try {
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const port = httpServer.address().port;
    const get = (headers, file = "after-start.json") => new Promise((resolve, reject) => {
      const req = http.get({ hostname: "127.0.0.1", port, path: `/keylit/corpus/fan/${file}`, headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.setTimeout(3000, () => req.destroy(new Error("Request timed out")));
      req.on("error", reject);
    });
    await writeFile(path.join(publicDir, "corpus", "fan", "after-start.json"), '{"body":"fresh"}');
    const blocked = await get({ Host: "attacker.invalid", Origin: "http://attacker.invalid" });
    assert.equal(blocked.status, 403);
    assert.ok(!blocked.body.includes('"body":"fresh"'));
    const response = await get({ Host: `127.0.0.1:${port}`, Origin: `http://localhost:${port}` });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).body, "fresh");
    assert.equal(response.headers["access-control-allow-origin"], `http://localhost:${port}`);
    const missing = await get({ Host: `127.0.0.1:${port}` }, "missing.json");
    assert.equal(missing.status, 404);
    assert.equal(missing.body, "null");
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    await server.close();
  }
});
