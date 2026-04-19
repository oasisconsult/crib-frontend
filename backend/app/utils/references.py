"""Utilities for generating human-readable reference codes."""
from __future__ import annotations
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession


def build_ref(prefix: str, seq: int, tag: str | None = None) -> str:
    seq_str = f"{seq:04d}"
    return f"{prefix}-{tag}-{seq_str}" if tag else f"{prefix}-{seq_str}"


async def next_seq(db: AsyncSession, model_class, *, year: int | None = None) -> int:
    q = select(func.count(model_class.id))
    if year is not None:
        q = q.where(extract("year", model_class.created_at) == year)
    count = await db.scalar(q) or 0
    return count + 1


async def next_rs_seq(db: AsyncSession, period_tag: str) -> int:
    from app.models.payment import RentSchedule
    q = select(func.count(RentSchedule.id)).where(
        RentSchedule.reference.like(f"RS-{period_tag}-%")
    )
    count = await db.scalar(q) or 0
    return count + 1
