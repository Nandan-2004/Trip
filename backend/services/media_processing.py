from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
from pathlib import Path

import filetype
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models import Media, ProcessingStatus


def inspect_media(path: Path) -> tuple[str, str]:
    kind = filetype.guess(path)
    if kind is None:
        raise ValueError("Unsupported file type")
    mime = kind.mime
    if mime in {"image/jpeg", "image/png", "image/heic", "image/heif"}:
        return "image", mime
    if mime in {"video/mp4", "video/quicktime"}:
        return "video", mime
    raise ValueError("Unsupported file type")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def process_media(db: Session, media_id: str) -> None:
    settings = get_settings()
    media = db.execute(select(Media).where(Media.id == media_id)).scalar_one()
    original_path = settings.storage_path / media.storage_ref
    media_kind, _ = inspect_media(original_path)
    if media_kind == "image":
        image = Image.open(original_path)
        image = ImageOps.exif_transpose(image)
        media.width, media.height = image.size
        thumb_path = original_path.with_name(f"{original_path.stem}.thumb.webp")
        web_path = original_path.with_name(f"{original_path.stem}.web.webp")
        for out_path, target_size in ((thumb_path, (360, 360)), (web_path, (1600, 1600))):
            resized = image.copy()
            resized.thumbnail(target_size)
            resized.save(out_path, format="WEBP", quality=82)
        media.thumbnail_ref = str(thumb_path.relative_to(settings.storage_path))
        media.perceptual_hash = sha256_file(original_path)
    else:
        from PIL import ImageDraw
        media.video_duration_seconds = 12  # default mock duration
        media.perceptual_hash = sha256_file(original_path)
        thumb_path = original_path.with_name(f"{original_path.stem}.thumb.webp")
        thumb_image = Image.new("RGBA", (360, 360), color=(30, 41, 59, 255))
        draw = ImageDraw.Draw(thumb_image)
        draw.polygon([(140, 110), (140, 250), (240, 180)], fill=(226, 232, 240, 255))
        thumb_image.convert("RGB").save(thumb_path, format="WEBP", quality=82)
        media.thumbnail_ref = str(thumb_path.relative_to(settings.storage_path))

    # Duplicate detection within the group
    existing = db.execute(
        select(Media)
        .where(
            Media.group_id == media.group_id,
            Media.perceptual_hash == media.perceptual_hash,
            Media.id != media.id,
            Media.deleted_at.is_(None)
        )
        .limit(1)
    ).scalar_one_or_none()
    if existing is not None:
        media.duplicate_of_id = existing.id

    media.processing_status = ProcessingStatus.ready.value
    db.commit()


def cleanup_media_file(media: Media) -> list[str]:
    settings = get_settings()
    path = settings.storage_path / media.storage_ref
    refs = [media.storage_ref]
    if media.thumbnail_ref:
        refs.append(media.thumbnail_ref)
    if path.exists():
        path.unlink()
    for ref in refs[1:]:
        candidate = settings.storage_path / ref
        if candidate.exists():
            candidate.unlink()
    return refs

