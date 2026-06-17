from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user
from backend.models import Notification, User


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc())).scalars().all()
    return [{"id": n.id, "type": n.type, "payload": n.payload, "read_at": n.read_at, "created_at": n.created_at} for n in rows]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    count = db.execute(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))).scalars().all()
    return {"count": len(count)}


@router.post("/{notification_id}/read")
def read_notification(notification_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    n = db.execute(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)).scalar_one_or_none()
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def read_all_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()
    return {"ok": True}

