from __future__ import annotations


def _register(client, name, email):
    response = client.post("/auth/register", json={"name": name, "email": email, "password": "password123"})
    assert response.status_code == 200
    return response.json()["user"]["friend_code"], response.json()["access_token"]


def test_friend_request_acceptance(client):
    code1, token1 = _register(client, "Alice", "alice@example.com")
    code2, token2 = _register(client, "Bob", "bob@example.com")

    req = client.post("/friends/requests", json={"friend_code": code2}, headers={"Authorization": f"Bearer {token1}"})
    assert req.status_code == 200

    inbox = client.get("/friends/requests/inbox", headers={"Authorization": f"Bearer {token2}"})
    assert inbox.status_code == 200
    request_id = inbox.json()[0]["id"]

    accept = client.post(f"/friends/requests/{request_id}/accept", headers={"Authorization": f"Bearer {token2}"})
    assert accept.status_code == 200

    friends = client.get("/friends", headers={"Authorization": f"Bearer {token1}"})
    assert friends.status_code == 200
    assert friends.json()[0]["friend_code"] == code2

