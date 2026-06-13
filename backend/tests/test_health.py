"""Tests for GET /health and GET /health/ready."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_liveness(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body


@pytest.mark.asyncio
async def test_readiness_ok(client: AsyncClient):
    """Readiness should pass when DB is reachable (test engine) and Redis mock pings."""
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"] == "ok"


@pytest.mark.asyncio
async def test_readiness_redis_down(client: AsyncClient, mock_redis):
    """Readiness returns 503 when Redis is unreachable."""
    mock_redis.ping.side_effect = ConnectionError("refused")
    resp = await client.get("/health/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert "redis" in body["detail"]["checks"]
    assert body["detail"]["checks"]["redis"].startswith("error:")
