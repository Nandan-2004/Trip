# TripShare Deployment Guide

## Architecture Overview

TripShare consists of two deployable components:

1. **Frontend (Static Site)** — A Vite React SPA that can be hosted on **Hostinger** via Git repository
2. **Backend API (Python/FastAPI)** — Must be hosted on a Python-capable platform (Render, Railway, VPS, etc.)

Media is stored as **base64 data URIs** in the SQLite database, so no separate storage service is needed.

---

## 1. Deploy Frontend on Hostinger

### Step 1: Push to GitHub

Ensure your repository is pushed to GitHub:

```bash
git add .
git commit -m "Ready for Hostinger deployment"
git push origin main
```

### Step 2: Connect Hostinger to GitHub

1. Log in to your **Hostinger** control panel
2. Go to **Websites** → **Manage** → **Git** section
3. Click **Create a repository** or **Connect to GitHub**
4. Select your GitHub repository and branch (`main`)

### Step 3: Configure Build Settings

In Hostinger's Git deployment settings:

| Setting | Value |
|---------|-------|
| **Build Command** | `cd web && npm install && npm run build` |
| **Publish Directory** | `web/dist` |

### Step 4: Set Environment Variable

Before building, create a file `web/.env.production` with your backend URL:

```bash
VITE_API_BASE=https://your-backend-api.com
```

Or set it as an environment variable in Hostinger's settings.

### Step 5: Deploy

Push any commit to trigger automatic deployment, or manually deploy from Hostinger's dashboard.

### SPA Routing

The `.htaccess` file in `web/public/` is automatically copied to `web/dist/` during build. It handles SPA routing so all routes serve `index.html`.

---

## 2. Deploy Backend API

The backend needs a Python 3.13+ environment. Options:

### Option A: Render.com (Recommended, Free Tier Available)

1. Connect your GitHub repo to Render
2. Create a new **Web Service**
3. Configure:
   - **Build Command**: `pip install -e .`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Set environment variables:
   ```
   DATABASE_URL=sqlite+pysqlite:///./tripshare.db
   SECRET_KEY=<generate-a-random-secret>
   ALLOWED_ORIGINS=https://your-hostinger-domain.com
   FRONTEND_URL=https://your-hostinger-domain.com
   MAX_UPLOAD_BYTES=5242880
   ```

### Option B: Railway.app

Similar to Render — connect GitHub, set the start command and environment variables.

### Option C: VPS (DigitalOcean, Linode, etc.)

```bash
# On your VPS
git clone <your-repo>
cd Trip
python -m venv .venv
source .venv/bin/activate
pip install -e .

# Create .env file with your settings
cp .env.example .env
# Edit .env with your settings

# Run with uvicorn
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# For production, use gunicorn:
pip install gunicorn
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Background Worker

The background worker processes media (thumbnails, duplicate detection):

```bash
python -m backend.worker
```

Run this as a separate process or use a process manager like `supervisor`.

---

## 3. CORS Configuration

Ensure your backend's `ALLOWED_ORIGINS` includes your Hostinger domain:

```
ALLOWED_ORIGINS=https://your-domain.com,http://localhost:5173
```

---

## 4. Base64 Media Storage

Media files are stored as base64 data URIs directly in the SQLite database:

- **Max file size**: 5MB per file
- **Supported formats**: JPEG, PNG, HEIC, WebP images; MP4, MOV videos
- **Thumbnails**: Auto-generated as WebP base64

This eliminates the need for a separate storage service or file system access on the hosting provider.

### Limitations

- Large images should be resized before uploading
- Video files should be kept small
- Database size will grow with media uploads
- Consider migrating to cloud storage (S3, GCS) for production at scale

---

## 5. Environment Variables Reference

### Backend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLAlchemy database URL | `sqlite+pysqlite:///./tripshare.db` |
| `SECRET_KEY` | JWT signing key (change this!) | `change-me` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `MAX_UPLOAD_BYTES` | Max file upload size in bytes | `5242880` (5MB) |
| `MEDIA_QUOTA_BYTES` | Max storage per group | `5368709120` (5GB) |

### Frontend (web/.env or web/.env.production)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE` | Backend API URL | `http://localhost:8000` |
