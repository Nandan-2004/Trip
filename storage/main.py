from __future__ import annotations

import hashlib
import hmac
import json
import base64
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.config import get_settings


def _parse_token(token: str) -> dict:
    if "." not in token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    raw_payload, sig = token.rsplit(".", 1)
    padding = "=" * (-len(raw_payload) % 4)
    payload_json = base64.urlsafe_b64decode((raw_payload + padding).encode("ascii")).decode("utf-8")
    settings = get_settings()
    expected = hmac.new(settings.secret_key.encode("utf-8"), payload_json.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token signature")
    payload = json.loads(payload_json)
    if datetime.now(timezone.utc) > datetime.fromisoformat(payload["exp"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token expired")
    return payload


app = FastAPI(title="TripShare Storage")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.put("/upload/{token}")
async def upload_file(token: str, request: Request) -> dict:
    payload = _parse_token(token)
    if payload["action"] != "upload":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong action")
    body = await request.body()
    if len(body) != payload["size_bytes"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Size mismatch")
    root = get_settings().storage_path
    file_path = root / payload["path"]
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(body)
    return {"ok": True, "path": payload["path"]}


@app.get("/download/{token}")
def download_file(token: str) -> FileResponse:
    payload = _parse_token(token)
    if payload["action"] != "download":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong action")
    file_path = get_settings().storage_path / payload["path"]
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(file_path)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
