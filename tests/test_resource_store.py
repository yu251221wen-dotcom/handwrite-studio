from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.resource_store import ResourceStore


class ResourceStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.store = ResourceStore(Path(self.temporary.name))

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_font_is_saved_and_listed_locally(self) -> None:
        content = b"\x00\x01\x00\x00" + b"font-data"
        item = self.store.save_font("practice.ttf", content, "练习字体", "http://local")
        self.assertTrue(self.store.font_path(item["id"]).exists())
        self.assertEqual(self.store.list_fonts("http://local")[0]["previewName"], "练习字体")

    def test_background_and_project_round_trip(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"image-data"
        background = self.store.save_background("paper.png", png, "http://local")
        self.assertTrue(self.store.background_path(background["id"]).exists())
        state = {"schemaVersion": 1, "lines": [{"id": "line-1"}]}
        self.store.save_project("current", state)
        self.assertEqual(self.store.load_project("current"), state)

    def test_acceptance_png_export_is_local(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"preview"
        path = self.store.save_png_export("A-seed-1001", png)
        self.assertEqual(path.name, "A-seed-1001.png")
        self.assertEqual(path.read_bytes(), png)


if __name__ == "__main__":
    unittest.main()
