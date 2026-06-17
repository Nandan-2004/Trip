from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user
from backend.models import FriendRequest, FriendRequestStatus, Friendship, Notification, NotificationType, User
from backend.schemas import FriendCodeSearchRequest


router = APIRouter(prefix="/friends", tags=["friends"])


@router.get("/lookup/{friend_code}")
def lookup_friend_code(friend_code: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    if not friend_code.isdigit() or len(friend_code) != 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid friend code")
    target = db.execute(select(User).where(User.friend_code == friend_code)).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend code not found")
    return {"id": target.id, "name": target.name, "friend_code": target.friend_code, "avatar_ref": target.avatar_ref}


@router.post("/requests")
def send_friend_request(payload: FriendCodeSearchRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    target = db.execute(select(User).where(User.friend_code == payload.friend_code)).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend code not found")
    if target.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot friend yourself")
    existing = db.execute(
        select(FriendRequest).where(
            FriendRequest.request_key == ":".join(sorted([user.id, target.id])),
            FriendRequest.status == FriendRequestStatus.pending.value,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Friend request already pending")
    request = FriendRequest(sender_id=user.id, receiver_id=target.id, status=FriendRequestStatus.pending.value)
    db.add(request)
    db.add(Notification(user_id=target.id, type=NotificationType.friend_request.value, payload=f'{{"sender_id":"{user.id}"}}'))
    db.commit()
    return {"ok": True}


@router.get("/requests/inbox")
def inbox(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    requests = db.execute(select(FriendRequest).where(FriendRequest.receiver_id == user.id, FriendRequest.status == FriendRequestStatus.pending.value)).scalars().all()
    return [{"id": item.id, "sender_id": item.sender_id, "created_at": item.created_at} for item in requests]


@router.post("/requests/{request_id}/accept")
def accept_friend_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    request = db.execute(select(FriendRequest).where(FriendRequest.id == request_id, FriendRequest.receiver_id == user.id)).scalar_one_or_none()
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    request.status = FriendRequestStatus.accepted.value
    a, b = sorted([request.sender_id, request.receiver_id])
    db.add(Friendship(user_id=a, friend_id=b))
    db.add(Friendship(user_id=b, friend_id=a))
    db.add(Notification(user_id=request.sender_id, type=NotificationType.friend_request_accepted.value, payload=f'{{"friend_id":"{user.id}"}}'))
    db.commit()
    return {"ok": True}


@router.post("/requests/{request_id}/decline")
def decline_friend_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    request = db.execute(select(FriendRequest).where(FriendRequest.id == request_id, FriendRequest.receiver_id == user.id)).scalar_one_or_none()
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    request.status = FriendRequestStatus.declined.value
    db.commit()
    return {"ok": True}


@router.get("")
def friend_list(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    friends = db.execute(
        select(User).join(Friendship, Friendship.friend_id == User.id).where(Friendship.user_id == user.id)
    ).scalars().all()
    return [{"id": friend.id, "name": friend.name, "friend_code": friend.friend_code, "avatar_ref": friend.avatar_ref} for friend in friends]

