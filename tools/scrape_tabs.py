#!/usr/bin/env python3
"""
scrape_tabs.py — polite, resumable scraper for guitar tabs/chords from five
static fan sites, normalized into a local JSON corpus for Keylit.

PERSONAL USE ONLY. The corpus is written to public/corpus/ for local
consumption by the Keylit app. Every song record carries its source name and
exact source URL (attribution). Do not publish, redistribute, or re-host the
scraped corpus.

Sources:
  dylanchords   - https://www.dylanchords.com        (Bob Dylan)
  sweetadeline  - http://www.sweetadeline.net         (Elliott Smith)
  lennonchords  - https://www.oestrem.com/lennonchords (Lennon/McCartney/Harrison)
  hyperrust     - https://hyperrust.org               (Neil Young)
  gumbo         - https://www.gumbopages.com          (Wilco/Uncle Tupelo/Son Volt)

Usage:
    python scrape_tabs.py --source dylanchords --limit 40
    python scrape_tabs.py --source all --limit 1000000   # effectively "all"

Output:
    public/corpus/{source}/{songId}.json   - one file per song
    public/corpus/manifest.json            - lightweight browse index (no body)
    public/corpus/_state/{source}.seen.json - fetched-URL log for resumability

Resumability: a song is skipped (no network request) if its output JSON
already exists, or its source URL is recorded in the source's seen-state file.
Re-running the same command later picks up where it left off and fetches the
NEXT batch of up to --limit NEW songs.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
CORPUS_DIR = REPO_ROOT / "public" / "corpus"
STATE_DIR = CORPUS_DIR / "_state"
MANIFEST_PATH = CORPUS_DIR / "manifest.json"

# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

BROWSER_HEADERS = {
    "User-Agent": DEFAULT_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

REQUEST_TIMEOUT = 20
MAX_RETRIES = 3


def fetch(session: requests.Session, url: str, headers: dict | None = None):
    """GET with retry/backoff. Returns a Response on 200, else None."""
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(
                url, headers=headers or BROWSER_HEADERS, timeout=REQUEST_TIMEOUT
            )
        except requests.RequestException as e:
            last_exc = e
            wait = (2**attempt) + random.uniform(0, 1)
            print(f"    [warn] {url} -> {e!r}; retry {attempt}/{MAX_RETRIES} in {wait:.1f}s")
            time.sleep(wait)
            continue
        if resp.status_code == 200:
            return resp
        if resp.status_code in (429, 500, 502, 503, 504):
            wait = (2**attempt) + random.uniform(0, 1)
            print(f"    [warn] {url} -> HTTP {resp.status_code}; retry {attempt}/{MAX_RETRIES} in {wait:.1f}s")
            time.sleep(wait)
            continue
        print(f"    [error] {url} -> HTTP {resp.status_code}; not retrying")
        return None
    print(f"    [error] {url} -> giving up after {MAX_RETRIES} retries ({last_exc!r})")
    return None


def decode_body(resp: requests.Response) -> str:
    """Decode raw bytes preferring UTF-8, falling back to cp1252 (common on
    these older, pre-2005 fan sites) and finally latin-1 (never fails)."""
    raw = resp.content
    for enc in ("utf-8", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


# --------------------------------------------------------------------------
# Text helpers
# --------------------------------------------------------------------------


def clean_text(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def slugify(text: str) -> str:
    if not text:
        return "untitled"
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    text = re.sub(r"-{2,}", "-", text)
    return text or "untitled"


TUNING_MAP = {
    "standard": "standard",
    "eadgbe": "standard",
    "standard tuning": "standard",
    "drop d": "dropD",
    "dropd": "dropD",
    "dadgbe": "dropD",
    "open d": "openD",
    "open d tuning": "openD",
    "open e": "openE",
    "open g": "openG",
    "open g tuning": "openG",
    "open a": "openA",
    "open c": "openC",
    "dadgad": "DADGAD",
}

TUNING_LINE_RE = re.compile(r"^\s*Tuning\s*[:=]\s*(.+)$", re.I | re.M)
CAPO_LINE_RE = re.compile(r"^\s*Capo\s*[:=]?\s*(\d+)", re.I | re.M)
TRANSCRIBER_RE = re.compile(r"(?:tabbed|transcribed|arranged)\s+by\s*[:\-]?\s*(.*)", re.I)


def extract_tuning_capo(body: str) -> tuple[str, str | None, int | None]:
    tuning_raw = None
    tuning_id = "standard"
    m = TUNING_LINE_RE.search(body)
    if m:
        tuning_raw = clean_text(m.group(1))
        if tuning_raw:
            key_compact = re.sub(r"[^a-z0-9 ]", "", tuning_raw.lower()).strip()
            key_nospace = key_compact.replace(" ", "")
            tuning_id = TUNING_MAP.get(key_compact) or TUNING_MAP.get(key_nospace) or "standard"

    capo = None
    m2 = CAPO_LINE_RE.search(body)
    if m2:
        val = int(m2.group(1))
        if val > 0:
            capo = val
    return tuning_id, tuning_raw, capo


def extract_transcriber(body: str) -> str | None:
    lines = body.split("\n")
    for i, line in enumerate(lines):
        m = TRANSCRIBER_RE.search(line)
        if m:
            val = clean_text(m.group(1))
            if not val and i + 1 < len(lines):
                val = clean_text(lines[i + 1])
            if val:
                return val[:200]
    return None


CHORD_TOKEN_RE = re.compile(
    r"^\(?[A-G][#b♯♭]?(maj|min|dim|aug|sus|add)?[0-9]*(/[A-G][#b]?)?\)?\.?,?$",
    re.I,
)


def _looks_like_tab_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if re.match(r"^[eEABDGbadg]?\s*[|:].*[-0-9]", s):
        return True
    body_chars = re.sub(r"\s", "", s)
    if len(body_chars) >= 8 and "-" in body_chars:
        dash_digit = sum(1 for c in body_chars if c in "-0123456789")
        if dash_digit / len(body_chars) > 0.6:
            return True
    return False


def _looks_like_chord_line(line: str) -> bool:
    tokens = line.split()
    if not tokens or len(tokens) > 12:
        return False
    return all(CHORD_TOKEN_RE.match(t) for t in tokens)


def detect_format(body: str) -> str:
    """Best-effort classifier: 'tab' if it contains a run of >=4 consecutive
    ASCII tab-staff lines, 'chords' if it has chord-only lines (chord-over-
    lyric charts), 'mixed' if both, defaulting to 'chords'."""
    lines = body.split("\n")
    run = max_run = 0
    chord_line_count = 0
    for line in lines:
        if _looks_like_tab_line(line):
            run += 1
            max_run = max(max_run, run)
        else:
            run = 0
        if _looks_like_chord_line(line):
            chord_line_count += 1

    tab_found = max_run >= 4
    chords_found = chord_line_count >= 3

    if tab_found and chords_found:
        return "mixed"
    if tab_found:
        return "tab"
    return "chords"


# --------------------------------------------------------------------------
# State / manifest / output
# --------------------------------------------------------------------------


def atomic_write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_seen(source: str) -> set[str]:
    f = STATE_DIR / f"{source}.seen.json"
    if f.exists():
        try:
            return set(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            return set()
    return set()


def save_seen(source: str, seen: set[str]) -> None:
    atomic_write_json(STATE_DIR / f"{source}.seen.json", sorted(seen))


def load_manifest() -> dict[str, dict]:
    if MANIFEST_PATH.exists():
        try:
            arr = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            return {f"{item['source']}::{item['id']}": item for item in arr}
        except Exception:
            return {}
    return {}


def write_manifest(manifest: dict[str, dict]) -> None:
    arr = sorted(manifest.values(), key=lambda x: (x["source"], x["id"]))
    atomic_write_json(MANIFEST_PATH, arr)


def manifest_entry(record: dict) -> dict:
    return {
        "id": record["id"],
        "artist": record["artist"],
        "title": record["title"],
        "album": record["album"],
        "source": record["source"],
        "sourceUrl": record["sourceUrl"],
        "tuning": record["tuning"],
        "capo": record["capo"],
        "format": record["format"],
        "hasTab": record["format"] in ("tab", "mixed"),
    }


# --------------------------------------------------------------------------
# Site adapter: dylanchords (Bob Dylan)
# --------------------------------------------------------------------------

DYLAN_INDEX_URL = "https://www.dylanchords.com/written/bob-dylan"
DYLAN_SONG_LINK_RE = re.compile(r"^/\d{2}_[a-z]+/[a-z0-9_]+$", re.I)


def list_dylanchords(session: requests.Session) -> list[dict]:
    resp = fetch(session, DYLAN_INDEX_URL)
    if resp is None:
        raise RuntimeError("could not fetch dylanchords index")
    time.sleep(SOURCES["dylanchords"]["delay"])
    soup = BeautifulSoup(decode_body(resp), "html.parser")
    seen_hrefs: set[str] = set()
    out = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not DYLAN_SONG_LINK_RE.match(href) or href in seen_hrefs:
            continue
        text = clean_text(a.get_text())
        if not text:
            continue  # the icon-only duplicate link for this href has no text
        seen_hrefs.add(href)
        out.append(
            {
                "artist": "Bob Dylan",
                "title": text,
                "album": None,
                "source_url": urljoin(DYLAN_INDEX_URL, href),
            }
        )
    return out


def extract_body_dylanchords(resp: requests.Response, url: str) -> str | None:
    soup = BeautifulSoup(decode_body(resp), "html.parser")
    parts = []
    for el in soup.select("pre.verse, pre.tab, pre.chordcharts"):
        text = el.get_text().strip("\n")
        if text.strip():
            parts.append(text)
    return "\n\n".join(parts) if parts else None


# --------------------------------------------------------------------------
# Site adapter: sweetadeline (Elliott Smith)
# --------------------------------------------------------------------------

SA_INDEX_URLS = [
    "http://www.sweetadeline.net/tabs.html",
    "http://www.sweetadeline.net/tabs2.html",
]
SA_NAV_BASENAMES = {
    "tabs.html",
    "tabs2.html",
    "music.html",
    "shows.html",
    "bio.html",
    "multimedia.htm",
    "fans.html",
    "links.html",
    "contact.html",
    "esmf.html",
    "albums.html",
    "cds.html",
    "7.html",
    "cass.html",
    "comps.html",
    "heat.html",
    "amurderof.html",
    "strangerthan.html",
    "ga.html",
    "lyrics.html",
    "contribute.html",
    "romancandle.html",
}
SA_VERSION_RE = re.compile(r"^\(v\.?\s*\d+\)$", re.I)


def list_sweetadeline(session: requests.Session) -> list[dict]:
    out = []
    current_title = None
    for index_url in SA_INDEX_URLS:
        resp = fetch(session, index_url)
        if resp is None:
            print(f"    [warn] sweetadeline index fetch failed: {index_url}")
            continue
        time.sleep(SOURCES["sweetadeline"]["delay"])
        soup = BeautifulSoup(decode_body(resp), "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "sweetadeline.net" not in href:
                continue
            if not re.search(r"\.(html?|txt)$", href, re.I):
                continue
            basename = href.rsplit("/", 1)[-1].lower()
            if basename in SA_NAV_BASENAMES:
                continue
            text = clean_text(a.get_text())
            if text and not SA_VERSION_RE.match(text):
                current_title = text
            if not current_title:
                continue
            out.append(
                {
                    "artist": "Elliott Smith",
                    "title": current_title,
                    "album": None,
                    "source_url": href,
                }
            )
    return out


def extract_body_sweetadeline(resp: requests.Response, url: str) -> str | None:
    raw = decode_body(resp)
    if url.lower().endswith(".txt"):
        return raw.strip("\n") if raw.strip() else None
    soup = BeautifulSoup(raw, "html.parser")
    pre = soup.find("pre")
    if pre:
        text = pre.get_text().strip("\n")
        return text if text.strip() else None
    if soup.body:
        text = soup.body.get_text("\n").strip("\n")
        return text if text.strip() else None
    return None


# --------------------------------------------------------------------------
# Site adapter: lennonchords (Lennon / McCartney / Harrison)
# --------------------------------------------------------------------------

LN_LEFTNAV_URL = "https://www.oestrem.com/lennonchords/leftnav.htm"
LN_LENNON_ALBUM_RE = re.compile(
    r"^(?:\d{2}_[\w-]+|rishikesh|1981|mendips|weybridge|00_\w+)/index\.html?$", re.I
)
LN_MCCARTNEY_RE = re.compile(r"^mccartney/index\.html?$", re.I)
LN_HARRISON_RE = re.compile(r"^harrison/index\.html?$", re.I)


def list_lennonchords(session: requests.Session) -> list[dict]:
    resp = fetch(session, LN_LEFTNAV_URL)
    if resp is None:
        raise RuntimeError("could not fetch lennonchords leftnav")
    time.sleep(SOURCES["lennonchords"]["delay"])
    soup = BeautifulSoup(decode_body(resp), "html.parser")

    sections = []  # (leaf_url, artist, album)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if LN_MCCARTNEY_RE.match(href):
            sections.append((urljoin(LN_LEFTNAV_URL, href), "Paul McCartney", None))
        elif LN_HARRISON_RE.match(href):
            sections.append((urljoin(LN_LEFTNAV_URL, href), "George Harrison", None))
        elif LN_LENNON_ALBUM_RE.match(href):
            album_name = clean_text(a.get_text()) or None
            sections.append((urljoin(LN_LEFTNAV_URL, href), "John Lennon", album_name))

    out = []
    for leaf_url, artist, album in sections:
        resp2 = fetch(session, leaf_url)
        if resp2 is None:
            print(f"    [warn] lennonchords section fetch failed: {leaf_url}")
            continue
        time.sleep(SOURCES["lennonchords"]["delay"])
        soup2 = BeautifulSoup(decode_body(resp2), "html.parser")
        for a2 in soup2.find_all("a", href=True):
            href2 = a2["href"]
            if not href2.lower().endswith(".txt"):
                continue
            text2 = clean_text(a2.get_text())
            if not text2:
                continue
            out.append(
                {
                    "artist": artist,
                    "title": text2,
                    "album": album,
                    "source_url": urljoin(leaf_url, href2),
                }
            )
    return out


def extract_body_lennonchords(resp: requests.Response, url: str) -> str | None:
    raw = decode_body(resp).strip("\n")
    return raw if raw.strip() else None


# --------------------------------------------------------------------------
# Site adapter: hyperrust (Neil Young)
# --------------------------------------------------------------------------

HR_LIST_URL = "https://hyperrust.org/cgi-bin/msl.pl?0300"
HR_SONG_LINK_RE = re.compile(r"mt\.pl\?(\d+)$")


def list_hyperrust(session: requests.Session) -> list[dict]:
    resp = fetch(session, HR_LIST_URL)
    if resp is None:
        raise RuntimeError("could not fetch hyperrust list")
    time.sleep(SOURCES["hyperrust"]["delay"])
    soup = BeautifulSoup(decode_body(resp), "html.parser")
    out = []
    seen_ids: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = HR_SONG_LINK_RE.search(href)
        if not m or m.group(1) in seen_ids:
            continue
        text = clean_text(a.get_text())
        if not text:
            continue
        seen_ids.add(m.group(1))
        out.append(
            {
                "artist": "Neil Young",
                "title": text,
                "album": None,
                "source_url": urljoin(HR_LIST_URL, href),
            }
        )
    return out


def extract_body_hyperrust(resp: requests.Response, url: str) -> str | None:
    soup = BeautifulSoup(decode_body(resp), "html.parser")
    parts = [p.get_text().strip("\n") for p in soup.find_all("pre")]
    parts = [p for p in parts if p.strip()]
    return "\n\n".join(parts) if parts else None


# --------------------------------------------------------------------------
# Site adapter: gumbo (Wilco / Uncle Tupelo / Son Volt)
# --------------------------------------------------------------------------

GUMBO_INDEXES = [
    ("https://www.gumbopages.com/wilco.html", "Wilco"),
    ("https://www.gumbopages.com/uncle-tupelo.html", "Uncle Tupelo"),
    ("https://www.gumbopages.com/son-volt.html", "Son Volt"),
]


def list_gumbo(session: requests.Session) -> list[dict]:
    out = []
    for index_url, artist in GUMBO_INDEXES:
        resp = fetch(session, index_url)
        if resp is None:
            print(f"    [warn] gumbo index fetch failed: {index_url}")
            continue
        time.sleep(SOURCES["gumbo"]["delay"])
        soup = BeautifulSoup(decode_body(resp), "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/songs/" not in href:
                continue
            text = clean_text(a.get_text()).strip('"').strip()
            if not text:
                continue
            out.append(
                {
                    "artist": artist,
                    "title": text,
                    "album": None,
                    "source_url": urljoin(index_url, href),
                }
            )
    return out


def extract_body_gumbo(resp: requests.Response, url: str) -> str | None:
    raw = decode_body(resp).strip("\n")
    return raw if raw.strip() else None


# --------------------------------------------------------------------------
# Source registry
# --------------------------------------------------------------------------

SOURCES = {
    "dylanchords": {
        "delay": 10.0,
        "list_fn": list_dylanchords,
        "extract_fn": extract_body_dylanchords,
    },
    "sweetadeline": {
        "delay": 2.0,
        "list_fn": list_sweetadeline,
        "extract_fn": extract_body_sweetadeline,
    },
    "lennonchords": {
        "delay": 2.0,
        "list_fn": list_lennonchords,
        "extract_fn": extract_body_lennonchords,
    },
    "hyperrust": {
        "delay": 2.0,
        "list_fn": list_hyperrust,
        "extract_fn": extract_body_hyperrust,
    },
    "gumbo": {
        "delay": 2.0,
        "list_fn": list_gumbo,
        "extract_fn": extract_body_gumbo,
    },
}


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------


def run_source(session: requests.Session, source: str, limit: int, manifest: dict) -> dict:
    cfg = SOURCES[source]
    seen = load_seen(source)
    out_dir = CORPUS_DIR / source
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== {source}: listing songs ===")
    try:
        candidates = cfg["list_fn"](session)
    except Exception as e:
        print(f"[error] failed to list {source}: {e!r}")
        return {"new": 0, "failed": 0, "skipped": 0, "counts": {}}
    print(f"{source}: {len(candidates)} candidate songs found in index")

    used_ids: dict[str, int] = {}
    seen_urls_this_listing: set[str] = set()
    attempted = 0
    failed = 0
    skipped = 0
    counts = {"tab": 0, "chords": 0, "mixed": 0}

    for cand in candidates:
        if attempted >= limit:
            break
        url = cand["source_url"]
        if url in seen_urls_this_listing:
            continue
        seen_urls_this_listing.add(url)

        artist_slug = slugify(cand["artist"])
        title_slug = slugify(cand["title"])
        base_id = f"{artist_slug}--{title_slug}"
        n = used_ids.get(base_id, 0) + 1
        used_ids[base_id] = n
        song_id = base_id if n == 1 else f"{base_id}-v{n}"

        out_path = out_dir / f"{song_id}.json"
        if out_path.exists() or url in seen:
            skipped += 1
            continue

        attempted += 1
        print(f"  [{attempted}/{limit}] {source}: fetching '{cand['title']}' <- {url}")
        resp = fetch(session, url)
        time.sleep(cfg["delay"])
        if resp is None:
            failed += 1
            continue

        body = cfg["extract_fn"](resp, url)
        if not body:
            print("    [warn] empty body extracted, skipping")
            failed += 1
            continue

        fmt = detect_format(body)
        tuning_id, tuning_raw, capo = extract_tuning_capo(body)
        record = {
            "id": song_id,
            "artist": cand["artist"],
            "title": cand["title"],
            "album": cand.get("album"),
            "source": source,
            "sourceUrl": url,
            "tuning": tuning_id,
            "tuningRaw": tuning_raw,
            "capo": capo,
            "key": None,
            "format": fmt,
            "body": body,
            "transcriber": extract_transcriber(body),
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
        atomic_write_json(out_path, record)
        counts[fmt] += 1
        seen.add(url)
        save_seen(source, seen)
        manifest[f"{source}::{song_id}"] = manifest_entry(record)
        write_manifest(manifest)

    print(
        f"{source}: done. fetched_ok={attempted - failed} failed={failed} "
        f"skipped_existing={skipped} (tab={counts['tab']} chords={counts['chords']} mixed={counts['mixed']})"
    )
    return {"new": attempted - failed, "failed": failed, "skipped": skipped, "counts": counts}


def main():
    parser = argparse.ArgumentParser(description="Scrape guitar tabs/chords into a local JSON corpus.")
    parser.add_argument(
        "--source",
        required=True,
        choices=list(SOURCES.keys()) + ["all"],
        help="Which site to scrape, or 'all' for every site.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=1_000_000,
        help="Max NEW songs to fetch this run per source (already-fetched songs are skipped and don't count).",
    )
    args = parser.parse_args()

    sources = list(SOURCES.keys()) if args.source == "all" else [args.source]

    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)

    manifest = load_manifest()
    grand = {"new": 0, "failed": 0, "skipped": 0}
    grand_counts = {"tab": 0, "chords": 0, "mixed": 0}

    for source in sources:
        result = run_source(session, source, args.limit, manifest)
        grand["new"] += result["new"]
        grand["failed"] += result["failed"]
        grand["skipped"] += result["skipped"]
        for k, v in result.get("counts", {}).items():
            grand_counts[k] += v

    print("\n=== TOTAL ===")
    print(
        f"new={grand['new']} failed={grand['failed']} skipped_existing={grand['skipped']} "
        f"(tab={grand_counts['tab']} chords={grand_counts['chords']} mixed={grand_counts['mixed']})"
    )
    print(f"manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    sys.exit(main())
