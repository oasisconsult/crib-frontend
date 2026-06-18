"""
Purge test data from production.

Deletes (in FK-safe order):
  notifications, late_fees, payments, rent_schedules,
  maintenance_issues, inspections

Optionally scoped to one organisation (--org-id <uuid>).
Without --org-id it targets ALL organisations — use with care.

Usage inside the container:

  # Dry run (default — shows counts only, changes nothing)
  docker exec crib-backend-1 python scripts/purge_test_data.py

  # Dry run scoped to one org
  docker exec crib-backend-1 python scripts/purge_test_data.py --org-id <uuid>

  # Live delete (requires typing CONFIRM at the prompt)
  docker exec crib-backend-1 python scripts/purge_test_data.py --apply

  # Live delete scoped to one org
  docker exec crib-backend-1 python scripts/purge_test_data.py --org-id <uuid> --apply
"""

from __future__ import annotations

import asyncio
import sys
import uuid as _uuid

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

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
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _org_clause(col: str, alias: str = "") -> str:
    """Return a WHERE clause fragment for org scoping, or empty string."""
    if ORG_ID is None:
        return ""
    prefix = f"{alias}." if alias else ""
    return f" AND {prefix}{col} = '{ORG_ID}'"


async def _count(session: AsyncSession, table: str, org_col: str = "organisation_id") -> int:
    clause = _org_clause(org_col) if ORG_ID else ""
    row = await session.execute(text(f"SELECT COUNT(*) FROM {table} WHERE 1=1{clause}"))
    return row.scalar_one()


async def _delete(session: AsyncSession, table: str, org_col: str = "organisation_id") -> int:
    clause = _org_clause(org_col) if ORG_ID else ""
    result = await session.execute(text(f"DELETE FROM {table} WHERE 1=1{clause}"))
    return result.rowcount


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    scope = f"org {ORG_ID}" if ORG_ID else "ALL organisations"
    mode = "DRY RUN" if DRY_RUN else "LIVE DELETE"

    print()
    print("=" * 60)
    print(f"  Crib — purge_test_data.py")
    print(f"  Mode  : {mode}")
    print(f"  Scope : {scope}")
    print("=" * 60)

    async with AsyncSessionLocal() as session:

        # ── Dry run: count what would be deleted ──────────────────────────────
        print()
        print("Counting records …")
        print()

        counts = {
            "notifications":    await _count(session, "notifications"),
            "late_fees":        await _count(session, "late_fees"),
            "payments":         await _count(session, "payments"),
            "rent_schedules":   await _count(session, "rent_schedules"),
            "maintenance_issues": await _count(session, "maintenance_issues"),
            "inspections":      await _count(session, "inspections"),
        }

        col_w = max(len(k) for k in counts) + 2
        total = 0
        for table, n in counts.items():
            total += n
            marker = "  " if n == 0 else "→ "
            print(f"  {marker}{table:<{col_w}} {n:>6} rows")

        print()
        print(f"  {'TOTAL':<{col_w}} {total:>6} rows")
        print()

        if total == 0:
            print("Nothing to delete. Exiting.")
            return

        if DRY_RUN:
            print("Dry run complete — no changes made.")
            print("Re-run with --apply to perform the actual delete.")
            print()
            return

        # ── Live: require explicit confirmation ───────────────────────────────
        print("─" * 60)
        print("WARNING: This will permanently delete the rows listed above.")
        print("         This action CANNOT be undone.")
        print("─" * 60)
        print()
        answer = input('  Type  CONFIRM  to proceed, or anything else to abort: ').strip()
        if answer != "CONFIRM":
            print()
            print("Aborted — no changes made.")
            return

        print()
        print("Deleting …")
        print()

        # Delete in FK-safe order:
        #   1. notifications       (payment_id → payments SET NULL — safe to go first)
        #   2. late_fees           (rent_schedule_id → rent_schedules CASCADE)
        #   3. payments            (rent_schedule_id SET NULL — delete before rent_schedules)
        #   4. rent_schedules      (no remaining dependants after steps 2+3)
        #   5. maintenance_issues  (inspection_id → inspections SET NULL)
        #   6. inspections         (no remaining dependants after step 5)

        deleted: dict[str, int] = {}

        async with session.begin():
            deleted["notifications"]     = await _delete(session, "notifications")
            deleted["late_fees"]         = await _delete(session, "late_fees")
            deleted["payments"]          = await _delete(session, "payments")
            deleted["rent_schedules"]    = await _delete(session, "rent_schedules")
            deleted["maintenance_issues"] = await _delete(session, "maintenance_issues")
            deleted["inspections"]       = await _delete(session, "inspections")

        # ── Summary ───────────────────────────────────────────────────────────
        print()
        print("=" * 60)
        print("  Done — rows deleted:")
        print()
        grand_total = 0
        for table, n in deleted.items():
            grand_total += n
            marker = "  " if n == 0 else "✓ "
            print(f"  {marker}{table:<{col_w}} {n:>6} rows")
        print()
        print(f"  {'TOTAL':<{col_w}} {grand_total:>6} rows deleted")
        print("=" * 60)
        print()


if __name__ == "__main__":
    asyncio.run(main())
