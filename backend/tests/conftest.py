"""
Pytest fixtures for the Crib backend test suite.

Strategy:
  - Real PostgreSQL via TEST_DATABASE_URL (default: same Postgres, separate DB "crib_test")
  - Redis is mocked with fakeredis so tests don't need a running Redis
  - Auth is bypassed via X-Dev-User-Id header (uses DEV_USERS fixtures)
  - Each test gets a fresh DB transaction that is rolled back on teardown
    (no permanent state between tests)
"""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_db
from app.models.base import Base

settings = get_settings()

# Use a separate test database to avoid touching dev data
TEST_DATABASE_URL = settings.database_url.replace(
    f"/{settings.database_url.rsplit('/', 1)[-1]}",
    "/crib_test",
)


# ── Event loop ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()


# ── Database ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create all tables once per test session, drop them at the end."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False, future=True)

    # Ensure pgcrypto is available before creating tables
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        )
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Each test gets its own transaction that is rolled back.
    This keeps tests isolated without recreating the schema.
    """
    async with test_engine.connect() as conn:
        await conn.begin()
        session_factory = async_sessionmaker(
            bind=conn, class_=AsyncSession, expire_on_commit=False, autoflush=False
        )
        async with session_factory() as session:
            yield session
        await conn.rollback()


# ── Redis mock ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_redis():
    """
    Replace the Redis client with an async mock for all tests.
    Tests that specifically test Redis behaviour can override this fixture.
    """
    fake_store: dict[str, Any] = {}

    async def fake_get(key: str):
        return fake_store.get(key)

    async def fake_setex(key: str, ttl: int, value: str):
        fake_store[key] = value

    async def fake_ping():
        return True

    mock = AsyncMock()
    mock.get.side_effect = fake_get
    mock.setex.side_effect = fake_setex
    mock.ping.side_effect = fake_ping

    with patch("app.core.redis.get_redis", return_value=mock), \
         patch("app.core.security.get_redis", return_value=mock):
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
