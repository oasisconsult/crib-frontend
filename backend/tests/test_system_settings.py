"""
Tests for the system settings endpoints.

Coverage:
  Auth guards    : non-superadmin → 403, superadmin → 200
  List grouped   : all categories present, secrets masked
  Get single     : found, 404
  Update         : plain value stored; secret value encrypted + masked in response
  Encryption     : encrypt/decrypt round-trip, is_encrypted heuristic
  Connection tests: storage/email/sms return success/failure dicts
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_organisation


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    org = await make_organisation(db_session)
    await db_session.flush()
    return {"org": org}


def superadmin_headers() -> dict[str, str]:
    return auth_headers("superadmin-1")


def owner_headers() -> dict[str, str]:
    return auth_headers("owner-1")


# ── Auth guard ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_non_superadmin_blocked(client: AsyncClient, ctx):
    r = await client.get("/api/v1/admin/settings", headers=owner_headers())
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_superadmin_allowed(client: AsyncClient, ctx):
    r = await client.get("/api/v1/admin/settings", headers=superadmin_headers())
    assert r.status_code == 200


# ── List grouped ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_grouped_has_all_categories(client: AsyncClient, ctx):
    r = await client.get("/api/v1/admin/settings", headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    for category in ("storage", "email", "sms", "whatsapp", "platform", "features"):
        assert category in body, f"Missing category: {category}"
        assert isinstance(body[category], list)


@pytest.mark.asyncio
async def test_list_secrets_are_masked(client: AsyncClient, ctx):
    r = await client.get("/api/v1/admin/settings", headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    # Check a known secret field
    storage = body["storage"]
    secret_key = next((s for s in storage if s["key"] == "storage.s3.secretAccessKey"), None)
    if secret_key:
        assert secret_key["value"] == "••••••"
        assert secret_key["isSecret"] is True


@pytest.mark.asyncio
async def test_list_plain_values_not_masked(client: AsyncClient, ctx):
    r = await client.get("/api/v1/admin/settings", headers=superadmin_headers())
    body = r.json()
    platform = body["platform"]
    currency = next((s for s in platform if s["key"] == "platform.default_currency"), None)
    assert currency is not None
    assert currency["value"] == "UGX"
    assert currency["isSecret"] is False


# ── Get single ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_single_setting(client: AsyncClient, ctx):
    r = await client.get(
        "/api/v1/admin/settings/platform.default_currency",
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["key"] == "platform.default_currency"
    assert body["value"] == "UGX"
    assert body["category"] == "platform"
    assert body["isSecret"] is False


@pytest.mark.asyncio
async def test_get_nonexistent_setting_404(client: AsyncClient, ctx):
    r = await client.get(
        "/api/v1/admin/settings/does.not.exist",
        headers=superadmin_headers(),
    )
    assert r.status_code == 404


# ── Update ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_plain_setting(client: AsyncClient, ctx):
    r = await client.put(
        "/api/v1/admin/settings/platform.support_email",
        json={"value": "hello@crib.app"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    assert r.json()["value"] == "hello@crib.app"

    # Verify persisted
    r2 = await client.get(
        "/api/v1/admin/settings/platform.support_email",
        headers=superadmin_headers(),
    )
    assert r2.json()["value"] == "hello@crib.app"


@pytest.mark.asyncio
async def test_update_secret_is_masked_in_response(client: AsyncClient, ctx):
    r = await client.put(
        "/api/v1/admin/settings/email.sendgrid.api_key",
        json={"value": "SG.test-key-value"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    # Response must never reveal the plaintext
    assert body["value"] == "••••••"
    assert body["isSecret"] is True


@pytest.mark.asyncio
async def test_update_nonexistent_setting_404(client: AsyncClient, ctx):
    r = await client.put(
        "/api/v1/admin/settings/does.not.exist",
        json={"value": "something"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 404


# ── Encryption unit tests ──────────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    from app.core.encryption import decrypt, encrypt, is_encrypted

    plaintext = "SG.super-secret-api-key-12345"
    ciphertext = encrypt(plaintext)

    assert is_encrypted(ciphertext)
    assert ciphertext != plaintext
    assert decrypt(ciphertext) == plaintext


def test_is_encrypted_false_for_plain():
    from app.core.encryption import is_encrypted

    assert not is_encrypted("UGX")
    assert not is_encrypted("sendgrid")
    assert not is_encrypted("")


def test_decrypt_invalid_token_raises():
    from app.core.encryption import decrypt

    with pytest.raises(ValueError, match="Failed to decrypt"):
        decrypt("not-a-valid-fernet-token")


# ── Connection test endpoints ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_storage_test_returns_result(client: AsyncClient, ctx):
    """Storage test should return a structured result even if it fails (no real bucket)."""
    r = await client.post("/api/v1/admin/settings/test/storage", headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    assert "success" in body
    assert "provider" in body
    assert "message" in body


@pytest.mark.asyncio
async def test_email_test_returns_result(client: AsyncClient, ctx):
    r = await client.post(
        "/api/v1/admin/settings/test/email",
        json={"recipient": "test@example.com"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert "success" in body
    assert body["channel"] == "email"


@pytest.mark.asyncio
async def test_sms_test_returns_result(client: AsyncClient, ctx):
    r = await client.post(
        "/api/v1/admin/settings/test/sms",
        json={"recipient": "+256700000000"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert "success" in body
    assert body["channel"] == "sms"


# ── Exchange rate — anonymous platform-flags endpoint ──────────────────────────

@pytest.mark.asyncio
async def test_platform_flags_returns_ugx_rate_without_auth(client: AsyncClient):
    """GET /settings/platform-flags must return the UGX rate with no auth token."""
    r = await client.get("/api/v1/settings/platform-flags")
    assert r.status_code == 200
    body = r.json()
    assert "platform.ugx_usd_rate" in body, "ugx rate missing from anonymous flags"
    assert "platform.ugx_usd_rate_updated" in body, "ugx rate_updated missing from anonymous flags"


@pytest.mark.asyncio
async def test_platform_flags_ugx_rate_is_numeric_string(client: AsyncClient):
    """The ugx rate value must be a string representation of a positive integer."""
    r = await client.get("/api/v1/settings/platform-flags")
    assert r.status_code == 200
    rate_str = r.json().get("platform.ugx_usd_rate", "")
    assert rate_str.isdigit() and int(rate_str) > 0, (
        f"Expected positive integer string, got {rate_str!r}"
    )


@pytest.mark.asyncio
async def test_platform_flags_does_not_expose_secrets(client: AsyncClient):
    """Anonymous flags must not leak any secret or non-allowlisted settings."""
    r = await client.get("/api/v1/settings/platform-flags")
    assert r.status_code == 200
    body = r.json()
    for key in body:
        assert not key.startswith("storage."), f"Secret storage key leaked: {key}"
        assert not key.startswith("email."), f"Email config key leaked: {key}"
        assert "password" not in key.lower(), f"Password key leaked: {key}"
        assert "secret" not in key.lower(), f"Secret key leaked: {key}"


# ── Exchange rate — manual refresh endpoint ────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_exchange_rate_requires_superadmin(client: AsyncClient):
    """Non-superadmin must be blocked from the manual refresh endpoint."""
    r = await client.post(
        "/api/v1/admin/settings/refresh-exchange-rate",
        headers=owner_headers(),
    )
    assert r.status_code in (403, 401)


def _make_frankfurter_mock(ugx_rate: float):
    """Build an httpx.AsyncClient mock that returns the given UGX rate.

    httpx.Response.json() and raise_for_status() are synchronous, so the
    response object must be a plain MagicMock, not AsyncMock.
    """
    from unittest.mock import AsyncMock, MagicMock

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"rates": {"UGX": ugx_rate}}
    mock_resp.raise_for_status = MagicMock()

    mock_http = AsyncMock()
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=None)
    mock_http.get = AsyncMock(return_value=mock_resp)
    return mock_http


@pytest.mark.asyncio
async def test_refresh_exchange_rate_superadmin_updates_rate(client: AsyncClient):
    """Superadmin can call the refresh endpoint; it stores and returns the new rate."""
    from unittest.mock import patch

    with patch("app.services.exchange_rate_service.httpx.AsyncClient") as mock_cls:
        mock_cls.return_value = _make_frankfurter_mock(3750.0)
        r = await client.post(
            "/api/v1/admin/settings/refresh-exchange-rate",
            headers=superadmin_headers(),
        )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rate"] == 3750
    assert body["source"] == "frankfurter.app"
    assert "updated_at" in body


@pytest.mark.asyncio
async def test_refresh_exchange_rate_stored_in_platform_flags(client: AsyncClient):
    """After a refresh, the new rate must be visible in the anonymous platform-flags endpoint."""
    from unittest.mock import patch

    with patch("app.services.exchange_rate_service.httpx.AsyncClient") as mock_cls:
        mock_cls.return_value = _make_frankfurter_mock(3810.0)
        await client.post(
            "/api/v1/admin/settings/refresh-exchange-rate",
            headers=superadmin_headers(),
        )

    r = await client.get("/api/v1/settings/platform-flags")
    assert r.status_code == 200
    assert r.json().get("platform.ugx_usd_rate") == "3810"
