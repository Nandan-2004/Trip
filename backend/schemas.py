from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


class TokenResponse(BaseModel):
    access_token: str
    user: dict[str, Any]


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    avatar_ref: str | None = None
    theme_mode: str | None = Field(default=None, pattern="^(system|light|dark)$")
    email_notifications_enabled: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class FriendCodeSearchRequest(BaseModel):
    friend_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class GroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2000)
    trip_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    cover_image_ref: str | None = None


class GroupInviteRequest(BaseModel):
    friend_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class MediaUploadInitRequest(BaseModel):
    group_id: str
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=100)
    size_bytes: int = Field(gt=0)


class MediaUploadConfirmRequest(BaseModel):
    storage_ref: str
    original_filename: str
    size_bytes: int


class MediaCursorResponse(BaseModel):
    items: list[dict[str, Any]]
    next_cursor: str | None = None


class DownloadSelectionRequest(BaseModel):
    media_ids: list[str] = Field(min_length=1)


class NotificationUpdateRequest(BaseModel):
    read: bool = True


class ResolveDuplicateRequest(BaseModel):
    action: str = Field(pattern="^(keep_both|merge|delete)$")
    keep_id: str | None = None


class CreateShareLinkRequest(BaseModel):
    password: str | None = Field(default=None, min_length=1)
    expires_in_hours: int | None = Field(default=None, gt=0)

