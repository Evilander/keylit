// check_publish.mjs — the gate that keeps personal-use and licensed files out
// of a public deploy.
//
//   node tools/check_publish.mjs           report, exit 1 if anything is there
//   node tools/check_publish.mjs --strip   remove them first, then report
//
// .vercelignore covers a plain `vercel` upload, but it has no say over
// `.vercel/output` on a prebuilt deploy and none at all over any other host.
// `vite build` copies public/ wholesale, so the built output carries a second
// copy of both the scraped corpus and the licensed mono font. Checking the
// OUTPUT is the only gate that holds whichever way the deploy goes out.
import * as filesystem from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUTS = ["dist", path.join(".vercel", "output", "static")];

// Personal-use scrape: third-party tab bodies, never ours to publish.
// Berkeley Mono: licensed per seat, so serving it from a public URL is
// redistribution. The app falls back to a system monospace without it.
const FORBIDDEN = [
  { label: "scraped tab corpus", match: (name, isDir) => isDir && name === "corpus" },
  { label: "licensed Berkeley Mono", match: (name) => /^BerkeleyMono-.*\.woff2$/.test(name) },
];

async function inspectOutput(root, out, fs) {
  let dir = root;
  for (const part of out.split(path.sep)) {
    dir = path.join(dir, part);
    let info;
    try { info = await fs.lstat(dir); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (info.isSymbolicLink()) throw new Error(`Refusing symlinked output path: ${dir}`);
    if (!info.isDirectory()) throw new Error(`Output path is not a directory: ${dir}`);
  }
  return dir;
}

async function walk(dir, hits, fs, depth = 0) {
  if (depth > 6) throw new Error(`Output exceeds inspection depth: ${dir}`);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`Refusing symlinked output path: ${full}`);
    const rule = FORBIDDEN.find((f) => f.match(e.name, e.isDirectory()));
    if (rule) { hits.push({ full, rule }); continue; } // do not descend into a hit
    if (e.isDirectory()) await walk(full, hits, fs, depth + 1);
  }
  return hits;
}

export async function checkPublish({ root = ROOT, strip = false, fs = filesystem, log = console.log, error = console.error } = {}) {
  root = path.resolve(root);
  const rootInfo = await fs.lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`Invalid project root: ${root}`);
  const outputs = [];
  // Inspect every output before stripping any of them. An unreadable second
  // output must not permit a partial cleanup followed by a false clean result.
  for (const out of OUTPUTS) {
    const dir = await inspectOutput(root, out, fs);
    if (dir) outputs.push({ out, dir, hits: await walk(dir, [], fs) });
  }
  let found = 0;
  for (const { out, dir, hits } of outputs) for (const hit of hits) {
    found++;
    const rel = path.relative(root, hit.full);
    if (strip) {
      const relativeToOutput = path.relative(dir, path.resolve(hit.full));
      if (!relativeToOutput || relativeToOutput.startsWith("..") || path.isAbsolute(relativeToOutput)) {
        throw new Error("Refusing to strip a path outside the built output");
      }
      if (await inspectOutput(root, out, fs) !== dir) throw new Error(`Output disappeared before stripping: ${dir}`);
      const parent = path.dirname(hit.full);
      if (parent !== dir) await inspectOutput(root, path.relative(root, parent), fs);
      const info = await fs.lstat(hit.full);
      if (info.isSymbolicLink()) throw new Error(`Refusing symlinked output path: ${hit.full}`);
      await fs.rm(hit.full, { recursive: true, force: true });
      log(`removed  ${rel}  (${hit.rule.label})`);
    } else {
      error(`PRESENT  ${rel}  (${hit.rule.label})`);
    }
  }

  if (!found) log("publish check: clean — no corpus, no licensed fonts in the built output");
  else if (strip) log(`publish check: stripped ${found} path(s); output is safe to publish`);
  else {
    error(`\npublish check FAILED: ${found} path(s) must not be published.`);
    error("Run `npm run build:deploy` to build and strip them, or delete them before deploying.");
  }
  return { found, stripped: strip ? found : 0, clean: !found || strip };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkPublish({ strip: process.argv.includes("--strip") });
    process.exitCode = result.clean ? 0 : 1;
  } catch (error) {
    console.error(`publish check FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
