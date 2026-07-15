#!/usr/bin/env python3
"""Import missing chord/lyric sheets from community chord sites.

The local corpus is for personal use only and is excluded from deployment.

Usage:
    python tools/community_chords_fetch.py --artist "Alex G" --site all
    python tools/community_chords_fetch.py --artist "Alex G" --site guitartabsexplorer --dry
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "public" / "corpus"
MANIFEST = CORPUS / "manifest.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
VCHORDS_ARTISTS = {"alex g": "alex-g-((sandy)-alex-g)"}


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"(^-+|-+$)", "", re.sub(r"[^a-z0-9]+", "-", text.lower()))


def title_key(text: str) -> str:
    text = re.sub(r"\s*\((?:ver(?:sion)?\s*)?\d+\)\s*$", "", text, flags=re.I)
    text = re.sub(r"\s+(?:acoustic|chords?)$", "", text, flags=re.I)
    return slug(text)


def load_context(artist: str) -> tuple[set[str], set[str]]:
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    artist_rows = [r for r in rows if (r.get("artist") or "").casefold() == artist.casefold()]
    known_title_keys = {title_key(r["title"]) for r in artist_rows}
    chord_title_keys = {title_key(r["title"]) for r in artist_rows if r.get("format") == "chords"}
    return known_title_keys, chord_title_keys


def make_record(artist: str, title: str, source: str, source_url: str, body: str, capo: int | None = None) -> dict:
    return {
        "id": f"{slug(artist)}--{slug(title)}--{'gte' if source == 'guitartabsexplorer' else 'vch'}",
        "artist": artist,
        "title": title,
        "album": None,
        "albumOrder": 9999,
        "source": source,
        "sourceUrl": source_url,
        "tuning": "standard",
        "tuningRaw": None,
        "capo": capo,
        "key": None,
        "format": "chords",
        "transcriber": None,
        "fetchedAt": date.today().isoformat(),
        "body": body.strip(),
    }


def save_record(song: dict, dry: bool) -> None:
    out = CORPUS / song["source"]
    path = out / f"{song['id']}.json"
    if dry:
        print(f"  would fetch: {song['title']} [{song['source']}]")
        return
    out.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(song, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  ✓ {song['title']} [{song['source']}]")


def gte_title_hint(href: str) -> str:
    name = Path(urlparse(href).path).name
    name = re.sub(r"-chords$", "", name)
    name = re.sub(r"-(?:acoustic|\(ver\d+\))$", "", name)
    return name.replace("-", " ")


def gte_body(soup: BeautifulSoup) -> str:
    blocks = []
    for pre in soup.select("pre.tab-container.chord-text"):
        for badge in pre.select(".section-badge"):
            badge.replace_with(f"[{badge.get_text(' ', strip=True)}]")
        for chord in pre.select("span.chord"):
            chord.replace_with(chord.get("data-chord") or chord.get_text("", strip=True))
        text = html.unescape(pre.get_text("", strip=False)).replace("\r\n", "\n").strip()
        if text:
            blocks.append(text)
    return re.sub(r"\n{4,}", "\n\n\n", "\n\n".join(blocks)).strip()


def fetch_gte(artist: str, known_title_keys: set[str], chord_title_keys: set[str], dry: bool, limit: int, delay: float) -> int:
    session = requests.Session()
    session.headers.update(HEADERS)
    artist_slug = slug(artist)
    links: dict[str, str] = {}
    for page_num in range(1, 20):
        url = f"https://www.guitartabsexplorer.com/{artist_slug}/{page_num}/"
        response = session.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        page_links = [urljoin(url, a["href"]) for a in soup.select(f'a[href*="/{artist_slug}/"][href$="-chords"]')]
        if not page_links:
            break
        for href in page_links:
            key = title_key(gte_title_hint(href))
            if key in known_title_keys and key not in chord_title_keys:
                current = links.get(key)
                if current is None or ("acoustic" in current and "acoustic" not in href):
                    links[key] = href

    written = 0
    for href in list(links.values())[:limit]:
        time.sleep(delay)
        response = session.get(href, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        heading = soup.select_one("h1.song-title")
        title = next(heading.stripped_strings) if heading else gte_title_hint(href).title()
        title = re.sub(r"\s+by$", "", title, flags=re.I)
        body = gte_body(soup)
        if len(body) < 40:
            print(f"  ✗ {title}: no usable chart text")
            continue
        capo_match = re.search(r"\bcapo\s+(?:on\s+)?(?:the\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+fret)?\b", body, re.I)
        song = make_record(artist, title, "guitartabsexplorer", href, body, int(capo_match.group(1)) if capo_match else None)
        save_record(song, dry)
        chord_title_keys.add(title_key(title))
        written += 1
    return written


VCHORDS_CHART_JS = """
() => [...document.querySelectorAll('.sections .section')].map(section => {
  const title = section.querySelector('.head .title')?.textContent.trim();
  const lines = [];
  for (const row of section.querySelectorAll(':scope > .chrodlyric, :scope > .chordlyric, :scope > .lyric, :scope > .chords, :scope > .chordtable')) {
    const p = row.querySelector('p') || row;
    const anchors = [...p.querySelectorAll('span.relative')].map(rel => {
      const range = document.createRange();
      range.setStart(p, 0);
      range.setEndBefore(rel);
      const prefix = range.cloneContents();
      prefix.querySelectorAll?.('.chord_p').forEach(el => el.remove());
      return { pos: prefix.textContent.length, chord: rel.querySelector('.chord_p .chord')?.textContent.trim() };
    }).filter(x => x.chord);
    const clone = p.cloneNode(true);
    clone.querySelectorAll('.chord_p').forEach(el => el.remove());
    const lyric = clone.textContent.replace(/\u00a0/g, ' ').trimEnd();
    if (anchors.length) {
      let chordLine = '';
      for (const {pos, chord} of anchors) {
        const target = Math.max(pos, chordLine.length ? chordLine.length + 1 : 0);
        chordLine += ' '.repeat(Math.max(0, target - chordLine.length)) + chord;
      }
      lines.push(chordLine.trimEnd());
    }
    if (lyric.trim()) lines.push(lyric);
  }
  return { title, lines };
}).filter(section => section.lines.length)
"""


def fetch_vchords(artist: str, known_title_keys: set[str], chord_title_keys: set[str], dry: bool, limit: int, delay: float) -> int:
    artist_path = VCHORDS_ARTISTS.get(artist.casefold())
    if not artist_path:
        print(f"vchords: no artist path configured for {artist}")
        return 0
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("vchords: Python Playwright is not installed")
        return 0

    base = f"https://vchords.com/en/chords/{artist_path}"
    written = 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(base, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        candidates = page.locator(f'a[href*="/en/chords/{artist_path}/"]').evaluate_all(
            "els => [...new Map(els.map(el => [el.href, el.innerText.split('\\n')[0].trim()])).entries()]"
        )
        for href, title in candidates:
            key = title_key(title)
            if written >= limit or key not in known_title_keys or key in chord_title_keys:
                continue
            page.goto(href, wait_until="domcontentloaded")
            page.wait_for_selector(".sections .section", timeout=15000)
            page.wait_for_timeout(int(delay * 1000))
            sections = page.evaluate(VCHORDS_CHART_JS)
            body = "\n\n".join(
                f"[{section['title']}]\n" + "\n".join(section["lines"])
                for section in sections
            ).strip()
            if len(body) < 40:
                print(f"  ✗ {title}: no usable chart text")
                continue
            save_record(make_record(artist, title, "vchords", href, body), dry)
            chord_title_keys.add(key)
            written += 1
        browser.close()
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Import missing chord sheets from community sites.")
    parser.add_argument("--artist", required=True)
    parser.add_argument("--site", choices=("all", "guitartabsexplorer", "vchords"), default="all")
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--dry", action="store_true")
    args = parser.parse_args()

    known_title_keys, chord_title_keys = load_context(args.artist)
    total = 0
    if args.site in ("all", "vchords"):
        total += fetch_vchords(args.artist, known_title_keys, chord_title_keys, args.dry, args.limit - total, args.delay)
    if args.site in ("all", "guitartabsexplorer") and total < args.limit:
        total += fetch_gte(args.artist, known_title_keys, chord_title_keys, args.dry, args.limit - total, args.delay)
    print(f"community chords: {'would add' if args.dry else 'wrote'} {total}")


if __name__ == "__main__":
    main()
