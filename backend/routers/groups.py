from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user, require_group_admin, require_group_member
from backend.models import Group, GroupInvite, GroupMember, GroupMemberRole, JobType, Notification, NotificationType, User, Media, AlbumShareLink
from backend.services.jobs import enqueue_job
from backend.schemas import GroupCreateRequest, GroupInviteRequest, CreateShareLinkRequest
from backend.security import hash_password, verify_password


router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("")
def create_group(payload: GroupCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    group = Group(
        name=payload.name.strip(),
        description=payload.description.strip(),
        trip_date=payload.trip_date,
        cover_image_ref=payload.cover_image_ref,
        creator_id=user.id,
    )
    db.add(group)
    db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user.id, role=GroupMemberRole.admin.value))
    db.commit()
    return {"id": group.id}


@router.get("")
def list_groups(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(
        select(Group, GroupMember.role)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == user.id, Group.deleted_at.is_(None))
        .order_by(Group.created_at.desc())
    ).all()
    return [{"id": group.id, "name": group.name, "description": group.description, "trip_date": group.trip_date, "role": role} for group, role in rows]


@router.get("/{group_id}")
def get_group(group_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_member(group_id, user, db)
    group = db.execute(select(Group).where(Group.id == group_id, Group.deleted_at.is_(None))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    members = db.execute(select(GroupMember).where(GroupMember.group_id == group.id)).scalars().all()
    
    # Calculate storage used and media count
    storage_used = db.execute(select(func.sum(Media.size_bytes)).where(Media.group_id == group.id, Media.deleted_at.is_(None))).scalar() or 0
    media_count = db.execute(select(func.count(Media.id)).where(Media.group_id == group.id, Media.deleted_at.is_(None))).scalar() or 0

    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "trip_date": group.trip_date,
        "cover_image_ref": group.cover_image_ref,
        "members": [{"user_id": m.user_id, "role": m.role} for m in members],
        "media_count": media_count,
        "storage_used": storage_used,
        "storage_quota": 5368709120, # 5 GB
    }


@router.post("/{group_id}/invites")
def invite_member(group_id: str, payload: GroupInviteRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_admin(group_id, user, db)
    target = db.execute(select(User).where(User.friend_code == payload.friend_code)).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend code not found")
    invite = GroupInvite(group_id=group_id, invited_user_id=target.id, inviter_id=user.id)
    db.add(invite)
    db.add(Notification(user_id=target.id, type=NotificationType.group_invite.value, payload=json.dumps({"group_id": group_id})))
    db.commit()
    return {"ok": True}


@router.get("/invites/inbox")
def invite_inbox(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    invites = db.execute(select(GroupInvite).where(GroupInvite.invited_user_id == user.id, GroupInvite.status == "pending")).scalars().all()
    return [{"id": invite.id, "group_id": invite.group_id, "created_at": invite.created_at} for invite in invites]


@router.post("/invites/{invite_id}/accept")
def accept_invite(invite_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    invite = db.execute(select(GroupInvite).where(GroupInvite.id == invite_id, GroupInvite.invited_user_id == user.id)).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    invite.status = "accepted"
    db.add(GroupMember(group_id=invite.group_id, user_id=user.id, role=GroupMemberRole.member.value))
    db.add(Notification(user_id=invite.inviter_id, type=NotificationType.member_joined.value, payload=json.dumps({"group_id": invite.group_id, "user_id": user.id})))
    db.commit()
    return {"ok": True}



@router.post("/{group_id}/members/{member_user_id}/remove")
def remove_member(group_id: str, member_user_id: str, keep_media: bool = True, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_admin(group_id, user, db)
    membership = db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == member_user_id)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    admin_count = db.execute(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group_id, GroupMember.role == GroupMemberRole.admin.value)).scalar_one()
    if membership.role == GroupMemberRole.admin.value and admin_count <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group must keep at least one admin")
    db.delete(membership)
    if not keep_media:
        db.execute(
            update(Media)
            .where(Media.group_id == group_id, Media.uploader_id == member_user_id)
            .values(deleted_at=datetime.now(timezone.utc))
        )
    db.commit()
    return {"ok": True}


@router.post("/{group_id}/admins/transfer")
def transfer_admin(group_id: str, target_user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_admin(group_id, user, db)
    current = db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)).scalar_one()
    target = db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == target_user_id)).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target must be a member")
    current.role = GroupMemberRole.member.value
    target.role = GroupMemberRole.admin.value
    db.commit()
    return {"ok": True}


@router.delete("/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    require_group_admin(group_id, user, db)
    group = db.execute(select(Group).where(Group.id == group_id, Group.deleted_at.is_(None))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    group.deleted_at = datetime.now(timezone.utc)
    enqueue_job(db, JobType.cleanup_group, {"group_id": group_id, "user_id": user.id})
    db.commit()
    return {"ok": True}


@router.post("/{group_id}/share-links")
def create_share_link(
    group_id: str,
    payload: CreateShareLinkRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_group_member(group_id, user, db)
    import secrets
    token = secrets.token_urlsafe(32)
    pwd_hash = hash_password(payload.password) if payload.password else None
    expires_at = None
    if payload.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)
    
    link = AlbumShareLink(
        group_id=group_id,
        token=token,
        password_hash=pwd_hash,
        expires_at=expires_at,
        creator_id=user.id,
    )
    db.add(link)
    db.commit()
    return {"token": token, "expires_at": expires_at}


@router.get("/share-links/{token}")
def get_shared_album(
    token: str,
    password: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    link = db.execute(select(AlbumShareLink).where(AlbumShareLink.token == token)).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")
    
    if link.expires_at is not None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        link_expires = link.expires_at.replace(tzinfo=None) if link.expires_at.tzinfo else link.expires_at
        if link_expires < now:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Share link has expired")
            
    if link.password_hash is not None:
        if password is None or not verify_password(password, link.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password required or incorrect")

    group = db.execute(select(Group).where(Group.id == link.group_id, Group.deleted_at.is_(None))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    # Get media items in this group
    media_items = db.execute(
        select(Media)
        .where(Media.group_id == group.id, Media.deleted_at.is_(None), Media.processing_status == "ready")
        .order_by(Media.uploaded_at.desc())
    ).scalars().all()

    from backend.services.storage_client import build_storage_download_url
    
    items = []
    url_expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
    for item in media_items:
        # Prefer base64 data URIs; fall back to storage service URLs
        if item.thumbnail_base64:
            thumb_url = item.thumbnail_base64
        elif item.thumbnail_ref:
            thumb_url = build_storage_download_url(item.thumbnail_ref, url_expiry)
        else:
            thumb_url = None

        if item.base64_data:
            download_url = item.base64_data
        else:
            download_url = build_storage_download_url(item.storage_ref, url_expiry)

        items.append({
            "id": item.id,
            "original_filename": item.original_filename,
            "media_type": item.media_type,
            "storage_ref": item.storage_ref,
            "thumbnail_ref": item.thumbnail_ref,
            "thumbnail_url": thumb_url,
            "size_bytes": item.size_bytes,
            "uploaded_at": item.uploaded_at,
            "download_url": download_url,
        })

    return {
        "group": {
            "name": group.name,
            "description": group.description,
            "trip_date": group.trip_date,
            "cover_image_ref": group.cover_image_ref,
        },
        "media": items
    }
