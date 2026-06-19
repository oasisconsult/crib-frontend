"""
Exchange rate service — fetches UGX/USD rate from Frankfurter (ECB data, no key required)
and persists it in system_settings so the pricing page can display reference USD prices.

The rate is display-only: Crib stores prices natively in both UGX and USD cents.
The rate is used only for the "approx. $X" annotation shown alongside UGX prices.
"""

from __future__ import annotations

import httpx
import structlog
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_setting import SystemSetting

log = structlog.get_logger(__name__)

FRANKFURTER_URL = "https://api.frankfurter.app/latest"
RATE_KEY = "platform.ugx_usd_rate"
UPDATED_KEY = "platform.ugx_usd_rate_updated"
SYSTEM_USER = "exchange_rate_task"


async def refresh_ugx_rate(db: AsyncSession) -> dict:
    """
    Fetch the current USD→UGX rate from Frankfurter and persist it.
    Returns {"rate": float, "updated_at": str, "source": str}.
    Raises on HTTP or parse errors so the Celery task can retry.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(FRANKFURTER_URL, params={"from": "USD", "to": "UGX"})
        resp.raise_for_status()

    data = resp.json()
    rate = data["rates"]["UGX"]
    rate_int = round(rate)
    updated_at = datetime.now(timezone.utc).isoformat()

    from sqlalchemy import select as _select
    result = await db.execute(_select(SystemSetting).where(SystemSetting.key.in_([RATE_KEY, UPDATED_KEY])))
    rows = {r.key: r for r in result.scalars().all()}

    if RATE_KEY in rows:
        rows[RATE_KEY].value = str(rate_int)
        rows[RATE_KEY].updated_by = SYSTEM_USER
        rows[RATE_KEY].updated_at = datetime.now(timezone.utc)
    if UPDATED_KEY in rows:
        rows[UPDATED_KEY].value = updated_at
        rows[UPDATED_KEY].updated_by = SYSTEM_USER
        rows[UPDATED_KEY].updated_at = datetime.now(timezone.utc)

    await db.commit()

    log.info("exchange_rate.refreshed", rate_ugx=rate_int, source="frankfurter")
    return {"rate": rate_int, "updated_at": updated_at, "source": "frankfurter.app"}
