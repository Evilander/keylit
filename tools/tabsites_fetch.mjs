// tabsites_fetch.mjs — scrape the classic fan tab archives into the local
// corpus (personal use only; public/corpus is gitignored, never ships).
//   node tools/tabsites_fetch.mjs --site nickdrake  [--dry|--limit N|--delay ms]
//   node tools/tabsites_fetch.mjs --site sonicyouth
//   node tools/tabsites_fetch.mjs --site loureed
//   node tools/tabsites_fetch.mjs --site actabs
// Each adapter returns {list: [{href,title,album?}], fetch(entry) -> record}.
// Declared tunings stay verbatim in the body — build_manifest's evidence
// chain (labels > declared > …) resolves them; Nick Drake and Sonic Youth
// are the whole reason the tuning filter exists.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SITE = flag("--site");
const DRY = args.includes("--dry");
const LIMIT = +(flag("--limit") || Infinity);
const DELAY = +(flag("--delay") || 600);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const get = (url, enc = "latin1") => execFileSync("curl", ["-sL", "-A", "Mozilla/5.0", url], { encoding: enc, maxBuffer: 16 * 1024 * 1024 });
const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&rsquo;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, "");
const pres = (h) => [...h.matchAll(/<pre>([\s\S]*?)<\/pre>/gi)].map((m) => strip(m[1]));
const capoFrom = (t) => { const m = t.match(/capo(?:\s*(?:on|at))?[^0-9]{0,12}(\d+)/i); return m ? +m[1] : null; };

