from __future__ import annotations

import json
import time
import zipfile
from pathlib import Path

from sqlalchemy import select

from backend.database import SessionLocal, init_db
from backend.models import Job, JobStatus, JobType, Media
from backend.services.media_processing import process_media
from backend.config import get_settings


def process_job(db, job) -> None:
    settings = get_settings()
    payload = json.loads(job.payload)
    try:
        if job.type == JobType.media_process.value:
            process_media(db, payload["media_id"])
            job.status = JobStatus.completed.value
            job.result = json.dumps({"ok": True})
        elif job.type == JobType.zip_download.value:
            zip_path = settings.storage_path / f"downloads/{job.id}.zip"
            zip_path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for media_id in payload["media_ids"]:
                    media = db.execute(select(Media).where(Media.id == media_id)).scalar_one()
                    file_path = settings.storage_path / media.storage_ref
                    zf.write(file_path, arcname=media.original_filename)
            job.status = JobStatus.completed.value
            job.result = json.dumps({"download_path": f"downloads/{job.id}.zip"})
        elif job.type == "cleanup_group":
            group_id = payload["group_id"]
            group_dir = settings.storage_path / group_id
            import shutil
            if group_dir.exists():
                shutil.rmtree(group_dir, ignore_errors=True)
            from sqlalchemy import delete
            from backend.models import Group
            db.execute(delete(Group).where(Group.id == group_id))
            job.status = JobStatus.completed.value
            job.result = json.dumps({"ok": True})
        else:
            job.status = JobStatus.failed.value
            job.result = json.dumps({"error": "Unsupported job type"})
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.failed.value
        job.result = json.dumps({"error": str(exc)})
    db.commit()


def run_worker() -> None:
    init_db()
    while True:
        with SessionLocal() as db:
            job = db.execute(select(Job).where(Job.status == JobStatus.queued.value).order_by(Job.created_at.asc()).limit(1)).scalar_one_or_none()
            if job is None:
                time.sleep(1)
                continue
            job.status = JobStatus.running.value
            db.commit()
            process_job(db, job)


if __name__ == "__main__":
    run_worker()
