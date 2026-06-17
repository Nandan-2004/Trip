from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.deps import get_current_user, validate_refresh_cookie
from backend.models import Friendship, RefreshToken, User
from backend.schemas import ChangePasswordRequest, LoginRequest, ProfileUpdateRequest, RegisterRequest, TokenResponse
from backend.security import create_access_token, generate_friend_code, hash_password, hash_token, verify_password
from backend.services.rate_limit import InMemoryRateLimiter


router = APIRouter(prefix="/auth", tags=["auth"])
login_rate_limiter = InMemoryRateLimiter(limit=10, window_seconds=60)


def _csrf_value(refresh_token: str) -> str:
    return refresh_token[:32]


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = User(name=payload.name.strip(), email=payload.email.lower(), password_hash="", friend_code="")
    user.password_hash = hash_password(payload.password)
    for _ in range(20):
        user.friend_code = generate_friend_code()
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
            break
        except IntegrityError:
            db.rollback()
            existing = db.execute(select(User).where(User.email == user.email)).scalar_one_or_none()
            if existing is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    else:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate unique friend code")

    access_token = create_access_token(user.id)
    refresh_raw, expires_at = _issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_raw, expires_at, _csrf_value(refresh_raw))
    return TokenResponse(access_token=access_token, user={"id": user.id, "name": user.name, "email": user.email, "friend_code": user.friend_code})


@router.post("/login", response_model=TokenResponse)
def login(request: Request, payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    ip_key = request.client.host if request.client else "unknown"
    if not login_rate_limiter.allow(f"ip:{ip_key}") or not login_rate_limiter.allow(f"email:{payload.email.lower()}"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")
    user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access_token = create_access_token(user.id)
    refresh_raw, expires_at = _issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_raw, expires_at, _csrf_value(refresh_raw))
    return TokenResponse(access_token=access_token, user={"id": user.id, "name": user.name, "email": user.email, "friend_code": user.friend_code})


@router.post("/refresh")
def refresh_token(response: Response, db: Session = Depends(get_db), refresh_token: str = Depends(validate_refresh_cookie)) -> dict:
    record = db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))).scalar_one_or_none()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if record is None or record.revoked_at is not None or record.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid")
    record.revoked_at = datetime.now(timezone.utc)
    db.commit()
    user = db.execute(select(User).where(User.id == record.user_id)).scalar_one()
    access_token = create_access_token(user.id)
    refresh_raw, expires_at = _issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_raw, expires_at, _csrf_value(refresh_raw))
    return {"access_token": access_token, "user": {"id": user.id, "name": user.name, "email": user.email, "friend_code": user.friend_code}}


@router.post("/logout")
def logout(response: Response, db: Session = Depends(get_db), refresh_token: str = Depends(validate_refresh_cookie)) -> dict:
    record = db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))).scalar_one_or_none()
    if record is not None:
        record.revoked_at = datetime.now(timezone.utc)
        db.commit()
    response.delete_cookie("refresh_token")
    response.delete_cookie("csrf_token")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    friends = db.execute(select(Friendship).where(Friendship.user_id == user.id)).scalars().all()
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "friend_code": user.friend_code,
        "avatar_ref": user.avatar_ref,
        "theme_mode": user.theme_mode,
        "email_notifications_enabled": user.email_notifications_enabled,
        "friends_count": len(friends),
    }


@router.patch("/me")
def update_profile(payload: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    user.name = payload.name.strip()
    if payload.avatar_ref is not None:
        user.avatar_ref = payload.avatar_ref
    if payload.theme_mode is not None:
        user.theme_mode = payload.theme_mode
    if payload.email_notifications_enabled is not None:
        user.email_notifications_enabled = payload.email_notifications_enabled
    db.commit()
    return {"ok": True}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


def _issue_refresh_token(db: Session, user_id: str) -> tuple[str, datetime]:
    from backend.security import generate_secure_token

    raw = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=get_settings().refresh_token_days)
    token_hash = hash_token(raw)
    record = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(record)
    db.commit()
    return raw, expires_at


def _set_refresh_cookie(response: Response, refresh_token: str, expires_at: datetime, csrf_value: str) -> None:
    settings = get_settings()
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=settings.environment == "production", samesite="lax", expires=expires_at)
    response.set_cookie("csrf_token", csrf_value, httponly=False, secure=settings.environment == "production", samesite="lax", expires=expires_at)
