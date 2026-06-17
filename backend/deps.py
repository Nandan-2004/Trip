from __future__ import annotations

from collections.abc import Callable

from fastapi import Cookie, Depends, Header, HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.models import GroupMember, RefreshToken, User
from backend.security import decode_token, hash_token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from exc
    user_id = payload.get("sub")
    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_group_member(group_id: str, user: User, db: Session) -> GroupMember:
    membership = db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group membership required")
    return membership


def require_group_admin(group_id: str, user: User, db: Session) -> GroupMember:
    membership = require_group_member(group_id, user, db)
    if membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group admin required")
    return membership


def validate_refresh_cookie(refresh_token: str | None = Cookie(default=None), csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")) -> str:
    if not refresh_token or not csrf_token or csrf_token != refresh_token[:32]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")
    return refresh_token


def get_refresh_record(db: Session, token: str) -> RefreshToken | None:
    return db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token))).scalar_one_or_none()

