"""End-to-end coverage of the task create/update/delete flow through the real
HTTP API, checking that role restrictions are enforced at every step: members
can create and edit tasks, but only the project owner can delete one."""

from fastapi.testclient import TestClient

from helpers import auth_header, register_and_login


def _create_project_and_column(client: TestClient, owner_token: str) -> tuple[int, int]:
    r = client.post("/projects", json={"name": "Flow Project"}, headers=auth_header(owner_token))
    assert r.status_code == 201, r.text
    project_id = r.json()["id"]

    r = client.get(f"/projects/{project_id}", headers=auth_header(owner_token))
    assert r.status_code == 200, r.text
    column_id = r.json()["columns"][0]["id"]  # every new project starts with "To Do" first
    return project_id, column_id


def _invite_and_accept(client: TestClient, owner_token: str, project_id: int, email: str, role: str) -> str:
    r = client.post(
        f"/projects/{project_id}/invite",
        json={"email": email, "role": role},
        headers=auth_header(owner_token),
    )
    assert r.status_code == 201, r.text
    invite_id = r.json()["id"]

    token = register_and_login(client, email, name=email.split("@")[0])
    r = client.patch(f"/invites/{invite_id}/accept", headers=auth_header(token))
    assert r.status_code == 200, r.text
    return token


def test_task_create_update_delete_flow_with_role_restrictions(client: TestClient):
    owner_token = register_and_login(client, "owner@example.com", name="Owner")
    project_id, column_id = _create_project_and_column(client, owner_token)

    member_token = _invite_and_accept(client, owner_token, project_id, "member@example.com", "member")
    viewer_token = _invite_and_accept(client, owner_token, project_id, "viewer@example.com", "viewer")

    # A member can create a task.
    r = client.post(
        "/tasks",
        json={"project_id": project_id, "title": "Write tests", "column_id": column_id},
        headers=auth_header(member_token),
    )
    assert r.status_code == 201, r.text
    task_id = r.json()["id"]

    # A member can edit it.
    r = client.patch(
        f"/tasks/{task_id}",
        json={"title": "Write tests (updated)"},
        headers=auth_header(member_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Write tests (updated)"

    # A viewer cannot create a task.
    r = client.post(
        "/tasks",
        json={"project_id": project_id, "title": "Should be blocked", "column_id": column_id},
        headers=auth_header(viewer_token),
    )
    assert r.status_code == 403, r.text

    # A viewer cannot edit the existing task either.
    r = client.patch(
        f"/tasks/{task_id}",
        json={"title": "Viewer trying to edit"},
        headers=auth_header(viewer_token),
    )
    assert r.status_code == 403, r.text

    # A member cannot delete the task — deletion is owner-only.
    r = client.delete(f"/tasks/{task_id}", headers=auth_header(member_token))
    assert r.status_code == 403, r.text

    # The owner can delete it.
    r = client.delete(f"/tasks/{task_id}", headers=auth_header(owner_token))
    assert r.status_code == 204, r.text

    # And it's actually gone.
    r = client.get(f"/projects/{project_id}/tasks", headers=auth_header(owner_token))
    assert r.status_code == 200, r.text
    assert all(t["id"] != task_id for t in r.json())
