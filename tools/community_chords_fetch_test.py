import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

import community_chords_fetch as fetcher


class CommunityChartsTest(unittest.TestCase):
    def test_chart_extraction_keeps_alignment_and_sections(self):
        soup = BeautifulSoup('<pre class="tab-container chord-text"><span class="section-badge">Verse</span>\n<span class="chord" data-chord="Cmaj7">C</span>    <span class="chord" data-chord="G/B">G</span>\nAn authored test line</pre>', "html.parser")
        self.assertEqual(fetcher.gte_body(soup), "[Verse]\nCmaj7    G/B\nAn authored test line")

    def test_setup_badges_stay_metadata(self):
        soup = BeautifulSoup('<pre class="tab-container chord-text"><span class="section-badge">Tuning:</span> DADGBE\n<span class="section-badge">Capo</span> 2\n<span class="section-badge">Verse</span>\n<span class="chord" data-chord="D">D</span></pre>', "html.parser")
        self.assertEqual(fetcher.gte_body(soup), "Tuning: DADGBE\nCapo: 2\n[Verse]\nD")

    def test_save_never_overwrites_a_distinct_arrangement(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(fetcher, "CORPUS", Path(directory)), contextlib.redirect_stdout(io.StringIO()):
            first = fetcher.make_record("Artist", "Song", "guitartabsexplorer", "https://example.com/a", "C G Am F")
            second = fetcher.make_record("Artist", "Song", "guitartabsexplorer", "https://example.com/b", "D A Bm G", 2)
            self.assertTrue(fetcher.save_record(first, False))
            self.assertFalse(fetcher.save_record(first, False))
            self.assertTrue(fetcher.save_record(second, False))
            self.assertFalse(fetcher.save_record(second, False))
            charts = [json.loads(p.read_text("utf-8")) for p in (Path(directory) / "guitartabsexplorer").glob("*.json")]
            self.assertEqual(len(charts), 2)
            self.assertEqual({s["body"] for s in charts}, {"C G Am F", "D A Bm G"})
            self.assertEqual({s["capo"] for s in charts}, {None, 2})

    def test_dry_run_does_not_create_directories(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(fetcher, "CORPUS", Path(directory) / "absent"), contextlib.redirect_stdout(io.StringIO()):
            song = fetcher.make_record("Artist", "Song", "guitartabsexplorer", "https://example.com/a", "C G Am F")
            self.assertTrue(fetcher.save_record(song, True))
            self.assertFalse(fetcher.CORPUS.exists())


if __name__ == "__main__":
    unittest.main()