const SITES = {
  nickdrake: {
    source: "nickdrake", dir: "nickdrake",
    async list() {
      const h = get("http://nickhealey.com/chndtabs/index.htm");
      const out = [];
      for (const m of h.matchAll(/<a[^>]+href="([a-z0-9_]+\.htm)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const title = strip(m[2]).replace(/\s+/g, " ").replace(/\*$/, "").trim();
        if (m[1] === "tunings.htm" || !title) continue;
        out.push({ href: `http://nickhealey.com/chndtabs/${m[1]}`, title, artist: "Nick Drake" });
      }
      return out;
    },
    async fetch(e) {
      const h = get(e.href);
      const body = pres(h).join("\n\n").trim();
      if (body.length < 60) return null;
      return { body, capo: capoFrom(body), format: "tab" };
    },
  },

  sonicyouth: {
    source: "sonicyouth", dir: "sonicyouth",
    async list() {
      const h = get("http://www.sonicyouth.com/mustang/tab/tabs.html");
      const seen = new Set(), out = [];
      for (const m of h.matchAll(/<a href="([a-z0-9_\-]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = m[1];
        if (/^(sotw|tabs|menu|gaugechart|index|style)/.test(href) || seen.has(href)) continue;
        const title = strip(m[2]).replace(/\s+/g, " ").replace(/^"|"$/g, "").replace(/" \+ "/g, " + ").trim();
        if (!title || /MAIN MENU/i.test(title)) continue;
        seen.add(href);
        out.push({ href: `http://www.sonicyouth.com/mustang/tab/${href}`, title, artist: "Sonic Youth" });
      }
      return out;
    },
    async fetch(e) {
      const h = get(e.href);
      const blocks = pres(h);
      // Tuning statements often live in the prose ABOVE the <pre> tab.
      const text = strip(h);
      const tunings = [...text.matchAll(/^.{0,90}tun(?:ed|ing)[^\n]{0,90}$/gim)].map((m) => m[0].trim());
      let body = blocks.join("\n\n").trim();
      if (body.length < 60) body = text.split(/\n/).map((l) => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (body.length < 60) return null;
      if (tunings.length && !blocks.some((b) => /tun(ed|ing)/i.test(b))) body = tunings.join("\n") + "\n\n" + body;
      return { body, capo: capoFrom(body), format: "tab" };
    },
  },

  loureed: {
    source: "loureed", dir: "loureed",
    async list() {
      const h = get("https://www.loureed.it/LR_tab/album.htm");
      const seen = new Set(), out = [];
      for (const m of h.matchAll(/href="(tabs\/[a-z0-9_\-]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        const title = strip(m[2]).replace(/\s+/g, " ").trim();
        if (!title) continue;
        out.push({ href: `https://www.loureed.it/LR_tab/${m[1]}`, title });
      }
      return out;
    },
    async fetch(e) {
      const h = get(e.href);
      const body = pres(h).join("\n\n").trim();
      if (body.length < 60) return null;
      // header credits the performing act: "(The Velvet Underground, 1969)"
      const head = body.slice(0, 400);
      const pm = head.match(/\(([^)]+?),\s*\d{4}\)/);
      const acts = ["The Velvet Underground", "Lou Reed"];
      const artist = pm && acts.find((a) => pm[1].toLowerCase().includes(a.toLowerCase().replace("the ", ""))) || "Lou Reed";
      const am = head.match(/album\s+_?([^_\n]+?)_?\s*\n/i);
      return { body, capo: capoFrom(body), format: "tab", artist, album: am ? am[1].trim() : null };
    },
  },

  actabs: {
    source: "actabs", dir: "actabs",
    async list() {
      const h = get("http://actabs.pbworks.com/w/page/25729163/Index", "utf8");
      const out = [];
      // album sections: <li><em>…Album…</em></li> then an <ol> of songs
      const secs = h.split(/<li[^>]*>\s*<em>/i).slice(1);
      for (const sec of secs) {
        const album = strip(sec.slice(0, sec.indexOf("</em>"))).replace(/\s+/g, " ").trim();
        const ol = sec.slice(0, sec.indexOf("</ol>"));
        for (const m of ol.matchAll(/<a[^>]+href="(\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
          if (/folder\.php|\/browse\//.test(m[1])) continue;
          const title = strip(m[2]).replace(/\s+/g, " ").trim();
          if (!title) continue;
          const solo = /person pitch|young prayer|tomboy|panda bear/i.test(album) ? "Panda Bear"
            : /pullhair|down there|eucalyptus|cows on hourglass/i.test(album) ? "Avey Tare" : "Animal Collective";
          out.push({ href: `http://actabs.pbworks.com${m[1]}`, title, album, artist: solo });
        }
      }
      return out;
    },
    async fetch(e) {
      const h = get(e.href, "utf8");
      const i = h.indexOf('id="wikipage-inner"');
      if (i < 0) return null;
      const inner = h.slice(i, h.indexOf("<!-- /wikipage content -->", i) > 0 ? h.indexOf("<!-- /wikipage content -->", i) : i + 200000);
      const body = inner
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|pre|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&rsquo;/g, "'").replace(/&#?\w+;/g, "")
        .split("\n").map((l) => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (body.length < 60) return null;
      return { body, capo: capoFrom(body), format: "tab" };
    },
  },
  zenandjuice: {
    // OLGA-era Big Star archive (archive-scout find, 2026-07-22): raw .txt tabs
    // linked from a plain index. The site also hosts other power-pop bands and a
    // Velvet Crush bonus section — the allowlist keeps this Big Star only.
    source: "zenandjuice", dir: "zenandjuice",
    async list() {
      const ALBUM = {
        "feel": "#1 Record", "the ballad of el goodo": "#1 Record", "thirteen": "#1 Record",
        "my life is right": "#1 Record", "o my soul": "Radio City", "way out west": "Radio City",
        "september gurls": "Radio City", "im in love with a girl": "Radio City",
        "back of a car": "Radio City", "daisy glaze": "Radio City",
        "you get what you deserve": "Radio City", "blue moon": "Third/Sister Lovers",
        "holocaust": "Third/Sister Lovers", "night time": "Third/Sister Lovers",
        "o dana": "Third/Sister Lovers",
      };
      const base = "http://zenandjuice.com/music/bigstar/chords/";
      const h = get(base, "utf8");
      const seen = new Map(), out = [];
      for (const m of h.matchAll(/<a[^>]+href="([^"]+\.txt)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const title = strip(m[2]).replace(/\s+/g, " ").trim();
        const norm = title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+\((easy|complete)\)$/, "").trim();
        if (!(norm in ALBUM)) continue; // not on the Big Star allowlist (e.g. Velvet Crush)
        const n = (seen.get(norm) || 0) + 1;
        seen.set(norm, n);
        out.push({
          href: new URL(m[1], base).href,
          title: n > 1 ? `${title} (ver ${n})` : title,
          album: ALBUM[norm], artist: "Big Star",
        });
      }
      return out;
    },
    async fetch(e) {
      const body = get(e.href, "latin1").replace(/\r\n/g, "\n").trim();
      if (body.length < 60 || /<html/i.test(body)) return null;
      return { body, capo: capoFrom(body), format: /\|-{2,}/.test(body) ? "tab" : "chords" };
    },
  },
};

const site = SITES[SITE];
if (!site) { console.log("usage: node tools/tabsites_fetch.mjs --site nickdrake|sonicyouth|loureed|actabs [--dry|--limit N|--delay ms]"); process.exit(1); }

const OUT = path.join(ROOT, "public", "corpus", site.dir);
fs.mkdirSync(OUT, { recursive: true });
const list = await site.list();
console.log(`${SITE}: ${list.length} pages listed`);

let written = 0, skipped = 0, failed = 0;
for (const e of list.slice(0, LIMIT)) {
  const artistGuess = e.artist || "Unknown";
  const id0 = `${slug(artistGuess)}--${slug(e.title)}`;
  const fp0 = path.join(OUT, `${id0}.json`);
  if (fs.existsSync(fp0)) { skipped++; continue; }
  if (DRY) { console.log(`  would fetch: ${artistGuess} — ${e.title}${e.album ? ` [${e.album}]` : ""}`); continue; }
  await sleep(DELAY);
  try {
    const r = await site.fetch(e);
    if (!r) throw new Error("no usable chart content");
    const artist = r.artist || e.artist || "Unknown";
    const id = `${slug(artist)}--${slug(e.title)}`;
    const rec = {
      id, artist, title: e.title,
      album: r.album ?? e.album ?? null, albumOrder: 9999,
      source: site.source, sourceUrl: e.href,
      tuning: "standard", tuningRaw: null,
      capo: r.capo, key: null, format: r.format,
      transcriber: null, fetchedAt: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ ...rec, body: r.body }), "utf8");
    console.log(`  ✓ ${artist} — ${e.title}${r.capo ? ` (capo ${r.capo})` : ""}`);
    written++;
  } catch (err) {
    console.log(`  ✗ ${e.title}: ${err.message}`);
    failed++;
  }
}
console.log(`written ${written} · skipped ${skipped} · failed ${failed}`);
