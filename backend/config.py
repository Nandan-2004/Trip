from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TripShare API"
    environment: str = "development"
    database_url: str = "sqlite:///./tripshare.db"
    secret_key: str = "change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    password_pepper: str = ""
    allowed_origins: str = "http://localhost:5173,http://localhost:5174"
    storage_url: str = "http://localhost:8001"
    storage_root: str = "./storage-data"
    upload_root: str = "uploads"
    download_root: str = "downloads"
    media_quota_bytes: int = 5 * 1024 * 1024 * 1024
    max_upload_bytes: int = 5 * 1024 * 1024  # 5MB limit for base64 uploads
    frontend_url: str = "http://localhost:5173"

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_root)

    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

