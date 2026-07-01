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
import html as html_module
import json
import random
import re
import sys
import time
import unicodedata
from collections import defaultdict
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

# A true 6-line ASCII tab system separates the string label from the fret
# numbers with a pipe ("e|---0---"), or (many fan sites, e.g. hyperrust) just
# stacks 6 bare dash/fret lines with no label at all. A colon
# ("Am: X02210", "G: 320033") is a one-line "chords used" fingering
# shorthand -- a single line naming one chord's fret positions -- and must
# NEVER count as a tab-staff line even though it can coincidentally start
# with a string letter (E/A/D/G/B are also chord names).
TAB_LABELED_LINE_RE = re.compile(r"^\s*[eEABDGabdg]\s*\|(.*)$")


def _looks_like_tab_line(line: str) -> bool:
    s = line.strip()
    if not s or ":" in s:
        return False
    m = TAB_LABELED_LINE_RE.match(s)
    body_chars = re.sub(r"\s", "", m.group(1) if m else s)
    if len(body_chars) < 8 or "-" not in body_chars:
        return False
    dash_digit = sum(1 for c in body_chars if c in "-0123456789xX|")
    return dash_digit / len(body_chars) > 0.6


def _looks_like_chord_line(line: str) -> bool:
    tokens = line.split()
    if not tokens or len(tokens) > 12:
        return False
    return all(CHORD_TOKEN_RE.match(t) for t in tokens)


def detect_format(body: str) -> str:
    """Best-effort classifier: 'tab' if it contains a run of >=4 consecutive
    ASCII tab-staff lines (string-labeled "e|---0---" or bare "---0---"),
    'chords' if it has chord-only lines (chord-over-lyric charts) or
    single-line "chords used" fingering shorthand ("Em: 022000") -- which
    never counts as a tab-staff line -- 'mixed' if both, defaulting to
    'chords'."""
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
# Junk-title detection (used at scrape time and by --clean)
# --------------------------------------------------------------------------

JUNK_TITLE_RE = re.compile(
    r"^\(?(v\.?\s*\d+|intro|outro|verse|chorus|bridge|solo|interlude|coda|"
    r"pre-?chorus|bass|guitar|piano|drums|drum|chords?|tabs?|riff|acoustic|"
    r"electric|demo|alt(?:ernate)?|live|instrumental|section|part|reprise)"
    r"\.?\)?$",
    re.I,
)


def is_junk_title(title: str | None) -> bool:
    t = (title or "").strip()
    if len(t) < 2:
        return True
    return bool(JUNK_TITLE_RE.match(t))


def normalize_key(s: str | None) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


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
        "album": record.get("album"),
        "albumOrder": record.get("albumOrder", 9999),
        "source": record["source"],
        "sourceUrl": record["sourceUrl"],
        "tuning": record["tuning"],
        "capo": record["capo"],
        "format": record["format"],
        "hasTab": record["format"] in ("tab", "mixed"),
    }


def rebuild_manifest_from_disk() -> dict[str, dict]:
    """Scan every public/corpus/{source}/*.json file on disk and rebuild the
    manifest from scratch (used by --rebuild-manifest and --clean)."""
    manifest: dict[str, dict] = {}
    if not CORPUS_DIR.exists():
        return manifest
    for source_dir in sorted(CORPUS_DIR.iterdir()):
        if not source_dir.is_dir() or source_dir.name == "_state":
            continue
        source = source_dir.name
        for f in sorted(source_dir.glob("*.json")):
            try:
                record = json.loads(f.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"    [warn] could not parse {f}: {e!r}")
                continue
            manifest[f"{source}::{record['id']}"] = manifest_entry(record)
    return manifest


# --------------------------------------------------------------------------
# Site adapter: dylanchords (Bob Dylan)
# --------------------------------------------------------------------------

DYLAN_INDEX_URL = "https://www.dylanchords.com/written/bob-dylan"
# NOTE: the album-code segment can itself contain digits (e.g. "06_hwy61",
# "42_bs5"), so this must allow [a-z0-9]+, not just [a-z]+ -- the original
# letters-only version silently dropped every song under those albums.
DYLAN_SONG_LINK_RE = re.compile(r"^/\d{2}_[a-z0-9]+/[a-z0-9_]+$", re.I)

