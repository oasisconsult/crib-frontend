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
from tests.factories import make_organisation, make_tenant, make_tenant_invite


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
        json={"filename": "passport.pdf", "mimeType": "application/pdf", "category": "document"},
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
        json={"filename": "photo.jpg", "mimeType": "image/jpeg", "category": "property_image", "expiresIn": 300},
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    assert r.json()["expiresIn"] == 300


@pytest.mark.asyncio
async def test_presign_expires_in_too_short(client: AsyncClient, org):
    """expires_in below minimum (60) should fail validation."""
    r = await client.post(
        "/api/v1/upload/presign",
        json={"filename": "photo.jpg", "mimeType": "image/jpeg", "category": "property_image", "expiresIn": 30},
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_presign_requires_auth(client: AsyncClient):
    r = await client.post(
        "/api/v1/upload/presign",
        json={"filename": "photo.jpg", "mimeType": "image/jpeg", "category": "document"},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_presign_tenant_forbidden(client: AsyncClient, org):
    """Tenants may not request presigned URLs — staff only."""
    r = await client.post(
        "/api/v1/upload/presign",
        json={"filename": "photo.jpg", "mimeType": "image/jpeg", "category": "document"},
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


# ── Onboarding presign ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org_and_invite(db_session: AsyncSession):
    org = await make_organisation(db_session)
    tenant = await make_tenant(db_session, org)
    invite = await make_tenant_invite(db_session, org, tenant, token="test-token-valid")
    return org, tenant, invite


@pytest.mark.asyncio
async def test_onboarding_presign_valid_token(client: AsyncClient, org_and_invite):
    """Valid invite token returns a presigned URL pointing to /api/upload/local/."""
    r = await client.post(
        "/api/v1/upload/presign/onboarding/test-token-valid",
        json={"filename": "passport.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "uploadUrl" in body
    assert "publicUrl" in body
    assert body["provider"] == "local"
    # URL must be a relative path through the Next.js proxy — not localhost:8000
    assert body["uploadUrl"].startswith("/api/upload/local/")
    assert "localhost:8000" not in body["uploadUrl"]
    assert "localhost:8001" not in body["uploadUrl"]


@pytest.mark.asyncio
async def test_onboarding_presign_signature_category(client: AsyncClient, org_and_invite):
    """Signature uploads are also allowed during onboarding."""
    r = await client.post(
        "/api/v1/upload/presign/onboarding/test-token-valid",
        json={"filename": "sig.png", "mimeType": "image/png", "category": "signature"},
    )
    assert r.status_code == 200
    assert r.json()["provider"] == "local"


@pytest.mark.asyncio
async def test_onboarding_presign_forbidden_category(client: AsyncClient, org_and_invite):
    """property_image is not allowed during onboarding — only document/signature."""
    r = await client.post(
        "/api/v1/upload/presign/onboarding/test-token-valid",
        json={"filename": "photo.jpg", "mimeType": "image/jpeg", "category": "property_image"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_onboarding_presign_invalid_token(client: AsyncClient):
    """Non-existent token returns 404."""
    r = await client.post(
        "/api/v1/upload/presign/onboarding/no-such-token",
        json={"filename": "passport.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_onboarding_presign_expired_token(client: AsyncClient, db_session: AsyncSession):
    """Expired invite token returns 410 Gone."""
    from datetime import datetime, timedelta, timezone

    org = await make_organisation(db_session, logto_org_id=f"org-exp-{__import__('uuid').uuid4().hex[:6]}")
    tenant = await make_tenant(db_session, org)
    past = datetime.now(timezone.utc) - timedelta(days=1)
    await make_tenant_invite(
        db_session, org, tenant,
        token="expired-token-xyz",
        expires_at=past,
    )

    r = await client.post(
        "/api/v1/upload/presign/onboarding/expired-token-xyz",
        json={"filename": "id.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    assert r.status_code == 410


@pytest.mark.asyncio
async def test_onboarding_presign_accepted_invite(client: AsyncClient, db_session: AsyncSession):
    """Already-accepted invite token returns 409 Conflict."""
    from app.models.tenant import InviteStatus

    org = await make_organisation(db_session, logto_org_id=f"org-acc-{__import__('uuid').uuid4().hex[:6]}")
    tenant = await make_tenant(db_session, org)
    await make_tenant_invite(
        db_session, org, tenant,
        token="accepted-token-xyz",
        status=InviteStatus.accepted,
    )

    r = await client.post(
        "/api/v1/upload/presign/onboarding/accepted-token-xyz",
        json={"filename": "id.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    # 200 — accepted status no longer blocks uploads; expiry is the correct gate
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_onboarding_presign_tenant_id_overridden(client: AsyncClient, org_and_invite):
    """The server must use the invite's tenant_id, ignoring any tenantId in the request body."""
    _, tenant, _ = org_and_invite
    r = await client.post(
        "/api/v1/upload/presign/onboarding/test-token-valid",
        json={
            "filename": "passport.pdf",
            "mimeType": "application/pdf",
            "category": "document",
            "tenantId": "attacker-controlled-value",
        },
    )
    assert r.status_code == 200
    # The key in the URL should contain the real tenant ID, not the attacker value
    body = r.json()
    assert str(tenant.id) in body["uploadUrl"]
    assert "attacker-controlled-value" not in body["uploadUrl"]
