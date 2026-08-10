from fastapi.testclient import TestClient


def register_and_login(
    client: TestClient, email: str, name: str = "Test User", password: str = "password123"
) -> str:
    """Registers a user and returns their access token, ready to use in an
    Authorization header. Not a fixture — each test needs a different number of
    these with different emails/roles, so it's called directly."""
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    r = client.post("/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
