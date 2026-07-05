# songbook_pdf.py — shared PDF plumbing for songbook translation:
#   render:  pages -> PNGs for the vision agents
#   map:     PDF outline/TOC -> per-song page ranges (when the TOC is song-level)
#
#   python tools/songbook_pdf.py render --pdf <file> --out <dir> [--dpi 150] [--from N --to N]
#   python tools/songbook_pdf.py map    --pdf <file> --out <worklist.json> --artist "Name"
#           [--skip-titles "Cover,Contents,..."] [--min-page 1] [--strip-prefix]
#
# Windows note: all file writes are utf-8 by choice, never cp1252.
import argparse, json, os, re, sys

import fitz  # PyMuPDF


def render(args):
    doc = fitz.open(args.pdf)
    os.makedirs(args.out, exist_ok=True)
    lo = max(1, args.frm or 1)
    hi = min(doc.page_count, args.to or doc.page_count)
    mat = fitz.Matrix(args.dpi / 72, args.dpi / 72)
    n = 0
    for i in range(lo - 1, hi):
        out = os.path.join(args.out, f"{i + 1:04d}.png")
        if os.path.exists(out) and not args.force:
            continue
        doc[i].get_pixmap(matrix=mat).save(out)
        n += 1
    print(f"rendered {n} pages ({lo}-{hi}) -> {args.out}")


JUNK = re.compile(
    r"^(cover|front|back|front\s*cover|back\s*cover|contents?|index|introduction|"
    r"discography|credits|copyright|title\s*page|blank|notes?|preface|foreword|"
    r"from the editor.*|.*songbook.*|tab(lature)? (guide|legend).*|guitar notation.*|"
    r"page \d+|\d+|img\d+.*|0?1|0?2)$",
    re.I,
)


def clean_title(t, strip_prefix):
    t = re.sub(r"\.(pdf|gif|jpe?g|png)$", "", t.strip(), flags=re.I)
    if strip_prefix:
        t = re.sub(r"^\d+[\s.\-]+", "", t)          # "05 - Angeles" -> "Angeles"
    t = re.sub(r"\(\d+\)$", "", t).strip()          # "Song(3)" -> "Song"
    # CamelCase page-label names ("AllTheRightFriends") -> spaced words
    if re.fullmatch(r"[A-Za-z0-9'&!.]+", t) and re.search(r"[a-z][A-Z]", t):
        t = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def build_map(args):
    doc = fitz.open(args.pdf)
    toc = doc.get_toc()
    skip = {s.strip().lower() for s in (args.skip_titles or "").split(",") if s.strip()}
    # keep only level-1 entries that look like songs
    entries = []
    for lvl, title, page in toc:
        if lvl != 1 or page < (args.min_page or 1):
            continue
        t = clean_title(title, args.strip_prefix)
        if not t or JUNK.match(t) or t.lower() in skip:
            continue
        entries.append((t, page))
    # consecutive duplicate titles (per-page labels like "Song(1)…(4)") collapse
    songs = []
    for t, page in entries:
        if songs and songs[-1]["title"].lower() == t.lower():
            continue
        songs.append({"title": t, "page": page})
    # page ranges: song runs to the page before the next song
    out = []
    for i, s in enumerate(songs):
        end = songs[i + 1]["page"] - 1 if i + 1 < len(songs) else doc.page_count
        end = max(s["page"], min(end, s["page"] + (args.max_pages or 14) - 1))
        out.append({
            "artist": args.artist,
            "title": s["title"],
            "pages": list(range(s["page"], end + 1)),
        })
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"{len(out)} songs -> {args.out}")
    for s in out[:6]:
        print(f"   p{s['pages'][0]:4}-{s['pages'][-1]:<4} {s['title']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("--pdf", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--dpi", type=int, default=150)
    r.add_argument("--from", dest="frm", type=int, default=None)
    r.add_argument("--to", type=int, default=None)
    r.add_argument("--force", action="store_true")
    m = sub.add_parser("map")
    m.add_argument("--pdf", required=True)
    m.add_argument("--out", required=True)
    m.add_argument("--artist", required=True)
    m.add_argument("--skip-titles", default="")
    m.add_argument("--min-page", type=int, default=1)
    m.add_argument("--max-pages", type=int, default=14)
    m.add_argument("--strip-prefix", action="store_true")
    args = ap.parse_args()
    {"render": render, "map": build_map}[args.cmd](args)
