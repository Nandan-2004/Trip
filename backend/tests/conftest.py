from __future__ import annotations

import os
import shutil
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("STORAGE_URL", "http://storage.local")
os.environ.setdefault("STORAGE_ROOT", "/tmp/tripshare-test-storage")

from fastapi.testclient import TestClient
import pytest

from backend.config import get_settings
from backend.database import Base, engine, init_db
from backend.main import app


@pytest.fixture(autouse=True)
def reset_state():
    get_settings.cache_clear()
    Base.metadata.drop_all(bind=engine)
    init_db()
    storage_root = Path(get_settings().storage_path)
    shutil.rmtree(storage_root, ignore_errors=True)
    storage_root.mkdir(parents=True, exist_ok=True)
    yield
    shutil.rmtree(storage_root, ignore_errors=True)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)

