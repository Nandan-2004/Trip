from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select, func, update
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.deps import get_current_user, require_group_member, require_group_admin
from backend.models import Group, GroupMember, Media, MediaType, Notification, NotificationType, ProcessingStatus, User, Favorite
from backend.schemas import MediaCursorResponse, MediaUploadConfirmRequest, MediaUploadInitRequest, ResolveDuplicateRequest
from backend.security import decode_cursor, encode_cursor
from backend.services.jobs import enqueue_job
from backend.services.media_processing import inspect_media
from backend.services.storage_client import build_storage_download_url, build_storage_upload_url


router = APIRouter(prefix="/media", tags=["media"])


@router.post("/upload-url")
def get_upload_url(payload: MediaUploadInitRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_member(payload.group_id, user, db)
    settings = get_settings()
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds upload limit")
    used = db.execute(select(func.coalesce(func.sum(Media.size_bytes), 0)).where(Media.group_id == payload.group_id, Media.deleted_at.is_(None))).scalar_one()
    if used + payload.size_bytes > settings.media_quota_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group storage quota exceeded")
    safe_name = os.path.basename(payload.filename).replace("/", "_").replace("\\", "_")
    storage_ref = f"{payload.group_id}/{datetime.now(timezone.utc).timestamp()}-{safe_name}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    url = build_storage_upload_url(storage_ref, expires_at, payload.content_type, payload.size_bytes)
    return {"upload_url": url, "storage_ref": storage_ref, "expires_at": expires_at}


@router.post("/confirm")
def confirm_upload(payload: MediaUploadConfirmRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    storage_path = get_settings().storage_path / payload.storage_ref
    if not storage_path.exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload not found")
    media_type, _ = inspect_media(storage_path)
    group_id = payload.storage_ref.split("/", 1)[0]
    require_group_member(group_id, user, db)
    media = Media(
        group_id=group_id,
        uploader_id=user.id,
        original_filename=payload.original_filename,
        media_type=media_type,
        storage_ref=payload.storage_ref,
        size_bytes=payload.size_bytes,
        processing_status=ProcessingStatus.processing.value,
    )
    db.add(media)
    db.flush()
    enqueue_job(db, "media_process", {"media_id": media.id})
    members = db.execute(select(GroupMember).where(GroupMember.group_id == group_id)).scalars().all()
    for member in members:
        db.add(Notification(user_id=member.user_id, type=NotificationType.media_uploaded.value, payload=json.dumps({"group_id": group_id, "media_id": media.id})))
    db.commit()
    return {"id": media.id, "processing_status": media.processing_status}


@router.get("/group/{group_id}")
def list_group_media(group_id: str, cursor: str | None = None, limit: int = 50, search: str | None = None, filter_by: str = "all", sort: str = "newest", db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> MediaCursorResponse:
    require_group_member(group_id, user, db)
    query = select(Media).where(Media.group_id == group_id, Media.deleted_at.is_(None))
    if search:
        term = f"%{search.lower()}%"
        uploader_subquery = select(User.id).where(func.lower(User.name).like(term))
        query = query.where(or_(func.lower(Media.original_filename).like(term), Media.uploader_id.in_(uploader_subquery)))
    if filter_by == "photos":
        query = query.where(Media.media_type == MediaType.image.value)
    elif filter_by == "videos":
        query = query.where(Media.media_type == MediaType.video.value)
    elif filter_by == "favorites":
        from backend.models import Favorite

        query = query.join(Favorite, Favorite.media_id == Media.id).where(Favorite.user_id == user.id)
    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
        if sort == "oldest":
            query = query.where(or_(Media.uploaded_at > cursor_dt, and_(Media.uploaded_at == cursor_dt, Media.id > cursor_id)))
        else:
            query = query.where(or_(Media.uploaded_at < cursor_dt, and_(Media.uploaded_at == cursor_dt, Media.id < cursor_id)))
    query = query.order_by(Media.uploaded_at.asc() if sort == "oldest" else Media.uploaded_at.desc(), Media.id.asc() if sort == "oldest" else Media.id.desc()).limit(limit + 1)
    rows = db.execute(query).scalars().all()
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_cursor(last.uploaded_at, last.id)
        rows = rows[:limit]
    items = []
    url_expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
    for item in rows:
        thumb_url = None
        if item.thumbnail_ref:
            thumb_url = build_storage_download_url(item.thumbnail_ref, url_expiry)
        dl_url = build_storage_download_url(item.storage_ref, url_expiry)
        items.append({
            "id": item.id,
            "uploader_id": item.uploader_id,
            "original_filename": item.original_filename,
            "media_type": item.media_type,
            "storage_ref": item.storage_ref,
            "thumbnail_ref": item.thumbnail_ref,
            "thumbnail_url": thumb_url,
            "download_url": dl_url,
            "processing_status": item.processing_status,
            "uploaded_at": item.uploaded_at,
            "size_bytes": item.size_bytes,
        })
    return MediaCursorResponse(items=items, next_cursor=next_cursor)


@router.get("/{media_id}/download-url")
def download_url(media_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    media = db.execute(select(Media).where(Media.id == media_id, Media.deleted_at.is_(None))).scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    require_group_member(media.group_id, user, db)
    url = build_storage_download_url(media.storage_ref, datetime.now(timezone.utc) + timedelta(minutes=10))
    return {"download_url": url}


@router.delete("/{media_id}")
def delete_media(media_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    media = db.execute(select(Media).where(Media.id == media_id, Media.deleted_at.is_(None))).scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    
    is_uploader = media.uploader_id == user.id
    is_admin = False
    try:
        require_group_admin(media.group_id, user, db)
        is_admin = True
    except HTTPException:
        pass

    if not (is_uploader or is_admin):
        require_group_member(media.group_id, user, db)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only uploader or group admin can delete media")

    media.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/{media_id}/resolve-duplicate")
def resolve_duplicate(media_id: str, payload: ResolveDuplicateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    media = db.execute(select(Media).where(Media.id == media_id, Media.deleted_at.is_(None))).scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    require_group_member(media.group_id, user, db)

    is_uploader = media.uploader_id == user.id
    is_admin = False
    try:
        require_group_admin(media.group_id, user, db)
        is_admin = True
    except HTTPException:
        pass

    if not (is_uploader or is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only uploader or group admin can resolve duplicates")

    if payload.action == "keep_both":
        media.duplicate_of_id = None
    elif payload.action == "delete":
        media.deleted_at = datetime.now(timezone.utc)
    elif payload.action == "merge":
        if not payload.keep_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="keep_id required for merge action")
        keep_media = db.execute(select(Media).where(Media.id == payload.keep_id, Media.deleted_at.is_(None))).scalar_one_or_none()
        if keep_media is None or keep_media.group_id != media.group_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Keep media not found or belongs to a different group")

        # Copy favorites from duplicate to keep_media if keep_media is not already favorited by that user
        duplicate_favs = db.execute(select(Favorite).where(Favorite.media_id == media.id)).scalars().all()
        for fav in duplicate_favs:
            exists = db.execute(select(Favorite).where(Favorite.media_id == keep_media.id, Favorite.user_id == fav.user_id)).scalar_one_or_none()
            if not exists:
                db.add(Favorite(user_id=fav.user_id, media_id=keep_media.id))
        
        # Soft delete the duplicate media
        media.deleted_at = datetime.now(timezone.utc)
    
    db.commit()
    return {"ok": True}
