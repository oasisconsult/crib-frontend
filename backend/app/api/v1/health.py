"""
Health check endpoints.

GET /health        — liveness probe (always 200 if the process is up)
GET /health/ready  — readiness probe (checks DB + Redis connectivity)
"""

import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health")
async def liveness() -> dict:
    return {
        "status": "ok",
        "uptime_seconds": round(time.time() - _start_time),
    }


@router.get("/health/ready")
async def readiness(db: AsyncSession = Depends(get_db)) -> dict:
    checks: dict[str, str] = {}

    # Database
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    # Redis
    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    all_ok = all(v == "ok" for v in checks.values())
    if not all_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "degraded", "checks": checks},
        )

    return {"status": "ready", "checks": checks}
