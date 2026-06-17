from __future__ import annotations

import io
from urllib.parse import urlparse

from PIL import Image
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.database import SessionLocal
from backend.main import app
from backend.models import Job, Media
from backend.worker import process_job
from storage.main import app as storage_app


def _image_bytes():
    image = Image.new("RGB", (64, 64), color="red")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_upload_processing_and_zip_generation(client):
    token = client.post("/auth/register", json={"name": "Uploader", "email": "u@example.com", "password": "password123"}).json()["access_token"]
    group = client.post(
        "/groups",
        json={"name": "Trip", "description": "Trip", "trip_date": "2026-06-01"},
        headers={"Authorization": f"Bearer {token}"},
    ).json()["id"]

    init = client.post(
        "/media/upload-url",
        json={"group_id": group, "filename": "photo.jpg", "content_type": "image/jpeg", "size_bytes": len(_image_bytes())},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert init.status_code == 200
    upload_path = urlparse(init.json()["upload_url"]).path
    storage_client = TestClient(storage_app)
    put = storage_client.put(upload_path, data=_image_bytes())
    assert put.status_code == 200

    confirm = client.post(
        "/media/confirm",
        json={"storage_ref": init.json()["storage_ref"], "original_filename": "photo.jpg", "size_bytes": len(_image_bytes())},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert confirm.status_code == 200
    media_id = confirm.json()["id"]

    with SessionLocal() as db:
        job = db.query(Job).filter(Job.type == "media_process").first()
        assert job is not None
        process_job(db, job)
        media = db.query(Media).filter(Media.id == media_id).one()
        assert media.processing_status == "ready"

    download = client.post(f"/downloads/group/{group}", headers={"Authorization": f"Bearer {token}"})
    assert download.status_code == 200
    job_id = download.json()["job_id"]

    with SessionLocal() as db:
        job = db.query(Job).filter(Job.id == job_id).one()
        process_job(db, job)
        assert job.status == "completed"
        assert "download_path" in job.result
