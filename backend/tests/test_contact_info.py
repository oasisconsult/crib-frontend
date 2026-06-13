"""
Tests for the public contact-info endpoint.

Coverage:
  - returns the configured platform.support_* settings
  - falls back to empty strings when settings are unset (frontend hides that
    contact method rather than showing a broken link)
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import pytest

from app.models.system_setting import SystemSetting

_URL = "/api/v1/public/contact-info"


async def _set(db_session: AsyncSession, key: str, value: str) -> None:
    row = await db_session.scalar(select(SystemSetting).where(SystemSetting.key == key))
    assert row is not None, f"seed setting {key!r} missing — check SYSTEM_SETTING_DEFAULTS"
    row.value = value
    await db_session.flush()


@pytest.mark.asyncio
async def test_returns_configured_contact_details(client: AsyncClient, db_session: AsyncSession):
    await _set(db_session, "platform.support_email", "hello@crib.ug")
    await _set(db_session, "platform.support_phone", "+256700000000")
    await _set(db_session, "platform.support_whatsapp", "256700000000")

    r = await client.get(_URL)
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "supportEmail": "hello@crib.ug",
        "supportPhone": "+256700000000",
        "supportWhatsapp": "256700000000",
    }


@pytest.mark.asyncio
async def test_unset_contact_methods_return_empty_strings(client: AsyncClient, db_session: AsyncSession):
    await _set(db_session, "platform.support_email", "")
    await _set(db_session, "platform.support_phone", "")
    await _set(db_session, "platform.support_whatsapp", "")

    r = await client.get(_URL)
    assert r.status_code == 200
    body = r.json()
    assert body == {"supportEmail": "", "supportPhone": "", "supportWhatsapp": ""}


@pytest.mark.asyncio
async def test_endpoint_requires_no_auth(client: AsyncClient):
    r = await client.get(_URL)
    assert r.status_code == 200
