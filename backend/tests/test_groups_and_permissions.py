from __future__ import annotations


def test_group_permissions(client):
    admin = client.post("/auth/register", json={"name": "Admin", "email": "admin@example.com", "password": "password123"}).json()
    member = client.post("/auth/register", json={"name": "Member", "email": "member@example.com", "password": "password123"}).json()
    admin_token = admin["access_token"]
    member_token = member["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Trip", "description": "Beach weekend", "trip_date": "2026-06-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert group.status_code == 200
    group_id = group.json()["id"]

    invite = client.post(
        f"/groups/{group_id}/invites",
        json={"friend_code": member["user"]["friend_code"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert invite.status_code == 200

    inbox = client.get("/groups/invites/inbox", headers={"Authorization": f"Bearer {member_token}"})
    assert inbox.status_code == 200
    invite_id = inbox.json()[0]["id"]

    accept = client.post(f"/groups/invites/{invite_id}/accept", headers={"Authorization": f"Bearer {member_token}"})
    assert accept.status_code == 200

    forbidden = client.post(
        f"/groups/{group_id}/members/{member['user']['id']}/remove",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert forbidden.status_code == 403

    allowed = client.post(
        f"/groups/{group_id}/members/{member['user']['id']}/remove",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert allowed.status_code == 200

