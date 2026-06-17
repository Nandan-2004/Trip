from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.deps import get_current_user, require_group_member
from backend.models import Group, JobType, Media, User
from backend.schemas import DownloadSelectionRequest
from backend.services.jobs import enqueue_job


router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.post("/selected")
def download_selected(payload: DownloadSelectionRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    media_rows = db.execute(select(Media).where(Media.id.in_(payload.media_ids), Media.deleted_at.is_(None))).scalars().all()
    if not media_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No media found")
    for item in media_rows:
        require_group_member(item.group_id, user, db)
    job = enqueue_job(db, JobType.zip_download, {"media_ids": payload.media_ids, "user_id": user.id})
    return {"job_id": job.id}


@router.post("/group/{group_id}")
def download_group(group_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_member(group_id, user, db)
    media_ids = db.execute(select(Media.id).where(Media.group_id == group_id, Media.deleted_at.is_(None))).scalars().all()
    job = enqueue_job(db, JobType.zip_download, {"media_ids": media_ids, "user_id": user.id, "group_id": group_id})
    return {"job_id": job.id}


@router.get("/jobs/{job_id}")
def job_status(job_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    from backend.models import Job

    job = db.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    payload = json.loads(job.payload)
    if payload.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your job")
    return {"id": job.id, "status": job.status, "result": job.result}
