# TripShare

TripShare is a private, group-based media-sharing application for friends who traveled together. Each trip becomes a private group; every member uploads their own photos/videos, and the whole group can browse, search, favorite, and download the combined collection — a shared, deduplicated alternative to passing files around individually.

Designed with Google Photos' browsing experience as the north star, scoped to a private trip group, with Dropbox-style sharing and permissions on top.

---

## 1. Architecture

TripShare features a decoupled, scalable, modern stack:

1.  **Frontend (Client)**: A single-page web app built with React, Vite, and glassmorphic CSS. Supports a fully responsive mobile-first UI.
2.  **API Layer (Backend)**: Stateless FastAPI REST API using token-based JWT authentication (short-lived access + rotating refresh token in httpOnly cookie) and resource-level authorization.
3.  **Data Layer (SQLite)**: Relational database with full foreign key constraints and cascade-delete options.
4.  **Storage Service**: A standalone media service that accepts direct uploads and streams downloads using HMAC-signed, scoped, short-lived URLs issued by the backend (never proxying heavy payload files through the main backend).
5.  **Asynchronous Worker**: Background processing queue for thumbnailing, image compression, video poster frame rendering, hash computation, group deletions, and ZIP download compilation.

---

## 2. Environment Configuration

Create a `.env` file in the root `Trip` directory using the settings below:

*   `DATABASE_URL`: Connection string for the database (default: `sqlite:///./tripshare.db`).
*   `SECRET_KEY`: A cryptographically secure key used for signing JWTs and HMAC storage tokens.
*   `ACCESS_TOKEN_MINUTES`: Expiration time for JWT access tokens (default: `15`).
*   `REFRESH_TOKEN_DAYS`: Expiration time for JWT refresh cookies (default: `30`).
*   `PASSWORD_PEPPER`: Optional pepper added to passwords before hashing.
*   `ALLOWED_ORIGINS`: Allowed origins for CORS (default: `http://localhost:5173`).
*   `STORAGE_URL`: Base URL of the storage microservice (default: `http://localhost:8001`).
*   `STORAGE_ROOT`: Storage service file root (default: `./storage-data`).
*   `UPLOAD_ROOT`: Subfolder for uploaded media originals (default: `uploads`).
*   `DOWNLOAD_ROOT`: Subfolder for ZIP export archives (default: `downloads`).
*   `MEDIA_QUOTA_BYTES`: Max bytes permitted per group (default: `5368709120` [5 GB]).
*   `MAX_UPLOAD_BYTES`: Max upload file size allowed (default: `209715200` [200 MB]).

---

## 3. Database Schema

*   **User**: `id`, `name`, `email` (unique), `password_hash`, `friend_code` (unique, 6 digits), `avatar_ref`, `theme_mode` (default system/light/dark), `email_notifications_enabled` (boolean), `created_at`.
*   **FriendRequest**: `id`, `sender_id`, `receiver_id`, `request_key` (sorted pair check), `status` (pending/accepted/declined), `created_at`.
*   **Friendship**: Derived from accepted friend requests. Exposes bidirectional mapping.
*   **Group**: `id`, `name`, `description`, `trip_date`, `cover_image_ref`, `creator_id`, `created_at`, `deleted_at` (soft-delete).
*   **GroupMember**: `id`, `group_id`, `user_id`, `role` (admin/member), `joined_at`.
*   **GroupInvite**: `id`, `group_id`, `invited_user_id`, `inviter_id`, `status` (pending/accepted/declined), `created_at`.
*   **Media**: `id`, `group_id`, `uploader_id`, `original_filename`, `media_type` (image/video), `storage_ref`, `thumbnail_ref`, `processing_status` (processing/ready/failed), `size_bytes`, `width`, `height`, `video_duration_seconds`, `perceptual_hash` (duplicate flagging), `duplicate_of_id` (flagged duplicate reference), `uploaded_at`, `deleted_at`.
*   **Favorite**: `id`, `user_id`, `media_id`, `created_at` (unique per user/media).
*   **Notification**: `id`, `user_id`, `type`, `payload` (JSON metadata), `read_at`, `created_at`.
*   **AlbumShareLink**: `id`, `group_id`, `token` (secure random urlsafe), `password_hash` (optional), `expires_at` (optional), `creator_id`, `created_at`.
*   **RefreshToken**: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`.
*   **Job**: `id`, `type` (media_process/zip_download/cleanup_group), `status` (queued/running/completed/failed), `payload`, `result`, `run_after`, `locked_at`, `created_at`, `updated_at`.

---

## 4. Local Development Setup

### 1. Prerequisite Installations
Ensure Python `3.13` and Node.js are installed.

### 2. Configure Virtual Environment & Packages
```bash
# Setup backend virtual environment
python3 -m venv .venv
.venv/bin/pip install -e .

# Setup frontend dependencies
cd web && npm install
cd ..
```

### 3. Run Services (Four separate terminal windows)
```bash
# Terminal 1: Run main API server
.venv/bin/uvicorn backend.main:app --reload --port 8000

# Terminal 2: Run background job worker
.venv/bin/python -m backend.worker

# Terminal 3: Run local Storage microservice
.venv/bin/uvicorn storage.main:app --reload --port 8001

# Terminal 4: Run Vite Frontend Dev Server
cd web && npm run dev
```

---

## 5. Running Automated Tests

A comprehensive suite of automated tests covers authentication flows, friend requests, role-based group permissions, media uploads, background job queues, duplicate detection, and ZIP archive creation.

To run the automated tests:
```bash
.venv/bin/pytest
```

---

## 6. Resolved Decisions & Extras

*   **Member Removal Media Retention**: When removing a member, the administrator is prompted with a checkbox choices (`keep_media`). Passing `keep_media=false` automatically soft-deletes all media uploaded by the removed user from that group.
*   **Strict Storage Quota**: Per-group storage quotas are strictly enforced at the database and API levels, throwing a `400 Bad Request` if uploading exceeds the remaining bytes. Remaining storage percentages are dynamically rendered in the client interface.
*   **Video Thumbnail Fallbacks**: In environments without system-wide `ffmpeg`/`ffprobe` commands, TripShare generates a premium play button vector using standard PIL layers as a clean, responsive fallback poster frame, preventing any visual gallery breakage.
*   **Opt-In Email Activity Digests**: Users can opt in or out of email notification digests via the profile edit panel.
