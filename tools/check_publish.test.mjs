import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { checkPublish } from "./check_publish.mjs";

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keylit-publish-test-"));
  try { await run(root); }
  finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("keylit-publish-test-"));
    await fs.rm(root, { recursive: true, force: true });
  }
}

const quiet = { log() {}, error() {} };
const check = (root, options = {}) => checkPublish({ root, ...quiet, ...options });
const exists = async (file) => !!(await fs.lstat(file).catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return null;
}));
const denied = () => Object.assign(new Error("fixture access denied"), { code: "EACCES" });

test("only absent output roots are ignored", () => fixture(async (root) => {
  assert.deepEqual(await check(root), { found: 0, stripped: 0, clean: true });
  await fs.mkdir(path.join(root, "dist"));
  await fs.writeFile(path.join(root, "dist", "index.html"), "fixture");
  assert.equal((await check(root)).clean, true);
}));

test("inaccessible output roots fail closed", () => fixture(async (root) => {
  const injected = { ...fs, async lstat(file) {
    if (file === path.join(root, "dist")) throw denied();
    return fs.lstat(file);
  } };
  await assert.rejects(check(root, { fs: injected }), { code: "EACCES" });
}));

test("output roots and ancestor paths must be directories", () => fixture(async (root) => {
  await fs.writeFile(path.join(root, "dist"), "not an output directory");
  await assert.rejects(check(root), /not a directory/);
  await fs.unlink(path.join(root, "dist"));
  await fs.writeFile(path.join(root, ".vercel"), "not an ancestor directory");
  await assert.rejects(check(root), /not a directory/);
}));

test("traversal errors fail before any strip mutation", () => fixture(async (root) => {
  const corpus = path.join(root, "dist", "corpus");
  const nested = path.join(root, ".vercel", "output", "static", "assets");
  await fs.mkdir(corpus, { recursive: true });
  await fs.mkdir(nested, { recursive: true });
  const injected = { ...fs, async readdir(dir, options) {
    if (dir === nested) throw denied();
    return fs.readdir(dir, options);
  } };
  await assert.rejects(check(root, { strip: true, fs: injected }), { code: "EACCES" });
  assert.equal(await exists(corpus), true);
}));

test("inspection depth cannot silently hide forbidden files", () => fixture(async (root) => {
  const nested = path.join(root, "dist", ...Array(7).fill("nested"));
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(nested, "BerkeleyMono-Regular.woff2"), "fixture");
  await assert.rejects(check(root), /exceeds inspection depth/);
}));

test("symlinked output roots, ancestors and descendants are refused", () => fixture(async (root) => {
  const target = path.join(root, "target");
  await fs.mkdir(target);
  const link = path.join(root, "dist");
  await fs.symlink(target, link, "junction");
  await assert.rejects(check(root, { strip: true }), /symlinked output path/);
  await fs.unlink(link);
  await fs.symlink(target, path.join(root, ".vercel"), "junction");
  await assert.rejects(check(root), /symlinked output path/);
  await fs.unlink(path.join(root, ".vercel"));
  await fs.mkdir(link);
  await fs.symlink(target, path.join(link, "corpus"), "junction");
  await assert.rejects(check(root, { strip: true }), /symlinked output path/);
  assert.equal(await exists(target), true);
}));

test("strip removes only forbidden built output and preserves public originals", () => fixture(async (root) => {
  for (const out of ["dist", path.join(".vercel", "output", "static"), "public"]) {
    await fs.mkdir(path.join(root, out, "corpus"), { recursive: true });
    await fs.mkdir(path.join(root, out, "fonts"), { recursive: true });
    await fs.writeFile(path.join(root, out, "fonts", "BerkeleyMono-Regular.woff2"), "fixture");
    await fs.writeFile(path.join(root, out, "index.html"), "fixture");
  }
  assert.deepEqual(await check(root), { found: 4, stripped: 0, clean: false });
  assert.deepEqual(await check(root, { strip: true }), { found: 4, stripped: 4, clean: true });
  assert.equal((await check(root)).clean, true);
  assert.equal(await exists(path.join(root, "public", "corpus")), true);
  assert.equal(await exists(path.join(root, "public", "fonts", "BerkeleyMono-Regular.woff2")), true);
  assert.equal(await exists(path.join(root, "dist", "index.html")), true);
}));

test("a symlink introduced between inspection and stripping is refused", () => fixture(async (root) => {
  const corpus = path.join(root, "dist", "corpus");
  await fs.mkdir(corpus, { recursive: true });
  const injected = { ...fs, async lstat(file) {
    const result = await fs.lstat(file);
    if (file === corpus) return { isSymbolicLink: () => true };
    return result;
  } };
  await assert.rejects(check(root, { strip: true, fs: injected }), /symlinked output path/);
  assert.equal(await exists(corpus), true);
}));
