from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any
from uuid import uuid4


class ResourceError(ValueError):
    pass


class ResourceStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.font_dir = self.root / "fonts"
        self.background_dir = self.root / "backgrounds"
        self.project_dir = self.root / "projects"
        self.export_dir = self.root / "exports"
        for directory in (self.font_dir, self.background_dir, self.project_dir, self.export_dir):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _read_json(path: Path, fallback: Any) -> Any:
        if not path.exists():
            return fallback
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return fallback

    @staticmethod
    def _write_json(path: Path, value: Any) -> None:
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)

    def list_fonts(self, base_url: str = "http://127.0.0.1:8000") -> list[dict]:
        items = self._read_json(self.font_dir / "index.json", [])
        return [{**item, "fileUrl": f"{base_url}/api/fonts/{item['id']}/file"} for item in items]

    def save_font(self, filename: str, content: bytes, preview_name: str, base_url: str) -> dict:
        extension = Path(filename).suffix.lower()
        if extension not in {".ttf", ".otf"}:
            raise ResourceError("仅支持 TTF 或 OTF 字体")
        if content[:4] not in {b"\x00\x01\x00\x00", b"OTTO", b"true", b"typ1"}:
            raise ResourceError("字体文件签名无效")
        resource_id = f"font-{uuid4().hex}"
        family = f"UserFont_{resource_id.replace('-', '_')}"
        path = self.font_dir / f"{resource_id}{extension}"
        path.write_bytes(content)
        items = self._read_json(self.font_dir / "index.json", [])
        item = {"id": resource_id, "name": Path(filename).stem, "previewName": preview_name.strip()[:80] or Path(filename).stem, "family": family, "kind": "uploaded", "enabled": True, "slot": 30 + len(items) + 1, "filePath": str(path.relative_to(self.root)).replace("\\", "/"), "fileUrl": f"{base_url}/api/fonts/{resource_id}/file", "license": "用户本地上传，应用不再分发"}
        items = [existing for existing in items if existing.get("id") != resource_id] + [item]
        self._write_json(self.font_dir / "index.json", items)
        return item

    def font_path(self, resource_id: str) -> Path:
        item = next((entry for entry in self._read_json(self.font_dir / "index.json", []) if entry.get("id") == resource_id), None)
        if not item:
            raise ResourceError("字体不存在")
        path = (self.root / item["filePath"]).resolve()
        if self.font_dir not in path.parents or not path.exists():
            raise ResourceError("字体文件不可用")
        return path

    def list_backgrounds(self, base_url: str = "http://127.0.0.1:8000") -> list[dict]:
        items = self._read_json(self.background_dir / "index.json", [])
        return [{**item, "fileUrl": f"{base_url}/api/backgrounds/{item['id']}/file"} for item in items]

    def save_background(self, filename: str, content: bytes, base_url: str) -> dict:
        extension = Path(filename).suffix.lower()
        is_png = content.startswith(b"\x89PNG\r\n\x1a\n")
        is_jpeg = content.startswith(b"\xff\xd8\xff")
        if extension not in {".png", ".jpg", ".jpeg"} or not (is_png or is_jpeg):
            raise ResourceError("仅支持有效的 JPG、JPEG 或 PNG 图片")
        resource_id = f"background-{uuid4().hex}"
        path = self.background_dir / f"{resource_id}{'.png' if is_png else '.jpg'}"
        path.write_bytes(content)
        items = self._read_json(self.background_dir / "index.json", [])
        item = {"id": resource_id, "name": Path(filename).stem[:80], "kind": "uploaded", "enabled": True, "baseColor": "#fffefb", "pattern": "solid", "filePath": str(path.relative_to(self.root)).replace("\\", "/"), "fileUrl": f"{base_url}/api/backgrounds/{resource_id}/file"}
        items = [existing for existing in items if existing.get("id") != resource_id] + [item]
        self._write_json(self.background_dir / "index.json", items)
        return item

    def background_path(self, resource_id: str) -> Path:
        item = next((entry for entry in self._read_json(self.background_dir / "index.json", []) if entry.get("id") == resource_id), None)
        if not item:
            raise ResourceError("背景不存在")
        path = (self.root / item["filePath"]).resolve()
        if self.background_dir not in path.parents or not path.exists():
            raise ResourceError("背景文件不可用")
        return path

    def save_project(self, project_id: str, state: dict) -> Path:
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "-", project_id)[:64] or "current"
        path = self.project_dir / f"{safe_id}.json"
        self._write_json(path, state)
        return path

    def load_project(self, project_id: str) -> dict:
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "-", project_id)[:64] or "current"
        path = self.project_dir / f"{safe_id}.json"
        if not path.exists():
            raise ResourceError("项目状态不存在")
        return self._read_json(path, {})

    def save_png_export(self, name: str, content: bytes) -> Path:
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ResourceError("验收图必须是有效 PNG")
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "-", name)[:64] or "preview"
        path = self.export_dir / f"{safe_name}.png"
        path.write_bytes(content)
        return path

    def save_binary_export(self, name: str, content: bytes, extension: str) -> Path:
        extension = extension.lower().lstrip(".")
        signatures = {"png": b"\x89PNG\r\n\x1a\n", "jpg": b"\xff\xd8\xff", "pdf": b"%PDF-"}
        if extension not in signatures or not content.startswith(signatures[extension]):
            raise ResourceError("导出文件签名无效")
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "-", name)[:64] or "export"
        path = self.export_dir / f"{safe_name}.{extension}"
        path.write_bytes(content)
        return path
