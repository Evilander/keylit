# extract_epub_shed.py — pull the readable text out of Shed EPUBs (method and
# reference books) into per-chapter text files the in-app reader can show.
# Scripted extraction, spine order from the OPF, tags stripped, whitespace
# normalized. Chapter lists land in shed/epub_chapters.json for build_shed.
#
#   python tools/extract_epub_shed.py
import json, os, posixpath, re, zipfile
from html.parser import HTMLParser

SHED = r"B:\projects\Claude\keylit\public\corpus\shed"
BOOKS = {
    "country-fingerstyle": r"D:\Books\The Country Fingerstyle Guitar Method - Levi Clay.epub",
    "country-beginners": r"D:\Books\Country Guitar for Beginners - Levi Clay.epub",
    "complete-technique": r"D:\Books\Complete Technique for Modern G - Joseph Alexander.epub",
    "electric-technique": r"D:\Books\The Electric Guitar Technique W - Yiannis Papadopoulos.epub",
    "1001-progressions": r"D:\Books\J. Allen - 1001 Chord Progressions_ An Encyclopedia of Common Chord Progressions in Modern Music.epub",
}

class Text(HTMLParser):
    SKIP = {"script", "style"}
    BLOCK = {"p", "div", "h1", "h2", "h3", "h4", "li", "tr", "br", "section", "blockquote"}
    def __init__(self):
        super().__init__()
        self.parts, self._skip, self.title = [], 0, None
        self._in_title = False
    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self._skip += 1
        if tag in self.BLOCK: self.parts.append("\n")
        if tag in ("h1", "h2") and self.title is None: self._in_title = True
    def handle_endtag(self, tag):
        if tag in self.SKIP: self._skip = max(0, self._skip - 1)
        if tag in ("h1", "h2"): self._in_title = False
    def handle_data(self, data):
        if self._skip: return
        if self._in_title and self.title is None and data.strip():
            self.title = re.sub(r"\s+", " ", data).strip()
        self.parts.append(data)

def chapters_of(epub):
    z = zipfile.ZipFile(epub)
    container = z.read("META-INF/container.xml").decode("utf-8", "replace")
    opf_path = re.search(r'full-path="([^"]+)"', container).group(1)
    opf = z.read(opf_path).decode("utf-8", "replace")
    base = posixpath.dirname(opf_path)
    items = dict(re.findall(r'<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"', opf) +
                 [(m[1], m[0]) for m in re.findall(r'<item[^>]*href="([^"]+)"[^>]*id="([^"]+)"', opf)])
    spine = re.findall(r'<itemref[^>]*idref="([^"]+)"', opf)
    out = []
    for idref in spine:
        href = items.get(idref)
        if not href or not re.search(r"\.x?html?$", href, re.I): continue
        p = posixpath.normpath(posixpath.join(base, href))
        try: html = z.read(p).decode("utf-8", "replace")
        except KeyError: continue
        t = Text(); t.feed(html)
        text = re.sub(r"[ \t]+", " ", "".join(t.parts))
        text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()
        if len(text) < 200: continue  # cover pages, blanks
        out.append((t.title or posixpath.basename(p), text))
    return out

slug = lambda s: re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))[:50] or "chapter"

index = {}
for book_id, epub in BOOKS.items():
    if not os.path.exists(epub):
        print(f"missing: {epub}"); continue
    outdir = os.path.join(SHED, "texts", book_id)
    os.makedirs(outdir, exist_ok=True)
    chapters = []
    for n, (title, text) in enumerate(chapters_of(epub)):
        fname = f"{n:02d}-{slug(title)}.txt"
        with open(os.path.join(outdir, fname), "w", encoding="utf-8") as f:
            f.write(text)
        chapters.append({"name": title, "textFile": f"texts/{book_id}/{fname}"})
    index[book_id] = chapters
    print(f"{book_id}: {len(chapters)} chapters")
with open(os.path.join(SHED, "epub_chapters.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False)
print("chapter index -> shed/epub_chapters.json")
