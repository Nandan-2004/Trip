from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Job, JobStatus, JobType


def enqueue_job(db: Session, job_type: JobType | str, payload: dict, run_after: datetime | None = None) -> Job:
    job = Job(
        type=job_type.value if isinstance(job_type, JobType) else job_type,
        payload=json.dumps(payload),
        run_after=run_after or datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def fetch_next_job(db: Session) -> Job | None:
    now = datetime.now(timezone.utc)
    stmt = (
        select(Job)
        .where(Job.status == JobStatus.queued.value)
        .where(Job.run_after <= now)
        .order_by(Job.created_at.asc())
        .limit(1)
    )
    job = db.execute(stmt).scalar_one_or_none()
    if job:
        job.status = JobStatus.running.value
        job.locked_at = now
        db.commit()
    return job

