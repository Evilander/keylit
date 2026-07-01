#!/usr/bin/env python3
"""
ingest_pdf.py — extract per-song JSON records from a text-based guitar
tab/chord PDF songbook into the Keylit local corpus.

PERSONAL USE ONLY. Output goes to public/corpus/<collection>/ for local
consumption by the Keylit app. This script does NOT touch or rebuild
public/corpus/manifest.json — a separate --rebuild-manifest pass (owned by
scrape_tabs.py / another process) picks up these files later.

Currently supports:
  --book bluebook   "A Blue Guitar Tab Book" (Mark Kozelek / Red House
                     Painters / Sun Kil Moon), a single consistently
                     typeset PDF. Songs are detected structurally via
                     PyMuPDF font metadata (title / version / artist·album /
                     tuning header block), not regex-on-flattened-text,
                     because the PDF has a decorative per-chapter watermark
                     that corrupts naive `pdftotext -layout` extraction by
                     bleeding into the tab columns underneath it.

  --book acousticfavorites   "Acoustic Favorites Volume 1" — a hand-assembled
                     fan chord/tab compilation. Song headers are bold
                     CourierNew lines, but the "TITLE BY ARTIST" convention
                     is inconsistent across entries (some are "ARTIST -
                     TITLE", some have no artist at all). Where the artist
                     can't be confidently split out, artist is left null
                     rather than guessed — the title keeps the full raw
                     header text so no information is lost.

Usage:
    python tools/ingest_pdf.py --book bluebook --pdf "C:/path/to/Blue_Guitar_Tab_Book.pdf"
    python tools/ingest_pdf.py --book acousticfavorites --pdf "C:/path/to/Acoustic Favorites Volume 1.pdf" --out local
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF

REPO_ROOT = Path(__file__).resolve().parent.parent
CORPUS_DIR = REPO_ROOT / "public" / "corpus"

MIDDLE_DOT = "·"

# --------------------------------------------------------------------------
# Shared helpers (mirrors tools/scrape_tabs.py conventions so bluebook
# records are indistinguishable in shape from the scraped corpus)
# --------------------------------------------------------------------------


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
    """'tab' if >=4 consecutive ASCII tab-staff lines, 'chords' if chord-only
    lines dominate, 'mixed' if both, defaulting to 'chords'."""
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


TRANSCRIBER_RE = re.compile(
    r"(?:tabbed by|transcribed by|credit|arranged by)\s*[:\-]?\s*(.+)", re.I
)


def extract_transcriber(body: str) -> str | None:
    for line in body.split("\n"):
        m = TRANSCRIBER_RE.search(line)
        if m:
            val = re.sub(r"\s+", " ", m.group(1)).strip(" .")
            if val:
                return val[:200]
    return None


def atomic_write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# --------------------------------------------------------------------------
# Tuning normalization — reuse the same 6-string preset spellings Keylit's
# src/data/tunings.js already ships, so a recognized tuning gets the SAME id
# the app's tuning engine (src/lib/tuning.js getTuning()) knows about.
# --------------------------------------------------------------------------

REFERENCE_SPELLINGS = {
    "standard": "EADGBE",
    "dropD": "DADGBE",
    "doubleDropD": "DADGBD",
    "dropC": "CGCFAD",
    "dropCsharp": "C#G#C#F#A#D#",
    "openD": "DADF#AD",
    "openE": "EBEG#BE",
    "openG": "DGDGBD",
    "openA": "EAEAC#E",
    "openC": "CGCGCE",
    "openCsus2": "CGCGCD",
    "DADGAD": "DADGAD",
    "CGCGCD": "CGCGCD",
    "DADGBD": "DADGBD",
    "EADEAE": "EADEAE",
    "kozelekDADEBCsharp": "DADEBC#",
    "halfStepDown": "EbAbDbGbBbEb",
    "kurtVileHalfStepUp": "FBbEbAbCF",
    "nickDrakeOpenCadd4": "CGCFCE",
    "nickDrakeOpenE5": "BEBEBE",
    "nickDrakeLute": "EADF#BE",
    "nickDrakePlaceToBe": "CGCFGE",
    "nickDrakeThreeHours": "BBDGBE",
    "nickDrakeBlackEyedDog": "GGDGBD",
    "pavementDADABE": "DADABE",
    "pavementCGDABE": "CGDABE",
    "pavementCGDGBE": "CGDGBE",
    "grizzlyBearSleepingUte": "EAC#F#AC#",
    "joniMitchellOpenCadd9": "CGDFCE",
}

_LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NOTE_TOKEN_RE = re.compile(r"[A-Ga-g][#b♯♭]?")
_PURE_LETTERS_RE = re.compile(r"^(?:[A-Ga-g][#b♯♭]?)+$")


def _pitch_class(token: str) -> int:
    pc = _LETTER_PC[token[0].upper()]
    if len(token) > 1:
        acc = token[1]
        if acc in ("#", "♯"):
            pc += 1
        elif acc in ("b", "♭"):
            pc -= 1
    return pc % 12


def _spelling_to_pcs(spelling: str) -> list[int]:
    return [_pitch_class(t) for t in _NOTE_TOKEN_RE.findall(spelling)]


_REFERENCE_PCS = {tid: _spelling_to_pcs(sp) for tid, sp in REFERENCE_SPELLINGS.items()}


def normalize_tuning(tuning_raw: str | None) -> str:
    """Best-effort mapping of a free-text tuning string to a short id.
    Recognized 6-string presets get Keylit's canonical id; a parseable but
    unrecognized 6-note spelling becomes its own compact letter id (still a
    real, informative tag); anything else (descriptive text, 'standard',
    empty) falls back to 'standard' — matching tools/scrape_tabs.py's
    existing TUNING_MAP fallback convention."""
    if not tuning_raw:
        return "standard"
    # strip parenthetical annotations for matching, e.g. "(Whole Step Down)"
    cleaned = re.sub(r"\([^)]*\)", "", tuning_raw).strip()
    cleaned_nospace = re.sub(r"\s+", "", cleaned)
    if not cleaned_nospace or cleaned_nospace.rstrip("?").lower() == "standard":
        return "standard"
    if _PURE_LETTERS_RE.match(cleaned_nospace):
        tokens = _NOTE_TOKEN_RE.findall(cleaned_nospace)
        if len(tokens) == 6:
            pcs = [_pitch_class(t) for t in tokens]
            for tid, ref_pcs in _REFERENCE_PCS.items():
                if ref_pcs == pcs:
                    return tid
            return cleaned_nospace  # custom but clean 6-string spelling
    if "standard" in tuning_raw.lower():
        return "standard"
    return "standard"


def split_tuning_capo(tuning_line_text: str) -> tuple[str, int | None]:
    """'Tuning: D G C F A D   Capo: 3' -> ('D G C F A D', 3)."""
    raw = tuning_line_text.split(":", 1)[1].strip() if ":" in tuning_line_text else tuning_line_text.strip()
    capo = None
    m = re.search(r"\bCapo\s*:\s*(\d+)", raw, re.I)
    if m:
        capo = int(m.group(1))
        raw = raw[: m.start()].strip()
    return raw, capo


# --------------------------------------------------------------------------
# PDF structural extraction (bluebook)
# --------------------------------------------------------------------------

FOOTER_Y = 740.0
WATERMARK_SIZE_MIN = 15.0
TRANSCRIPTIONS_SUBTITLE_RE = re.compile(r"^\d+\s+transcriptions$")


def _page_lines(page):
    """(y0, text, size, font) for every non-empty text line on the page,
    top-to-bottom. Filters the page footer and the per-chapter decorative
    watermark (both of which corrupt naive pdftotext -layout output by
    sharing a y-band with real tab content)."""
    out = []
    for block in page.get_text("dict")["blocks"]:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            text = "".join(s["text"] for s in line["spans"])
            if not text.strip():
                continue
            y0 = line["bbox"][1]
            if y0 > FOOTER_Y:
                continue
            size = round(line["spans"][0]["size"], 1)
            font = line["spans"][0]["font"]
            if size >= WATERMARK_SIZE_MIN:
                continue
            if TRANSCRIPTIONS_SUBTITLE_RE.match(text.strip()):
                continue
            out.append((y0, text, size, font))
    out.sort(key=lambda t: t[0])
    return out


def _is_title(size, font):
    return font == "Helvetica-Bold" and 14.3 <= size <= 14.7


def _is_version(size, font):
    return font == "Helvetica-Oblique" and 9.3 <= size <= 9.7


def _is_artist_album(size, font):
    return font == "Helvetica" and 8.5 <= size <= 8.7


def _is_tuning(size, font):
    return font == "Helvetica-Bold" and 8.3 <= size <= 8.5


def _is_body(font):
    return font in ("Courier", "Courier-Bold")


def extract_bluebook_songs(pdf_path: Path):
    doc = fitz.open(str(pdf_path))
    songs = []
    cur = None
    last_body_pos = None  # (page_idx, y) of last appended body line, for gap detection

    def flush():
        nonlocal cur
        if cur is not None:
            songs.append(cur)
        cur = None

    for page_idx, page in enumerate(doc):
        for y, text, size, font in _page_lines(page):
            if _is_title(size, font):
                flush()
                cur = {
                    "title": text.strip(),
                    "version": None,
                    "artist": None,
                    "album": None,
                    "tuning_raw": None,
                    "capo": None,
                    "body_lines": [],
                }
                last_body_pos = None
                continue

            if cur is None:
                continue  # front matter / TOC noise before the first song

            if _is_version(size, font) and cur["version"] is None and cur["artist"] is None:
                cur["version"] = text.strip()
                continue

            if _is_artist_album(size, font) and cur["artist"] is None:
                parts = re.split(r"\s*" + MIDDLE_DOT + r"\s*", text)
                cur["artist"] = re.sub(r"\s+", " ", parts[0]).strip()
                if len(parts) > 1:
                    cur["album"] = re.sub(r"\s+", " ", parts[1]).strip()
                continue

            if _is_tuning(size, font) and text.strip().startswith("Tuning:") and cur["tuning_raw"] is None:
                raw, capo = split_tuning_capo(text.strip())
                cur["tuning_raw"] = raw
                cur["capo"] = capo
                continue

            if _is_body(font):
                if last_body_pos and last_body_pos[0] == page_idx and (y - last_body_pos[1]) > 15:
                    cur["body_lines"].append("")
                cur["body_lines"].append(text)
                last_body_pos = (page_idx, y)
                continue
            # else: front/back-matter prose (Helvetica, off-pattern size) — drop

    flush()
    return songs


# --------------------------------------------------------------------------
# PDF structural extraction (acousticfavorites)
# --------------------------------------------------------------------------

AF_HEADER_FONT = "CourierNewPS-BoldMT"
PAGE_OF_RE = re.compile(r"\(\s*PAGE\s+\d+\s+OF\s+\d+\s*\)", re.I)
CAPO_ANY_RE = re.compile(r"\bCAPO\b\s*[:=]?\s*(?:ON\s+)?(\d+)", re.I)
# Section labels that happen to share the song-header's bold style — not titles.
AF_SECTION_LABEL_RE = re.compile(
    r"^\[?\(?(intro|verse|chorus|refrain|bridge|interlude|outro|pre-?chorus|fade|"
    r"\d+(st|nd|rd|th)?\s+verse|repeat)\b",
    re.I,
)
BY_RE = re.compile(r"\bRECORDED\s+BY\b|\bBY\s*:?\s*(?=\S)", re.I)


def _af_page_lines(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            text = "".join(s["text"] for s in line["spans"])
            if not text.strip():
                continue
            y0 = line["bbox"][1]
            span0 = line["spans"][0]
            out.append((y0, text, round(span0["size"], 1), span0["font"], span0["flags"]))
    out.sort(key=lambda t: t[0])
    return out


def _af_is_header(size, font, flags):
    return font == AF_HEADER_FONT and 9.7 <= size <= 10.3 and flags == 24


def _af_split_title_artist(raw: str) -> tuple[str, str | None]:
    """Best-effort 'TITLE BY ARTIST' / 'RECORDED BY ARTIST' split. Falls back
    to (raw, None) rather than guessing when the header uses an ambiguous
    'X - Y' or 'X (Y)' shape (order isn't structurally recoverable)."""
    m = BY_RE.search(raw)
    if m:
        title = raw[: m.start()].strip(" -–—")
        artist = raw[m.end() :].strip(" -–—")
        # a big gap after the artist name usually introduces an unrelated
        # trailing annotation (tuning notes, "Gtr I ...", etc) — cut there.
        artist = re.split(r"\s{2,}", artist, maxsplit=1)[0].strip()
        # "(BY ARTIST)" leaves a stray unmatched "(" / ")" on each side
        if title.endswith("(") and artist.endswith(")"):
            title = title[:-1].strip()
            artist = artist[:-1].strip()
        if title and artist:
            return title, artist
    return raw.strip(), None


def extract_acoustic_favorites_songs(pdf_path: Path):
    doc = fitz.open(str(pdf_path))
    songs = []
    cur = None
    cur_base_title = None  # header text with PAGE-N-OF-M / CAPO stripped, for continuation matching

    def flush():
        nonlocal cur
        if cur is not None:
            songs.append(cur)
        cur = None

    for page_idx in range(1, len(doc) - 1):  # skip front & back TOC pages
        for y, text, size, font, flags in _af_page_lines(doc[page_idx]):
            stripped = text.strip()
            if _af_is_header(size, font, flags):
                if AF_SECTION_LABEL_RE.match(stripped):
                    if cur is not None:
                        cur["body_lines"].append(text)
                    continue

                # A standalone "(...)" bold line right after a title, before any
                # body content, annotates the CURRENT song (a capo note or a
                # bare artist name) rather than starting a new one.
                paren_only = re.match(r"^\(([^()]+)\)$", stripped)
                if paren_only and cur is not None and not cur["body_lines"]:
                    inner = paren_only.group(1).strip()
                    capo_m = CAPO_ANY_RE.search(inner)
                    if capo_m:
                        cur["capo"] = int(capo_m.group(1))
                    elif cur["artist"] is None:
                        cur["artist"] = inner
                    continue

                capo_m = CAPO_ANY_RE.search(stripped)
                capo = int(capo_m.group(1)) if capo_m else None
                base = PAGE_OF_RE.sub("", stripped)
                base = CAPO_ANY_RE.sub("", base)
                base = re.sub(r"\s{2,}", "  ", base).strip(" -–—")

                if cur is not None and base == cur_base_title:
                    continue  # "(PAGE 2 OF N)" continuation of the same song

                flush()
                title, artist = _af_split_title_artist(base)
                cur = {
                    "title": title,
                    "artist": artist,
                    "capo": capo,
                    "body_lines": [],
                }
                cur_base_title = base
                continue

            if cur is not None and font == "CourierNewPSMT":
                cur["body_lines"].append(text)

    flush()
    return songs


def build_af_records(songs, source: str, fetched_at: str):
    records = []
    used_ids: dict[str, int] = {}
    for s in songs:
        title = s["title"]
        artist = s["artist"] or "Unknown"
        body = "\n".join(s["body_lines"]).strip()

        artist_slug = slugify(artist)
        title_slug = slugify(title)
        base_id = f"{artist_slug}--{title_slug}"
        n = used_ids.get(base_id, 0) + 1
        used_ids[base_id] = n
        song_id = base_id if n == 1 else f"{base_id}-v{n}"

        record = {
            "id": song_id,
            "artist": s["artist"],
            "title": title,
            "album": None,
            "albumOrder": 9999,
            "source": "local",
            "sourceUrl": None,
            "tuning": "standard",
            "tuningRaw": None,
            "capo": s["capo"],
            "key": None,
            "format": detect_format(body),
            "body": body,
            "transcriber": extract_transcriber(body),
            "fetchedAt": fetched_at,
        }
        records.append(record)
    return records


# --------------------------------------------------------------------------
# Record assembly
# --------------------------------------------------------------------------


def build_records(songs, source: str, fetched_at: str):
    records = []
    used_ids: dict[str, int] = {}
    for s in songs:
        title = s["title"]
        version = s["version"]
        if version:
            if title.count("(") > title.count(")"):
                # Source quirk: a handful of titles arrive with an already-open,
                # unclosed parenthetical (e.g. title "Cruiser (Live" + version
                # "Live · Ver 1") — close it instead of nesting a second one,
                # de-duplicating the repeated leading word.
                tail_word = title.rsplit("(", 1)[-1].strip().split()[-1] if "(" in title else ""
                version_words = version.split()
                if version_words and tail_word and version_words[0].lower() == tail_word.lower():
                    rest = " ".join(version_words[1:]).lstrip("· ").strip()
                    title = f"{title} · {rest})" if rest else f"{title})"
                else:
                    title = f"{title} {version})"
            else:
                title = f"{title} ({version})"
        artist = s["artist"] or "Unknown"
        album = s["album"]
        body = "\n".join(s["body_lines"]).strip()
        tuning_raw = s["tuning_raw"]
        capo = s["capo"]

        artist_slug = slugify(artist)
        title_slug = slugify(title)
        base_id = f"{artist_slug}--{title_slug}"
        n = used_ids.get(base_id, 0) + 1
        used_ids[base_id] = n
        song_id = base_id if n == 1 else f"{base_id}-v{n}"

        record = {
            "id": song_id,
            "artist": artist,
            "title": title,
            "album": album,
            "albumOrder": 9999,
            "source": source,
            "sourceUrl": None,
            "tuning": normalize_tuning(tuning_raw),
            "tuningRaw": tuning_raw,
            "capo": capo,
            "key": None,
            "format": detect_format(body),
            "body": body,
            "transcriber": extract_transcriber(body),
            "fetchedAt": fetched_at,
        }
        records.append(record)
    return records


def write_records(records, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    for r in records:
        atomic_write_json(out_dir / f"{r['id']}.json", r)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--book", required=True, choices=["bluebook", "acousticfavorites"])
    ap.add_argument("--pdf", required=True, help="path to the source PDF")
    ap.add_argument("--out", default=None, help="output collection dir under public/corpus/ (defaults to --book)")
    ap.add_argument("--fetched-at", default="2026-06-30")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    out_dir = CORPUS_DIR / (args.out or args.book)

    if args.book == "bluebook":
        songs = extract_bluebook_songs(pdf_path)
        records = build_records(songs, source="bluebook", fetched_at=args.fetched_at)
        write_records(records, out_dir)
        fmt_counts: dict[str, int] = {}
        for r in records:
            fmt_counts[r["format"]] = fmt_counts.get(r["format"], 0) + 1
        print(f"bluebook: wrote {len(records)} songs -> {out_dir}")
        print(f"  formats: {fmt_counts}")
        print(f"  did NOT touch public/corpus/manifest.json")

    elif args.book == "acousticfavorites":
        songs = extract_acoustic_favorites_songs(pdf_path)
        records = build_af_records(songs, source="local", fetched_at=args.fetched_at)
        write_records(records, out_dir)
        no_artist = sum(1 for r in records if r["artist"] is None)
        print(f"acousticfavorites: wrote {len(records)} songs -> {out_dir}")
        print(f"  {no_artist}/{len(records)} have no confidently-parseable artist (left null)")
        print(f"  did NOT touch public/corpus/manifest.json")


if __name__ == "__main__":
    main()