# href album-folder-prefix -> album name, scraped once from the "Albums"
# sidebar table on the artist index page (https://www.dylanchords.com/written/
# bob-dylan). Static: this taxonomy is stable and the site is effectively
# unmaintained, so hardcoding avoids an extra network round-trip on every
# --clean / backfill run. albumOrder is just the NN prefix as an int, which
# matches the site's own chronological numbering.
DYLAN_ALBUM_MAP: dict[str, tuple[str, int]] = {
    "01_bobdylan": ("Bob Dylan", 1),
    "02_freewheelin": ("The Freewheelin' Bob Dylan", 2),
    "03_times": ("The Times They Are A-Changin'", 3),
    "04_anotherside": ("Another Side Of Bob Dylan", 4),
    "05_biabh": ("Bringing It All Back Home", 5),
    "06_hwy61": ("Highway 61 Revisited", 6),
    "07_bob": ("Blonde on Blonde", 7),
    "08_jwh": ("John Wesley Harding", 8),
    "09_nashville": ("Nashville Skyline", 9),
    "10_selfportrait": ("Self Portrait", 10),
    "11_newmorning": ("New Morning", 11),
    "12_billy": ("Pat Garrett & Billy The Kid", 12),
    "13_dylan": ("Dylan", 13),
    "14_planetwaves": ("Planet Waves", 14),
    "15_beforetheflood": ("Before the Flood", 15),
    "16_bott": ("Blood on the Tracks", 16),
    "17_basement": ("The Basement Tapes", 17),
    "18_desire": ("Desire", 18),
    "20_streetlegal": ("Street-Legal", 20),
    "21_budokan": ("At Budokan", 21),
    "22_slowtrain": ("Slow Train Coming", 22),
    "23_saved": ("Saved", 23),
    "24_shotoflove": ("Shot of Love", 24),
    "25_infidels": ("Infidels", 25),
    "26_reallive": ("Real Live", 26),
    "27_empire": ("Empire Burlesque", 27),
    "28_biograph": ("Biograph", 28),
    "29_knocked": ("Knocked Out Loaded", 29),
    "30_down": ("Down In The Groove", 30),
    "31_ohmercy": ("Oh Mercy", 31),
    "33_utrs": ("Under the Red Sky", 33),
    "34_bootleg": ("The Bootleg Series, Vol. 1–3: Rare & Unreleased 1961-1991", 34),
    "35_gaibty": ("Good As I Been To You", 35),
    "36_wgw": ("World Gone Wrong", 36),
    "37_unplugged": ("Unplugged", 37),
    "38_toom": ("Time out of Mind", 38),
    "39_rah": ("The Bootleg Series, Vol. 4: Live 1966", 39),
    "41_lat": ('"Love And Theft"', 41),
    "42_bs5": ("The Bootleg Series, Vol. 5: Live 1975", 42),
    "43_bs6": ("The Bootleg Series, Vol. 6: Live 1964", 43),
    "45_modern": ("Modern Times", 45),
    "46_bs8": ("The Bootleg Series, Vol. 8: Tell Tale Signs", 46),
    "47_ttl": ("Together Through Life", 47),
    "48_cith": ("Christmas in the Heart", 48),
    "50_tempest": ("Tempest", 50),
    "53_shadows": ("Shadows In the Night", 53),
    "56_rough": ("Rough and Rowdy Ways", 56),
}

DYLAN_ALBUM_HREF_RE = re.compile(r"^https?://[^/]+/(\d{2}_[a-z0-9]+)/", re.I)


def dylan_album_for_url(url: str) -> tuple[str | None, int]:
    m = DYLAN_ALBUM_HREF_RE.match(url)
    if not m:
        return None, 9999
    return DYLAN_ALBUM_MAP.get(m.group(1).lower(), (None, 9999))


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
# Matches link text that is a VERSION/INSTRUMENT/SECTION annotation of the
# song immediately preceding it in the list ("(v.2)", "(intro)", "(bass)",
# bare "piano", etc) rather than a new song title. Reusing JUNK_TITLE_RE here
# (with or without surrounding parens) is exactly what prevents these from
# clobbering current_title -- which is the root cause of the "(bass)"/
# "(intro)"/"(piano)" junk-titled entries this site produced.
SA_ANNOTATION_RE = JUNK_TITLE_RE

