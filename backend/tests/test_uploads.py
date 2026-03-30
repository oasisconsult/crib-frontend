"""
Tests for the upload endpoints.

Coverage:
  POST /upload/presign — returns presigned URL for local provider (dev mode)
  PUT  /upload/local/{key} — local upload writes file
  GET  /upload/local/{key} — local serve returns file
  Auth guard              — unauthenticated requests rejected
  Path traversal guard    — ../.. in key rejected on serve
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_organisation


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org(db_session: AsyncSession):
    return await make_organisation(db_session)


# ── Presign ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_presign_local_provider(client: AsyncClient, org):
    """With provider=local (default in test DB), presign should return a local URL."""
    r = await client.post(
        "/api/v1/upload/presign",
        json={"key": "orgs/test/docs/passport.pdf", "mimeType": "application/pdf"},
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    body = r.json()
    assert "uploadUrl" in body
    assert "publicUrl" in body
    assert body["provider"] == "local"
    assert "local" in body["uploadUrl"]
    assert body["expiresIn"] == 900


@pytest.mark.asyncio
async def test_presign_custom_expires_in(client: AsyncClient, org):
    r = await client.post(
        "/api/v1/upload/presign",
        json={"key": "test/file.jpg", "mimeType": "image/jpeg", "expiresIn": 300},
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    assert r.json()["expiresIn"] == 300


@pytest.mark.asyncio
async def test_presign_expires_in_too_short(client: AsyncClient, org):
    """expires_in below minimum (60) should fail validation."""
    r = await client.post(
        "/api/v1/upload/presign",
        json={"key": "test/file.jpg", "mimeType": "image/jpeg", "expiresIn": 30},
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_presign_requires_auth(client: AsyncClient):
    r = await client.post(
        "/api/v1/upload/presign",
        json={"key": "test/file.jpg", "mimeType": "image/jpeg"},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_presign_tenant_forbidden(client: AsyncClient, org):
    """Tenants may not request presigned URLs — staff only."""
    r = await client.post(
        "/api/v1/upload/presign",
        json={"key": "test/file.jpg", "mimeType": "image/jpeg"},
        headers={"X-Dev-User-Id": "tenant-1"},
    )
    assert r.status_code == 403


# ── Local upload / serve ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_local_upload_and_serve(client: AsyncClient, tmp_path, monkeypatch):
    """PUT to local endpoint writes file; GET serves it back."""
    import app.api.v1.uploads as uploads_module

    # Redirect upload dir to tmp_path so tests don't pollute the working dir
    monkeypatch.setattr(uploads_module, "_UPLOAD_DIR", str(tmp_path))

    key = "orgs/abc/test-upload.txt"
    content = b"hello upload"

    put_r = await client.put(
        f"/api/v1/upload/local/{key}",
        content=content,
        headers={"Content-Type": "text/plain"},
    )
    assert put_r.status_code == 204

    get_r = await client.get(f"/api/v1/upload/local/{key}")
    assert get_r.status_code == 200
    assert get_r.content == content


@pytest.mark.asyncio
async def test_local_serve_not_found(client: AsyncClient):
    r = await client.get("/api/v1/upload/local/nonexistent/file.txt")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_local_serve_path_traversal(client: AsyncClient, tmp_path, monkeypatch):
    """Path traversal attempt should be blocked."""
    import app.api.v1.uploads as uploads_module
    monkeypatch.setattr(uploads_module, "_UPLOAD_DIR", str(tmp_path))

    # Create a file outside the upload dir
    secret = tmp_path.parent / "secret.txt"
    secret.write_text("sensitive")

    r = await client.get("/api/v1/upload/local/../secret.txt")
    # FastAPI normalises paths, but the guard should still prevent escape
    assert r.status_code in (400, 403, 404)
