from __future__ import annotations

import io
from urllib.parse import urlparse
from fastapi.testclient import TestClient
from PIL import Image

from backend.config import get_settings
from backend.database import SessionLocal
from backend.models import Job, Media, Notification, AlbumShareLink, Favorite
from backend.worker import process_job
from storage.main import app as storage_app


def _image_bytes():
    image = Image.new("RGB", (64, 64), color="blue")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_notifications_read(client):
    user = client.post("/auth/register", json={"name": "User", "email": "n@example.com", "password": "password123"}).json()
    token = user["access_token"]
    user_id = user["user"]["id"]

    # Directly add some notifications
    with SessionLocal() as db:
        db.add(Notification(user_id=user_id, type="friend_request", payload='{"sender_id":"123"}'))
        db.add(Notification(user_id=user_id, type="group_invite", payload='{"group_id":"456"}'))
        db.commit()

    unread = client.get("/notifications/unread-count", headers={"Authorization": f"Bearer {token}"})
    assert unread.json()["count"] == 2

    noti_list = client.get("/notifications", headers={"Authorization": f"Bearer {token}"}).json()
    assert len(noti_list) == 2
    n_id = noti_list[0]["id"]

    # Read one
    read_one = client.post(f"/notifications/{n_id}/read", headers={"Authorization": f"Bearer {token}"})
    assert read_one.status_code == 200

    unread = client.get("/notifications/unread-count", headers={"Authorization": f"Bearer {token}"})
    assert unread.json()["count"] == 1

    # Read all
    read_all = client.post("/notifications/read-all", headers={"Authorization": f"Bearer {token}"})
    assert read_all.status_code == 200

    unread = client.get("/notifications/unread-count", headers={"Authorization": f"Bearer {token}"})
    assert unread.json()["count"] == 0


def test_duplicate_detection_and_resolution(client):
    user = client.post("/auth/register", json={"name": "Uploader", "email": "dup@example.com", "password": "password123"}).json()
    token = user["access_token"]
    group_id = client.post(
        "/groups",
        json={"name": "Trip", "description": "Trip", "trip_date": "2026-06-01"},
        headers={"Authorization": f"Bearer {token}"},
    ).json()["id"]

    # Upload first file
    img_data = _image_bytes()
    init1 = client.post(
        "/media/upload-url",
        json={"group_id": group_id, "filename": "p1.jpg", "content_type": "image/jpeg", "size_bytes": len(img_data)},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    TestClient(storage_app).put(urlparse(init1["upload_url"]).path, data=img_data)
    confirm1 = client.post(
        "/media/confirm",
        json={"storage_ref": init1["storage_ref"], "original_filename": "p1.jpg", "size_bytes": len(img_data)},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    # Upload second file (exact same content)
    init2 = client.post(
        "/media/upload-url",
        json={"group_id": group_id, "filename": "p2.jpg", "content_type": "image/jpeg", "size_bytes": len(img_data)},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    TestClient(storage_app).put(urlparse(init2["upload_url"]).path, data=img_data)
    confirm2 = client.post(
        "/media/confirm",
        json={"storage_ref": init2["storage_ref"], "original_filename": "p2.jpg", "size_bytes": len(img_data)},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    # Run processing jobs
    with SessionLocal() as db:
        jobs = db.query(Job).filter(Job.type == "media_process").all()
        assert len(jobs) == 2
        for job in jobs:
            process_job(db, job)

        media1 = db.query(Media).filter(Media.id == confirm1["id"]).one()
        media2 = db.query(Media).filter(Media.id == confirm2["id"]).one()
        assert media1.perceptual_hash == media2.perceptual_hash
        assert media2.duplicate_of_id == media1.id

    # Test Resolve Duplicate: keep both
    res = client.post(
        f"/media/{confirm2['id']}/resolve-duplicate",
        json={"action": "keep_both"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    with SessionLocal() as db:
        media2 = db.query(Media).filter(Media.id == confirm2["id"]).one()
        assert media2.duplicate_of_id is None


def test_share_links(client):
    user = client.post("/auth/register", json={"name": "Creator", "email": "c@example.com", "password": "password123"}).json()
    token = user["access_token"]
    group_id = client.post(
        "/groups",
        json={"name": "Trip", "description": "Trip", "trip_date": "2026-06-01"},
        headers={"Authorization": f"Bearer {token}"},
    ).json()["id"]

    # Create password protected share link
    share_res = client.post(
        f"/groups/{group_id}/share-links",
        json={"password": "linkpassword", "expires_in_hours": 2},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert share_res.status_code == 200
    share_token = share_res.json()["token"]

    # Attempt to retrieve public page without password -> Should fail
    fail_res = client.get(f"/groups/share-links/{share_token}")
    assert fail_res.status_code == 401

    # Attempt to retrieve with incorrect password -> Should fail
    fail_res2 = client.get(f"/groups/share-links/{share_token}?password=wrong")
    assert fail_res2.status_code == 401

    # Retrieve with correct password -> Should succeed
    success_res = client.get(f"/groups/share-links/{share_token}?password=linkpassword")
    assert success_res.status_code == 200
    data = success_res.json()
    assert data["group"]["name"] == "Trip"
    assert "members" not in data  # No member/admin info exposed
    assert "creator_id" not in data


def test_member_removal_with_media(client):
    admin = client.post("/auth/register", json={"name": "Admin", "email": "a@example.com", "password": "password123"}).json()
    member = client.post("/auth/register", json={"name": "Member", "email": "m@example.com", "password": "password123"}).json()
    admin_token = admin["access_token"]
    member_token = member["access_token"]

    group_id = client.post(
        "/groups",
        json={"name": "Trip", "description": "Trip", "trip_date": "2026-06-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()["id"]

    # Invite and accept
    client.post(f"/groups/{group_id}/invites", json={"friend_code": member["user"]["friend_code"]}, headers={"Authorization": f"Bearer {admin_token}"})
    inbox = client.get("/groups/invites/inbox", headers={"Authorization": f"Bearer {member_token}"}).json()
    client.post(f"/groups/invites/{inbox[0]['id']}/accept", headers={"Authorization": f"Bearer {member_token}"})

    # Upload member file
    img_data = _image_bytes()
    init = client.post(
        "/media/upload-url",
        json={"group_id": group_id, "filename": "mem.jpg", "content_type": "image/jpeg", "size_bytes": len(img_data)},
        headers={"Authorization": f"Bearer {member_token}"},
    ).json()
    TestClient(storage_app).put(urlparse(init["upload_url"]).path, data=img_data)
    confirm = client.post(
        "/media/confirm",
        json={"storage_ref": init["storage_ref"], "original_filename": "mem.jpg", "size_bytes": len(img_data)},
        headers={"Authorization": f"Bearer {member_token}"},
    ).json()

    # Process file
    with SessionLocal() as db:
        job = db.query(Job).filter(Job.type == "media_process").one()
        process_job(db, job)

    # Remove member and keep media = False
    remove_res = client.post(
        f"/groups/{group_id}/members/{member['user']['id']}/remove?keep_media=false",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert remove_res.status_code == 200

    # Check that media has been soft deleted
    with SessionLocal() as db:
        media = db.query(Media).filter(Media.id == confirm["id"]).one()
        assert media.deleted_at is not None