# tabs.html groups songs under album headings rendered as bold <strong> text
# ("either/or", "xo", ...). tabs2.html is the same catalog flattened
# alphabetically with no album headings, so it contributes no new album info
# (but may be the only place a stray song shows up).
SA_SKIP_HEADINGS = {"tablature", "by record", "by title", "contribute"}
SA_ALBUM_NAME_FIXES = {
    "roman candle": "Roman Candle",
    "elliott smith": "Elliott Smith",
    "either or": "Either/Or",
    "xo": "XO",
    "figure 8": "Figure 8",
    "from a basement on the hill": "From a Basement on the Hill",
    "new moon": "New Moon",
    "good will hunting": "Good Will Hunting",
    "b sides": "B-Sides",
    "unreleased music": "Unreleased Music",
    "heatmiser dead air": "Heatmiser: Dead Air",
    "heatmiser yellow no 5": "Heatmiser: Yellow No. 5",
    "heatmiser cop and speeder": "Heatmiser: Cop and Speeder",
    "heatmiser mic city sons": "Heatmiser: Mic City Sons",
    "stranger than fiction": "Stranger Than Fiction",
    "covers": "Covers",
}


def _sa_clean_album_name(raw: str) -> str:
    text = re.sub(r"\s*:\s*", ": ", clean_text(raw))
    key = normalize_key(text)
    return SA_ALBUM_NAME_FIXES.get(key, text.title())


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
        current_album = None
        album_order_map: dict[str, int] = {}
        next_order = 1
        # 'strong' (album headings) and 'a' (song/version links) walked
        # together, in document order, so heading state updates as we go.
        for tag in soup.find_all(["strong", "a"]):
            if tag.name == "strong":
                heading = clean_text(tag.get_text())
                if not heading or normalize_key(heading) in SA_SKIP_HEADINGS:
                    continue
                current_album = _sa_clean_album_name(heading)
                if current_album not in album_order_map:
                    album_order_map[current_album] = next_order
                    next_order += 1
                continue

            if not tag.has_attr("href"):
                continue
            href = tag["href"]
            if "sweetadeline.net" not in href:
                continue
            if not re.search(r"\.(html?|txt)$", href, re.I):
                continue
            basename = href.rsplit("/", 1)[-1].lower()
            if basename in SA_NAV_BASENAMES:
                continue
            text = clean_text(tag.get_text())
            if normalize_key(text) in SA_SKIP_HEADINGS:
                # site-nav link ("by record" / "by title" / "contribute"),
                # not a song -- skip without touching current_title.
                continue
            if text and not SA_ANNOTATION_RE.match(text):
                current_title = text
            if not current_title:
                continue
            out.append(
                {
                    "artist": "Elliott Smith",
                    "title": current_title,
                    "album": current_album,
                    "albumOrder": album_order_map.get(current_album, 9999) if current_album else 9999,
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

    sections = []  # (leaf_url, artist, album, albumOrder)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if LN_MCCARTNEY_RE.match(href):
            # No per-album breakdown exists on this site for the solo/Wings
            # catalog -- it's one flat alphabetical page. Best-effort: no
            # album, don't block on it.
            sections.append((urljoin(LN_LEFTNAV_URL, href), "Paul McCartney", None, 9999))
        elif LN_HARRISON_RE.match(href):
            sections.append((urljoin(LN_LEFTNAV_URL, href), "George Harrison", None, 9999))
        elif LN_LENNON_ALBUM_RE.match(href):
            album_name = clean_text(a.get_text()) or None
            m_order = re.match(r"^(\d+)_", href)
            album_order = int(m_order.group(1)) if m_order else 9999
            sections.append((urljoin(LN_LEFTNAV_URL, href), "John Lennon", album_name, album_order))

    out = []
    for leaf_url, artist, album, album_order in sections:
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
                    "albumOrder": album_order,
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


# Album/era info for hyperrust isn't on the song-list or tab pages -- it's
# one hop further, on the per-song "Song Info" page (m.pl?<id>), which links
# to the album page (ma.pl?<albumId>) that carries the album title and
# release date. This costs two extra polite-delayed requests per NEW song,
# cached per album id since many songs share an album.
HR_ALBUM_REF_RE = re.compile(r"ma\.pl\?(\d+)")
HR_ALBUM_NAME_RE = re.compile(r"<font size=\+1>(.*?)</font>", re.S)
HR_DATE_RE = re.compile(r"(?:Released|Recorded)\s*([A-Za-z]+)\s*(\d{1,2})?,?\s*(\d{4})", re.I)
HR_MONTHS = {
    m.lower(): i
    for i, m in enumerate(
        [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ],
        start=1,
    )
}
HYPERRUST_ALBUM_CACHE: dict[str, tuple[str | None, int]] = {}


def _hr_parse_album_page(body: str) -> tuple[str | None, int]:
    name = None
    m = HR_ALBUM_NAME_RE.search(body)
    if m:
        name = clean_text(html_module.unescape(m.group(1))) or None
    order = 9999
    dm = HR_DATE_RE.search(html_module.unescape(body))
    if dm:
        month = HR_MONTHS.get(dm.group(1).lower())
        day = int(dm.group(2)) if dm.group(2) else 1
        year = int(dm.group(3))
        if month:
            order = year * 10000 + month * 100 + day
    return name, order


def fetch_hyperrust_album(session: requests.Session, delay: float, song_num: str) -> tuple[str | None, int]:
    resp = fetch(session, f"https://hyperrust.org/cgi-bin/m.pl?{song_num}")
    time.sleep(delay)
    if resp is None:
        return None, 9999
    body = decode_body(resp)
    m = HR_ALBUM_REF_RE.search(body)
    if not m:
        return None, 9999
    album_id = m.group(1)
    if album_id in HYPERRUST_ALBUM_CACHE:
        return HYPERRUST_ALBUM_CACHE[album_id]
    resp2 = fetch(session, f"https://hyperrust.org/cgi-bin/ma.pl?{album_id}")
    time.sleep(delay)
    result = (None, 9999) if resp2 is None else _hr_parse_album_page(decode_body(resp2))
    HYPERRUST_ALBUM_CACHE[album_id] = result
    return result


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
# Album resolution (dispatches to the per-source strategy described above)
# --------------------------------------------------------------------------


def resolve_album(source: str, session: requests.Session, cfg: dict, cand: dict, url: str) -> tuple[str | None, int]:
    if source == "dylanchords":
        return dylan_album_for_url(url)
    if source in ("sweetadeline", "lennonchords"):
        # already resolved at list time (album headings / folder structure)
        return cand.get("album"), cand.get("albumOrder", 9999)
    if source == "hyperrust":
        m = HR_SONG_LINK_RE.search(url)
        if not m:
            return None, 9999
        return fetch_hyperrust_album(session, cfg["delay"], m.group(1))
    # gumbo: no per-song album info available on this site; best-effort null.
    return None, 9999


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

        if is_junk_title(cand["title"]):
            continue

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
        album, album_order = resolve_album(source, session, cfg, cand, url)
        record = {
            "id": song_id,
            "artist": cand["artist"],
            "title": cand["title"],
            "album": album,
            "albumOrder": album_order,
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
        # Re-merge with whatever is on disk right now before writing: this is
        # a long-running, resumable process and other sources (or a second
        # invocation of this script) may be writing the same manifest.json
        # concurrently. Holding one long-lived in-memory snapshot for the
        # whole run would clobber their updates on every write.
        manifest.update(load_manifest())
        manifest[f"{source}::{song_id}"] = manifest_entry(record)
        write_manifest(manifest)

    print(
        f"{source}: done. fetched_ok={attempted - failed} failed={failed} "
        f"skipped_existing={skipped} (tab={counts['tab']} chords={counts['chords']} mixed={counts['mixed']})"
    )
    return {"new": attempted - failed, "failed": failed, "skipped": skipped, "counts": counts}


# --------------------------------------------------------------------------
# --clean: apply the junk-title / dedup / format / album-backfill rules to
# whatever is already on disk (no re-fetch of already-downloaded bodies).
# --------------------------------------------------------------------------


def backfill_album_from_record(session: requests.Session, source: str, record: dict) -> tuple[str | None, int]:
    """Best-effort album/albumOrder for a record that predates the album
    fields, using only what's already on disk (plus, for hyperrust, a couple
    of extra polite-delayed requests since that site has no other way)."""
    url = record.get("sourceUrl", "")
    if source == "dylanchords":
        return dylan_album_for_url(url)
    if source == "hyperrust":
        m = HR_SONG_LINK_RE.search(url)
        if not m:
            return None, 9999
        return fetch_hyperrust_album(session, SOURCES["hyperrust"]["delay"], m.group(1))
    if source == "lennonchords" and record.get("artist") == "John Lennon":
        m = re.search(r"/(\d+)_([\w-]+)/[^/]+$", url)
        if m:
            order = int(m.group(1))
            name = re.sub(r"[_-]+", " ", m.group(2)).strip().title()
            return name or None, order
        return None, 9999
    # sweetadeline/gumbo/mccartney/harrison: no reconstructable album info
    # from the stored URL alone -- leave whatever is already there.
    return record.get("album"), record.get("albumOrder", 9999)


def clean_source(session: requests.Session, source: str) -> dict:
    out_dir = CORPUS_DIR / source
    stats = {"junk_removed": 0, "dupes_removed": 0, "format_changed": 0, "album_backfilled": 0, "remaining": 0}
    if not out_dir.exists():
        return stats

    records: list[tuple[Path, dict]] = []
    for f in sorted(out_dir.glob("*.json")):
        try:
            records.append((f, json.loads(f.read_text(encoding="utf-8"))))
        except Exception as e:
            print(f"    [warn] could not parse {f}: {e!r}")

    kept = []
    for f, d in records:
        if is_junk_title(d.get("title")):
            f.unlink()
            stats["junk_removed"] += 1
            continue
        kept.append((f, d))

    groups: dict[tuple[str, str], list[tuple[Path, dict]]] = defaultdict(list)
    for f, d in kept:
        key = (normalize_key(d.get("artist", "")), normalize_key(d.get("title", "")))
        groups[key].append((f, d))

    survivors = []
    for _key, group in groups.items():
        if len(group) == 1:
            survivors.append(group[0])
            continue
        group_sorted = sorted(group, key=lambda item: len(item[1].get("body") or ""), reverse=True)
        best = group_sorted[0]
        best_len = len(best[1].get("body") or "")
        if best_len > 0:
            second = group_sorted[1]
            second_len = len(second[1].get("body") or "")
            comparable = (best_len - second_len) / best_len < 0.10
            best_is_txt = best[1].get("sourceUrl", "").lower().endswith(".txt")
            second_is_txt = second[1].get("sourceUrl", "").lower().endswith(".txt")
            if comparable and second_is_txt and not best_is_txt:
                best = second
        survivors.append(best)
        for f, _d in group_sorted:
            if f != best[0]:
                f.unlink()
                stats["dupes_removed"] += 1

    for f, d in survivors:
        new_fmt = detect_format(d.get("body") or "")
        if new_fmt != d.get("format"):
            d["format"] = new_fmt
            stats["format_changed"] += 1
        if "albumOrder" not in d:
            album, order = backfill_album_from_record(session, source, d)
            d["album"] = album
            d["albumOrder"] = order
            stats["album_backfilled"] += 1
        atomic_write_json(f, d)

    stats["remaining"] = len(survivors)
    return stats


def main():
    parser = argparse.ArgumentParser(description="Scrape guitar tabs/chords into a local JSON corpus.")
    parser.add_argument(
        "--source",
        choices=list(SOURCES.keys()) + ["all"],
        default=None,
        help="Which site to scrape (or clean), or 'all' for every site.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=1_000_000,
        help="Max NEW songs to fetch this run per source (already-fetched songs are skipped and don't count).",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Apply junk-title/dedup/format/album-backfill rules to already-downloaded files "
        "(honors --source to limit to one site), then rebuild manifest.json.",
    )
    parser.add_argument(
        "--rebuild-manifest",
        action="store_true",
        help="Rebuild manifest.json from the per-song JSON files already on disk. No network.",
    )
    args = parser.parse_args()

    if args.rebuild_manifest and not args.clean:
        manifest = rebuild_manifest_from_disk()
        write_manifest(manifest)
        print(f"manifest rebuilt: {len(manifest)} songs -> {MANIFEST_PATH}")
        return

    if args.clean:
        sources = list(SOURCES.keys()) if not args.source or args.source == "all" else [args.source]
        session = requests.Session()
        session.headers.update(BROWSER_HEADERS)
        grand = {"junk_removed": 0, "dupes_removed": 0, "format_changed": 0, "album_backfilled": 0, "remaining": 0}
        for source in sources:
            print(f"\n=== cleaning {source} ===")
            stats = clean_source(session, source)
            print(
                f"{source}: junk_removed={stats['junk_removed']} dupes_removed={stats['dupes_removed']} "
                f"format_changed={stats['format_changed']} album_backfilled={stats['album_backfilled']} "
                f"remaining={stats['remaining']}"
            )
            for k in grand:
                grand[k] += stats[k]
        manifest = rebuild_manifest_from_disk()
        write_manifest(manifest)
        print("\n=== CLEAN TOTAL ===")
        print(grand)
        print(f"manifest rebuilt: {len(manifest)} songs -> {MANIFEST_PATH}")
        return

    if not args.source:
        parser.error("--source is required unless --clean or --rebuild-manifest is given")

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
