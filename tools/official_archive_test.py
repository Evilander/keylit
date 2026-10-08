"""Offline lifecycle regression; no PDF dependencies, server, or corpus writes."""
import unittest
from unittest.mock import patch
try:
    import _ug_official_archive as archive
except ModuleNotFoundError as error:
    if error.name != "_ug_official_archive":
        raise
    archive = None  # Personal, gitignored helper is absent in public/CI checkouts.


@unittest.skipIf(archive is None, "Local-only Official archive helper is not installed")
class ExportRetryTest(unittest.TestCase):
    def test_terminal_failure_releases_identity_for_retry(self):
        data = {"url": "test", "part": "guitar", "images": ["row"]}
        key = (data["url"], data["part"])
        pending = {key: data}
        with patch.object(archive, "make_pdf", side_effect=ValueError("bad image")):
            with self.assertRaisesRegex(ValueError, "bad image"):
                archive.finish_export(data, pending)
        self.assertNotIn(key, pending)
        pending[key] = data
        with patch.object(archive, "make_pdf", return_value={"pages": 1}):
            self.assertEqual(archive.finish_export(data, pending), {"pages": 1})
        self.assertNotIn(key, pending)


if __name__ == "__main__":
    unittest.main()
