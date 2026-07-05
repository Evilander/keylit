# extract_ny_songbook.py — split "The Neil Young PDF Songbook Project" (a
# text-layer PDF, one continuous fan-transcribed chord/tab book) into staging
# chart files + a summaries.json shaped exactly like the vision workflows
# produce, so tools/ingest_songbook.mjs ingests both identically.
#
#   python tools/extract_ny_songbook.py --pdf "D:\Books\Neil Young Songbook.pdf" --staging <dir>
import argparse, json, os, re

import fitz

HEADER = re.compile(r"^(THE NEIL YOUNG PDF SONGBOOK PROJECT|VERSION DATE .*|-\s*\d+\s*-)\s*$")
CAPS = re.compile(r"^[A-Z0-9][A-Z0-9 '&.,!?()/\-#:]+$")
SUBMIT = re.compile(r"^(SUBMITTED BY|2nd VERSION SUBMITTED BY|RIFF BY|CORRECTED BY|TABBED BY)\b[: ]*(.*)", re.I)

ap = argparse.ArgumentParser()
ap.add_argument("--pdf", required=True)
ap.add_argument("--staging", required=True)
args = ap.parse_args()

os.makedirs(args.staging, exist_ok=True)
doc = fitz.open(args.pdf)

def page_lines(i):
    return [l.rstrip() for l in doc[i].get_text().split("\n")]

# A song starts on a page whose first non-header line is an ALL-CAPS title
# followed (within a few lines) by an ALL-CAPS album line and a SUBMITTED-ish
# credit. The TOC pages up front never carry the credit line.
def song_start(i):
    lines = [l for l in page_lines(i) if l.strip() and not HEADER.match(l.strip())]
    if len(lines) < 3:
        return None
    title, album = lines[0].strip(), lines[1].strip()
    if not (CAPS.match(title) and len(title) >= 3 and CAPS.match(album)):
        return None
    if not any(SUBMIT.match(l.strip()) for l in lines[2:10]):
        return None
    return title, album

starts = []
for i in range(doc.page_count):
    s = song_start(i)
    if s:
        starts.append((i, *s))
print(f"song starts: {len(starts)} (first: {starts[0][1] if starts else '-'})")

def title_case(s):
    small = {"a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "at", "by", "my"}
    words = s.lower().split()
    return " ".join(w if (k and w in small) else w.capitalize() for k, w in enumerate(words))

slug = lambda s: re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")))

summaries = []
for n, (page, rawtitle, album) in enumerate(starts):
    end = starts[n + 1][0] if n + 1 < len(starts) else doc.page_count
    body_lines, transcriber = [], None
    for i in range(page, end):
        for l in page_lines(i):
            t = l.strip()
            if HEADER.match(t):
                continue
            m = SUBMIT.match(t)
            if m:
                if transcriber is None and m.group(2):
                    transcriber = re.sub(r"\s*\(.*?\)|<.*?>|\S+@\S+", "", m.group(2)).strip() or None
                continue
            body_lines.append(l)
    # drop the leading title/album repeat from the body
    while body_lines and body_lines[0].strip() in (rawtitle, album):
        body_lines.pop(0)
    title = title_case(rawtitle)
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(body_lines)).strip() + "\n"
    fname = os.path.join(args.staging, f"ny-{n:03d}--{slug(title)}.txt")
    with open(fname, "w", encoding="utf-8") as f:
        f.write(body)
    summaries.append({
        "title": title, "artist": "Neil Young", "album": title_case(album),
        "keySig": None, "chords": [], "confidence": "high",
        "issues": [], "file": fname, "transcriber": transcriber,
        "book": "The Neil Young PDF Songbook Project (2006)", "pages": f"{page + 1}-{end}",
    })

out = os.path.join(args.staging, "ny_summaries.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(summaries, f, ensure_ascii=False)
print(f"{len(summaries)} songs staged -> {args.staging}")
