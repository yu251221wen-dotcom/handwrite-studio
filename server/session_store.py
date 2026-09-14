from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import shutil
from uuid import uuid4

from server.resource_store import ResourceStore

SESSION_PATTERN = re.compile(r"^[a-f0-9]{32}$")


class InvalidSession(ValueError):
    pass


class SessionStore:
    def __init__(self, root: Path, ttl_hours: int) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl = timedelta(hours=ttl_hours)

    def create(self) -> str:
        session_id = uuid4().hex
        self._directory(session_id).mkdir(parents=True, exist_ok=True)
        self.touch(session_id)
        return session_id

    def validate(self, session_id: str | None) -> str:
        value = (session_id or "").strip().lower()
        if not SESSION_PATTERN.fullmatch(value):
            raise InvalidSession("会话无效，请刷新页面后重试")
        return value

    def resources(self, session_id: str | None) -> ResourceStore:
        value = self.validate(session_id)
        directory = self._directory(value)
        if not directory.exists():
            raise InvalidSession("会话已过期，请刷新页面后重试")
        self.touch(value)
        return ResourceStore(directory)

    def touch(self, session_id: str) -> None:
        marker = self._directory(session_id) / ".active"
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.touch()

    def cleanup_expired(self) -> int:
        cutoff = datetime.now(timezone.utc) - self.ttl
        removed = 0
        for directory in self.root.iterdir():
            if not directory.is_dir() or not SESSION_PATTERN.fullmatch(directory.name):
                continue
            marker = directory / ".active"
            modified = datetime.fromtimestamp((marker if marker.exists() else directory).stat().st_mtime, timezone.utc)
            if modified < cutoff:
                shutil.rmtree(directory)
                removed += 1
        return removed

    def _directory(self, session_id: str) -> Path:
        directory = (self.root / session_id).resolve()
        if directory.parent != self.root:
            raise InvalidSession("会话路径无效")
        return directory
