from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


def _origins(value: str) -> tuple[str, ...]:
    return tuple(origin.strip().rstrip("/") for origin in value.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    environment: str
    allowed_origins: tuple[str, ...]
    upload_dir: Path
    temp_file_ttl_hours: int
    max_upload_size_mb: int

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


def load_settings() -> Settings:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    default_origins = "http://localhost:5173,http://127.0.0.1:5173" if environment != "production" else ""
    allowed_origins = _origins(os.getenv("ALLOWED_ORIGINS", default_origins))
    if environment == "production" and (not allowed_origins or any("*" in origin or not origin.startswith("https://") for origin in allowed_origins)):
        raise RuntimeError("生产环境必须配置 ALLOWED_ORIGINS")
    project_root = Path(__file__).resolve().parent.parent
    upload_dir = Path(os.getenv("UPLOAD_DIR", str(project_root / "data" / "sessions"))).expanduser().resolve()
    return Settings(
        environment=environment, allowed_origins=allowed_origins, upload_dir=upload_dir,
        temp_file_ttl_hours=max(1, int(os.getenv("TEMP_FILE_TTL_HOURS", "24"))),
        max_upload_size_mb=max(1, int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))),
    )


settings = load_settings()
