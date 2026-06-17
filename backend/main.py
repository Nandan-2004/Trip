from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.database import init_db
from backend.routers import auth, downloads, favorites, friends, groups, media, notifications


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(friends.router)
    app.include_router(groups.router)
    app.include_router(favorites.router)
    app.include_router(media.router)
    app.include_router(downloads.router)
    app.include_router(notifications.router)

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
