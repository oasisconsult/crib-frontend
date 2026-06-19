"""Shared fixtures for workflow e2e tests."""
from __future__ import annotations

import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture(autouse=True)
async def professional_plan(db_session: AsyncSession):
    """Upgrade dev org to professional plan for all workflow e2e tests.

    Workflow tests drive gated endpoints (maintenance_workflows, inspection_reports,
    esignature_enabled, etc.). The default free plan would 402 on all of them.
    """
    await db_session.execute(sa.text("""
        INSERT INTO organisation_subscriptions
            (organisation_id, plan_id, status, billing_cycle, currency, current_period_start, auto_renew)
        SELECT o.id, sp.id, 'active', 'none', 'UGX', now(), true
        FROM organisations o, subscription_plans sp
        WHERE o.logto_org_id = 'org_dev' AND sp.slug = 'agency'
        ON CONFLICT (organisation_id) DO UPDATE
            SET plan_id = EXCLUDED.plan_id, status = 'active'
    """))
    await db_session.flush()
