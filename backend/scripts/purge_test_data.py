"""
Purge transactional/operational test data from production.

RETAINS (untouched):
  organisations, profiles, properties, units, tenants, tenant_invites,
  tenant_documents, leases, tenancy_agreements, landlord_invites,
  landlord_property_access, agency_invites, caretaker_invites, contractors,
  system_settings, subscription_plans, organisation_subscriptions,
  notification_templates, email_templates, organisation_efris_configs,
  roles, resources, permissions, role_permissions

DELETES (transactional / operational data):
  efris_audit_log, notifications, wallet_transactions, mobile_money_transactions,
  payment_allocations, late_fees, deposits, payments, rent_schedules,
  ledger_entries, tenant_wallets, utility_readings, messages,
  maintenance_issues, inspections, tenant_screenings, announcements

Usage inside the container:

  # Dry run — shows row counts only, changes nothing (default)
  docker exec crib-backend-1 python scripts/purge_test_data.py

  # Dry run scoped to one organisation
  docker exec crib-backend-1 python scripts/purge_test_data.py --org-id <uuid>

  # Live delete across all organisations (requires typing CONFIRM)
  docker exec -it crib-backend-1 python scripts/purge_test_data.py --apply

  # Live delete scoped to one organisation
  docker exec -it crib-backend-1 python scripts/purge_test_data.py --org-id <uuid> --apply
"""

from __future__ import annotations

import asyncio
import sys
import uuid as _uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

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


# ── Tables to purge — in FK-safe delete order ─────────────────────────────────
#
# Rule: children before parents; SET NULL references can go in any order
# relative to their parent, but CASCADE children must go first.
#
#  efris_audit_log       — payment_id SET NULL (safe first)
#  notifications         — payment_id SET NULL (safe first)
#  wallet_transactions   — no FK to other purge tables
#  mobile_money_transactions — no FK to other purge tables
#  payment_allocations   — payment_id + rent_schedule_id (must go before both)
#  late_fees             — rent_schedule_id CASCADE (before rent_schedules)
#  deposits              — move_out_inspection_id SET NULL, lease_id CASCADE
#  payments              — rent_schedule_id SET NULL (before rent_schedules safe)
#  rent_schedules        — lease_id CASCADE (lease kept; just clears schedules)
#  ledger_entries        — lease_id (no cascade constraint; safe after payments)
#  tenant_wallets        — after wallet_transactions
#  utility_readings      — lease_id SET NULL
#  messages              — org-scoped; no FK to purge tables
#  maintenance_issues    — inspection_id SET NULL (before inspections safe)
#  inspections           — lease_id SET NULL (lease kept)
#  tenant_screenings     — tenant_id SET NULL (tenant kept)
#  announcements         — org-scoped; standalone

PURGE_TABLES: list[tuple[str, str]] = [
    # (table_name, organisation_id_column)
    ("efris_audit_log",          "organisation_id"),
    ("notifications",            "organisation_id"),
    ("wallet_transactions",      "organisation_id"),
    ("mobile_money_transactions","organisation_id"),
    ("payment_allocations",      "organisation_id"),
    ("late_fees",                "organisation_id"),
    ("deposits",                 "organisation_id"),
    ("payments",                 "organisation_id"),
    ("rent_schedules",           "organisation_id"),
    ("ledger_entries",           "organisation_id"),
    ("tenant_wallets",           "organisation_id"),
    ("utility_readings",         "organisation_id"),
    ("messages",                 "organisation_id"),
    ("maintenance_issues",       "organisation_id"),
    ("inspections",              "organisation_id"),
    ("tenant_screenings",        "organisation_id"),
    ("announcements",            "organisation_id"),
]

RETAIN_TABLES = [
    "organisations", "profiles", "properties", "units",
    "tenants", "tenant_invites", "tenant_documents",
    "leases", "tenancy_agreements",
    "landlord_invites", "landlord_property_access",
    "agency_invites", "caretaker_invites", "contractors",
    "system_settings", "subscription_plans", "organisation_subscriptions",
    "notification_templates", "email_templates", "organisation_efris_configs",
    "roles", "resources", "permissions", "role_permissions",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _where(org_col: str) -> str:
    if ORG_ID is None:
        return "WHERE 1=1"
    return f"WHERE {org_col} = '{ORG_ID}'"


async def _count(session: AsyncSession, table: str, org_col: str) -> int:
    row = await session.execute(text(f"SELECT COUNT(*) FROM {table} {_where(org_col)}"))
    return row.scalar_one()


async def _delete(session: AsyncSession, table: str, org_col: str) -> int:
    result = await session.execute(text(f"DELETE FROM {table} {_where(org_col)}"))
    return result.rowcount  # type: ignore[union-attr]


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    scope = f"org {ORG_ID}" if ORG_ID else "ALL organisations"
    mode  = "DRY RUN" if DRY_RUN else "LIVE DELETE"

    print()
    print("=" * 64)
    print(f"  Crib — purge_test_data.py")
    print(f"  Mode  : {mode}")
    print(f"  Scope : {scope}")
    print("=" * 64)

    async with AsyncSessionLocal() as session:

        # ── Count ─────────────────────────────────────────────────────────────
        print()
        print("Counting rows to be deleted …")
        print()

        counts: dict[str, int] = {}
        for table, org_col in PURGE_TABLES:
            counts[table] = await _count(session, table, org_col)

        col_w = max(len(t) for t, _ in PURGE_TABLES) + 2
        total = 0
        for table, n in counts.items():
            total += n
            marker = "  " if n == 0 else "→ "
            print(f"  {marker}{table:<{col_w}} {n:>7} rows")

        print()
        print(f"  {'TOTAL':<{col_w}} {total:>7} rows to delete")
        print()
        print("  Retained (not touched):")
        for t in RETAIN_TABLES:
            print(f"    ✓ {t}")
        print()

        if total == 0:
            print("Nothing to delete. Exiting.")
            return

        if DRY_RUN:
            print("─" * 64)
            print("  Dry run complete — no changes made.")
            print("  Re-run with --apply to perform the actual delete.")
            print("─" * 64)
            print()
            return

        # ── Confirm ───────────────────────────────────────────────────────────
        print("─" * 64)
        print("  WARNING: This will permanently delete the rows above.")
        print("           Retained tables (leases, tenants, properties, etc.)")
        print("           will NOT be touched.")
        print("           This action CANNOT be undone.")
        print("─" * 64)
        print()
        answer = input("  Type  CONFIRM  to proceed, or anything else to abort: ").strip()
        if answer != "CONFIRM":
            print()
            print("  Aborted — no changes made.")
            return

        # ── Delete ────────────────────────────────────────────────────────────
        print()
        print("Deleting …")
        print()

        deleted: dict[str, int] = {}
        async with session.begin():
            for table, org_col in PURGE_TABLES:
                n = await _delete(session, table, org_col)
                deleted[table] = n
                status = f"{n:>7} rows deleted"
                print(f"  {'✓' if n > 0 else ' '} {table:<{col_w}} {status}")

        # ── Summary ───────────────────────────────────────────────────────────
        grand_total = sum(deleted.values())
        print()
        print("=" * 64)
        print(f"  Done.  {grand_total} rows deleted across {len(PURGE_TABLES)} tables.")
        print(f"  Landlords, properties, tenants, leases, and all system")
        print(f"  configuration have been retained.")
        print("=" * 64)
        print()


if __name__ == "__main__":
    asyncio.run(main())
