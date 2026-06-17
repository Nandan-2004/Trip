from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from backend.config import get_settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    settings = get_settings()
    return pwd_context.hash(password + settings.password_pepper)


def verify_password(password: str, password_hash: str) -> bool:
    settings = get_settings()
    return pwd_context.verify(password + settings.password_pepper, password_hash)


def generate_secure_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def generate_friend_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expires = _now() + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": subject, "exp": expires, "iat": _now()}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(subject: str) -> tuple[str, str, datetime]:
    settings = get_settings()
    raw = generate_secure_token()
    expires = _now() + timedelta(days=settings.refresh_token_days)
    token_hash = hash_token(raw)
    payload = {"sub": subject, "jti": token_hash, "exp": expires, "iat": _now()}
    encoded = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    return raw, encoded, expires


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def secure_compare(a: str, b: str) -> bool:
    return secrets.compare_digest(a, b)


def encode_cursor(dt: datetime, identifier: str) -> str:
    raw = f"{dt.isoformat()}|{identifier}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
    dt_s, identifier = decoded.split("|", 1)
    return datetime.fromisoformat(dt_s), identifier
