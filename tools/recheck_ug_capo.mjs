// recheck_ug_capo.mjs — re-fetch UG page metadata for corpus records whose
// capo is null and backfill capo when the live page declares one. The text
// audit (audit_capo.mjs) can't see these: UG shows capo in its metadata
// sidebar, not in the chart body, and some harvest paths dropped it.
// Resumable: progress lands in public/corpus/_state/ug_capo_recheck.jsonl;
// already-checked URLs are skipped on re-run.
//   node tools/recheck_ug_capo.mjs [--dry] [--limit N] [--delay ms] [--only slug]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public", "corpus", "ultimateguitar");
const LOG = path.join(ROOT, "public", "corpus", "_state", "ug_capo_recheck.jsonl");

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry");
const LIMIT = +(flag("--limit") || Infinity);
const DELAY = +(flag("--delay") || 1200);
const ONLY = flag("--only");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same transport as ug_fetch.mjs: UG 403s Node's fetch TLS fingerprint but
// serves curl fine.
function fetchPage(url) {
  return execFileSync("curl", ["-s", "--compressed", "-A", UA, url],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

async function pageMeta(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const html = fetchPage(url);
    const m = html.match(/data-content="([^"]+)"/);
    if (m) {
      const json = m[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
      const d = JSON.parse(json).store?.page?.data;
      if (!d?.tab_view) return { gone: true };
      return {
        capo: d.tab_view.meta?.capo ?? null,
        tuningRaw: d.tab_view.meta?.tuning?.value ?? null,
        key: d?.tab?.tonality_name || null,
      };
    }
    if (/404|not found|removed/i.test(html.slice(0, 2000)) && html.length < 40_000) return { gone: true };
    if (attempt < 3) await sleep(2000 * (attempt + 1));
  }
  return { failed: true };
}

const done = new Set(
  fs.existsSync(LOG)
    ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).url)
    : [],
);

const targets = [];
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  if (rec.capo != null) continue;
  if (!/tabs\.ultimate-guitar\.com/.test(rec.sourceUrl || "")) continue;
  if (ONLY && !f.includes(ONLY)) continue;
  if (done.has(rec.sourceUrl)) continue;
  targets.push({ f, rec });
}
console.log(`recheck targets: ${targets.length} (already logged: ${done.size})`);

let fixed = 0, confirmedNull = 0, gone = 0, failed = 0, checked = 0;
for (const { f, rec } of targets) {
  if (checked >= LIMIT) break;
  checked++;
  await sleep(DELAY);
  let meta;
  try { meta = await pageMeta(rec.sourceUrl); }
  catch (e) { meta = { failed: true, err: e.message }; }

  const entry = { url: rec.sourceUrl, file: f, ...meta, at: new Date().toISOString().slice(0, 16) };
  if (meta.failed) {
    failed++;
    console.log(`  ✗ ${f}: fetch failed`);
    // not logged as done — retried on next run
  } else if (meta.gone) {
    gone++;
    fs.appendFileSync(LOG, JSON.stringify(entry) + "\n");
  } else if (meta.capo > 0) {
    fixed++;
    console.log(`  ✓ ${f}: capo ${meta.capo}${rec.key == null && meta.key ? ` (key ${meta.key})` : ""}`);
    if (!DRY) {
      rec.capo = meta.capo;
      if (rec.key == null && meta.key) rec.key = meta.key;
      if (rec.tuningRaw == null && meta.tuningRaw) rec.tuningRaw = meta.tuningRaw;
      fs.writeFileSync(path.join(DIR, f), JSON.stringify(rec), "utf8");
    }
    fs.appendFileSync(LOG, JSON.stringify(entry) + "\n");
  } else {
    confirmedNull++;
    fs.appendFileSync(LOG, JSON.stringify(entry) + "\n");
  }
  if (checked % 50 === 0) console.log(`… ${checked}/${Math.min(targets.length, LIMIT)}  fixed ${fixed} · no-capo ${confirmedNull} · gone ${gone} · failed ${failed}`);
}
console.log(`checked ${checked} · capo fixed ${fixed} · confirmed no-capo ${confirmedNull} · page gone ${gone} · failed ${failed}`);
