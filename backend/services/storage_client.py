from __future__ import annotations

import hashlib
import hmac
import json
import base64
from datetime import datetime, timezone

from backend.config import get_settings


def _token(payload: dict) -> str:
    settings = get_settings()
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(settings.secret_key.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    encoded = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return f"{encoded}.{sig}"


def build_storage_upload_url(path: str, expires_at: datetime, content_type: str, size_bytes: int) -> str:
    settings = get_settings()
    payload = {
        "action": "upload",
        "path": path,
        "exp": expires_at.astimezone(timezone.utc).isoformat(),
        "content_type": content_type,
        "size_bytes": size_bytes,
    }
    return f"{settings.storage_url}/upload/{_token(payload)}"


def build_storage_download_url(path: str, expires_at: datetime) -> str:
    settings = get_settings()
    payload = {
        "action": "download",
        "path": path,
        "exp": expires_at.astimezone(timezone.utc).isoformat(),
    }
    return f"{settings.storage_url}/download/{_token(payload)}"
