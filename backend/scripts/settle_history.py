"""
Backfill-settle historical rent schedules.

Marks every rent schedule whose period_start falls BEFORE the current
calendar month as fully paid, zeroing out the accumulated overdue balance
from before the purge.  Schedules for the current month and beyond are
left untouched.

RETAINS (not touched):
  - Current-month and future rent schedules
  - Leases, tenants, properties, all configuration

MODIFIES (on --apply):
  - rent_schedules: amount_paid = amount_due, status = 'paid'
    WHERE period_start < first day of current month

Usage inside the container:

  # Dry run — shows per-lease breakdown, changes nothing (default)
  docker exec crib-backend-prod bash -c "PYTHONPATH=/app python /app/scripts/settle_history.py"

  # Dry run up to end of April 2026 (period_start < 2026-05-01)
  docker exec crib-backend-prod bash -c "PYTHONPATH=/app python /app/scripts/settle_history.py --cutoff 2026-05"

  # Dry run scoped to one organisation
  docker exec crib-backend-prod bash -c "PYTHONPATH=/app python /app/scripts/settle_history.py --org-id <uuid>"

  # Live settle up to end of April across all organisations
  docker exec -it crib-backend-prod bash -c "PYTHONPATH=/app python /app/scripts/settle_history.py --cutoff 2026-05 --apply"

  # Live settle scoped to one organisation
  docker exec -it crib-backend-prod bash -c "PYTHONPATH=/app python /app/scripts/settle_history.py --org-id <uuid> --cutoff 2026-05 --apply"
"""

from __future__ import annotations

import asyncio
import sys
import uuid as _uuid
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

# ── CLI args ──────────────────────────────────────────────────────────────────

DRY_RUN = "--apply" not in sys.argv

ORG_ID: _uuid.UUID | None = None
if "--org-id" in sys.argv:
    idx = sys.argv.index("--org-id")
    try:
        ORG_ID = _uuid.UUID(sys.argv[idx + 1])
    except (IndexError, ValueError):
        print("ERROR: --org-id requires a valid UUID argument")
        sys.exit(1)

# ── DB session ────────────────────────────────────────────────────────────────

settings = get_settings()
engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ── Cutoff ────────────────────────────────────────────────────────────────────
# --cutoff YYYY-MM  settle schedules with period_start BEFORE that month
# (default: start of the current calendar month)

today = date.today()
CUTOFF = date(today.year, today.month, 1)

if "--cutoff" in sys.argv:
    idx = sys.argv.index("--cutoff")
    try:
        year, mon = (int(x) for x in sys.argv[idx + 1].split("-"))
        CUTOFF = date(year, mon, 1)
    except (IndexError, ValueError):
        print("ERROR: --cutoff requires a YYYY-MM argument (e.g. --cutoff 2026-05)")
        sys.exit(1)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _org_filter(col: str = "rs.organisation_id") -> str:
    if ORG_ID is None:
        return ""
    return f"AND {col} = '{ORG_ID}'"


async def main() -> None:
    scope = f"org {ORG_ID}" if ORG_ID else "ALL organisations"
    mode  = "DRY RUN" if DRY_RUN else "LIVE SETTLE"

    print()
    print("=" * 68)
    print(f"  Crib — settle_history.py")
    print(f"  Mode   : {mode}")
    print(f"  Scope  : {scope}")
    print(f"  Cutoff : settle schedules with period_start < {CUTOFF}  (before {today.strftime('%B %Y')})")
    print("=" * 68)

    async with AsyncSessionLocal() as session:

        # ── Summary per lease ─────────────────────────────────────────────────
        async with session.begin():
            rows = (await session.execute(text(f"""
                SELECT
                    rs.lease_id,
                    l.reference,
                    t.first_name || ' ' || t.last_name  AS tenant_name,
                    COUNT(*)                             AS schedules,
                    SUM(rs.amount_due)                  AS total_due,
                    l.currency
                FROM rent_schedules rs
                JOIN leases  l ON l.id  = rs.lease_id
                LEFT JOIN tenants t ON t.id = l.tenant_id
                WHERE rs.period_start < :cutoff
                  AND rs.status != 'paid'
                  {_org_filter()}
                GROUP BY rs.lease_id, l.reference, tenant_name, l.currency
                ORDER BY tenant_name
            """), {"cutoff": CUTOFF})).fetchall()

            total_schedules = sum(r.schedules for r in rows)
            total_amount    = sum(float(r.total_due or 0) for r in rows)

        print()
        if not rows:
            print("  No unsettled historical schedules found. Nothing to do.")
            print()
            return

        print(f"  {'Tenant':<30} {'Ref':<14} {'Schedules':>10} {'Amount Due':>16} {'Ccy'}")
        print(f"  {'-'*30} {'-'*14} {'-'*10} {'-'*16} {'-'*6}")
        for r in rows:
            name = (r.tenant_name or "Unknown")[:30]
            ref  = (r.reference  or "—")[:14]
            print(f"  {name:<30} {ref:<14} {r.schedules:>10,} {float(r.total_due or 0):>16,.0f}  {r.currency or ''}")
        print(f"  {'-'*30} {'-'*14} {'-'*10} {'-'*16}")
        print(f"  {'TOTAL':<30} {'':14} {total_schedules:>10,} {total_amount:>16,.0f}")
        print()
        print(f"  These {total_schedules} schedule(s) will be marked status='paid',")
        print(f"  amount_paid = amount_due.")
        print(f"  Schedules for {today.strftime('%B %Y')} onwards remain UNCHANGED.")
        print()

        if DRY_RUN:
            print("─" * 68)
            print("  Dry run complete — no changes made.")
            print("  Re-run with --apply to perform the settlement.")
            print("─" * 68)
            print()
            return

        # ── Confirm ───────────────────────────────────────────────────────────
        print("─" * 68)
        print("  This will mark historical schedules as paid.")
        print("  No payment records are created — this is a balance reset only.")
        print("  Current-month and future schedules are NOT touched.")
        print("─" * 68)
        print()
        answer = input("  Type  CONFIRM  to proceed, or anything else to abort: ").strip()
        if answer != "CONFIRM":
            print()
            print("  Aborted — no changes made.")
            return

        # ── Settle ────────────────────────────────────────────────────────────
        print()
        print("Settling …")
        print()

        async with session.begin():
            result = await session.execute(text(f"""
                UPDATE rent_schedules
                SET    amount_paid = amount_due,
                       status      = 'paid'::rent_schedule_status_enum
                WHERE  period_start < :cutoff
                  AND  status != 'paid'
                  {_org_filter("organisation_id")}
            """), {"cutoff": CUTOFF})
            settled = result.rowcount  # type: ignore[union-attr]

        print(f"  ✓ {settled:,} rent schedule(s) marked as paid")
        print()
        print("=" * 68)
        print(f"  Done.  Historical balance cleared up to {CUTOFF}.")
        print(f"  {today.strftime('%B %Y')} onwards reflects live outstanding rent.")
        print("=" * 68)
        print()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
