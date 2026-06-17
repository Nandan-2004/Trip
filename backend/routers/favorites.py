from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user
from backend.models import Favorite, Media, User


router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.post("/{media_id}")
def toggle_favorite(media_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    media = db.execute(select(Media).where(Media.id == media_id, Media.deleted_at.is_(None))).scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    existing = db.execute(select(Favorite).where(Favorite.user_id == user.id, Favorite.media_id == media_id)).scalar_one_or_none()
    if existing is not None:
        db.delete(existing)
        db.commit()
        return {"favorited": False}
    db.add(Favorite(user_id=user.id, media_id=media_id))
    db.commit()
    return {"favorited": True}


@router.get("")
def list_favorites(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(select(Favorite).where(Favorite.user_id == user.id)).scalars().all()
    return [{"media_id": favorite.media_id, "created_at": favorite.created_at} for favorite in rows]

