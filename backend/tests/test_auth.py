from __future__ import annotations


def test_register_login_refresh_and_logout(client):
    register = client.post("/auth/register", json={"name": "Alice", "email": "alice@example.com", "password": "password123"})
    assert register.status_code == 200
    access_token = register.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"

    login = client.post("/auth/login", json={"email": "alice@example.com", "password": "password123"})
    assert login.status_code == 200
    access_token = login.json()["access_token"]

    refresh = client.post("/auth/refresh", headers={"X-CSRF-Token": client.cookies.get("csrf_token")})
    assert refresh.status_code == 200
    assert "access_token" in refresh.json()

    logout = client.post("/auth/logout", headers={"X-CSRF-Token": client.cookies.get("csrf_token")})
    assert logout.status_code == 200

