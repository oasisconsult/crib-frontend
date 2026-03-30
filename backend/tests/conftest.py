"""
Pytest fixtures for the Crib backend test suite.

Strategy:
  - Real PostgreSQL via TEST_DATABASE_URL (default: same Postgres, separate DB "crib_test")
  - Redis is mocked with fakeredis so tests don't need a running Redis
  - Auth is bypassed via X-Dev-User-Id header (uses DEV_USERS fixtures)
  - Each test gets a fresh DB transaction that is rolled back on teardown
    (no permanent state between tests)
"""

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.database import get_db
from app.models.base import Base

settings = get_settings()

# Use a separate test database to avoid touching dev data
TEST_DATABASE_URL = settings.database_url.replace(
    f"/{settings.database_url.rsplit('/', 1)[-1]}",
    "/crib_test",
)


# ── Database ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create all tables once per test session, drop them at the end."""
    import sqlalchemy as sa

    engine = create_async_engine(TEST_DATABASE_URL, echo=False, future=True, poolclass=NullPool)

    # Ensure pgcrypto and all enum types are available, then create tables
    async with engine.begin() as conn:
        await conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))

        # Create enum types idempotently (SQLAlchemy won't create them if they exist)
        for stmt in [
            "DO $$ BEGIN CREATE TYPE plan_enum AS ENUM ('starter','growth','enterprise'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE role_enum AS ENUM ('superadmin','owner','manager','tenant','maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE property_type_enum AS ENUM ('flat','house','hostel','commercial','villa'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE property_status_enum AS ENUM ('active','inactive','maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE unit_type_enum AS ENUM ('single','double','studio','ensuite','shared'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE unit_status_enum AS ENUM ('available','occupied','reserved','maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE tenant_status_enum AS ENUM ('active','inactive','blacklisted'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE onboarding_state_enum AS ENUM ('invited','started','submitted','approved','activated','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE id_document_type_enum AS ENUM ('passport','national_id','driving_licence','residence_permit','proof_of_income','reference_letter','bank_statement','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE invite_status_enum AS ENUM ('pending','accepted','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE lease_status_enum AS ENUM ('draft','active','expired','terminated'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE rent_schedule_status_enum AS ENUM ('pending','paid','overdue','waived'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE payment_category_enum AS ENUM ('rent','deposit','late_fee','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE payment_method_enum AS ENUM ('cash','bank_transfer','mobile_money_mtn','mobile_money_airtel','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE payment_status_enum AS ENUM ('pending','confirmed','failed','refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE deposit_status_enum AS ENUM ('held','partially_returned','fully_returned','forfeited'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE inspection_type_enum AS ENUM ('move_in','move_out','routine','maintenance','complaint'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE inspection_state_enum AS ENUM ('scheduled','in_progress','completed','approved','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_reporter_enum AS ENUM ('tenant','landlord','inspector'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_category_enum AS ENUM ('plumbing','electrical','structural','appliance','pest','security','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_priority_enum AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_state_enum AS ENUM ('reported','assigned','in_progress','resolved','closed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE notification_channel_enum AS ENUM ('email','sms','whatsapp','in_app'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE notification_trigger_enum AS ENUM ('rent_due','rent_overdue','lease_expiry','lease_activated','onboarding_invite','document_ready','inspection_scheduled','maintenance_update','payment_confirmed','payment_failed','late_fee_applied','deposit_received','custom'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE notification_state_enum AS ENUM ('queued','sent','delivered','read','failed'); EXCEPTION WHEN duplicate_object THEN null; END $$",
        ]:
            await conn.execute(sa.text(stmt))

        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

        # Create updated_at trigger function (used by models, not in metadata)
        await conn.execute(sa.text("""
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN NEW.updated_at = now(); RETURN NEW; END;
            $$ language 'plpgsql'
        """))

        # Seed system_settings defaults (mirrors the migration bulk_insert)
        from app.models.system_setting import SYSTEM_SETTING_DEFAULTS as _SETTING_DEFAULTS
        for key, value, category, label, description, value_type, is_secret, is_required in _SETTING_DEFAULTS:
            await conn.execute(sa.text(
                "INSERT INTO system_settings "
                "(key, value, category, label, description, value_type, is_secret, is_required) "
                "VALUES (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required) "
                "ON CONFLICT (key) DO NOTHING"
            ), {
                "key": key, "value": value, "category": category, "label": label,
                "description": description, "value_type": value_type,
                "is_secret": is_secret, "is_required": is_required,
            })

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Each test gets its own transaction that is rolled back.
    This keeps tests isolated without recreating the schema.
    Uses AsyncSession directly (not async_sessionmaker) to avoid an implicit
    session.begin() conflicting with the connection-level BEGIN we issue here.
    """
    async with test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False, autoflush=False)
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


# ── Redis mock ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_redis():
    """
    Replace the Redis client with an async mock for all tests.
    Tests that specifically test Redis behaviour can override this fixture.
    """
    import json as _json
    from app.core.security import JWKS_CACHE_KEY

    # Pre-populate an empty JWKS so _fetch_jwks is never called during tests.
    # Malformed tokens will fail jwt.decode() (JWTError → 401) without needing Logto.
    fake_store: dict[str, Any] = {
        JWKS_CACHE_KEY: _json.dumps({"keys": []}),
    }

    async def fake_get(key: str):
        return fake_store.get(key)

    async def fake_setex(key: str, _ttl: int, value: str):
        fake_store[key] = value

    async def fake_ping():
        return True

    mock = AsyncMock()
    mock.get.side_effect = fake_get
    mock.setex.side_effect = fake_setex
    mock.ping.side_effect = fake_ping

    with patch("app.core.redis.get_redis", return_value=mock), \
         patch("app.core.security.get_redis", return_value=mock), \
         patch("app.api.v1.health.get_redis", return_value=mock):
        yield mock


# ── App + HTTP client ─────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client wired to the FastAPI app.

    - DB dependency is overridden to use the test session
    - ENVIRONMENT is forced to 'development' so X-Dev-User-Id works
    """
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def auth_headers(user_id: str = "manager-1") -> dict[str, str]:
    """Return headers that activate the dev-user bypass for the given fixture user."""
    return {"X-Dev-User-Id": user_id}
