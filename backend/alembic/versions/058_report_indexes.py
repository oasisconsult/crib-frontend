"""Composite covering indexes for reporting queries.

Revision ID: 058
Revises: 057
Create Date: 2026-06-16

These indexes support the Reporting & Analytics Framework (reporting_service.py).
All queries use these columns in WHERE / GROUP BY / ORDER BY clauses.
No schema changes — index-only migration; fully backward-compatible.

Decision: indexes on live tables, not materialized views.
At current scale (< 10k leases, < 100k payments) covering indexes give
sub-second response times without the complexity of MV refresh orchestration.
Revisit when rent_schedules or payments exceed ~1M rows.
"""
from alembic import op

revision = "058"
down_revision = "057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── rent_schedules ─────────────────────────────────────────────────────────
    # Rent collection report: filter by due_date range + lease_id, group by property
    op.create_index(
        "ix_rent_schedules_due_date_status",
        "rent_schedules",
        ["due_date", "status"],
        postgresql_where="deleted_at IS NULL",
    )
    # Arrears report: overdue schedules ordered by due_date
    op.create_index(
        "ix_rent_schedules_status_due_date",
        "rent_schedules",
        ["status", "due_date"],
        postgresql_where="deleted_at IS NULL AND status = 'overdue'",
    )

    # ── payments ───────────────────────────────────────────────────────────────
    # Income/expense monthly series: filter by paid_at + status, group by date_trunc
    op.create_index(
        "ix_payments_org_paid_at_status",
        "payments",
        ["organisation_id", "paid_at", "status"],
    )

    # ── maintenance_issues ─────────────────────────────────────────────────────
    # Overview: group by state + property
    op.create_index(
        "ix_maintenance_org_state",
        "maintenance_issues",
        ["organisation_id", "state"],
    )
    # Cost report: filter by resolved_at + org, sum actual_cost
    op.create_index(
        "ix_maintenance_org_resolved_at",
        "maintenance_issues",
        ["organisation_id", "resolved_at"],
        postgresql_where="actual_cost IS NOT NULL AND state IN ('resolved', 'closed')",
    )
    # Contractor performance: filter by assigned_at + contractor
    op.create_index(
        "ix_maintenance_contractor_assigned",
        "maintenance_issues",
        ["contractor_id", "assigned_at"],
        postgresql_where="contractor_id IS NOT NULL",
    )

    # ── leases ─────────────────────────────────────────────────────────────────
    # Lease expiry report: active leases with end_date upcoming
    # Note: the DB column is "status" (the ORM model exposes it as "state")
    op.create_index(
        "ix_leases_org_status_end_date",
        "leases",
        ["organisation_id", "status", "end_date"],
        postgresql_where="deleted_at IS NULL AND end_date IS NOT NULL",
    )

    # ── units ──────────────────────────────────────────────────────────────────
    # Occupancy report: units grouped by property + status
    op.create_index(
        "ix_units_property_status",
        "units",
        ["property_id", "status"],
        postgresql_where="deleted_at IS NULL",
    )


def downgrade() -> None:
    op.drop_index("ix_units_property_status", table_name="units")
    op.drop_index("ix_leases_org_status_end_date", table_name="leases")
    op.drop_index("ix_maintenance_contractor_assigned", table_name="maintenance_issues")
    op.drop_index("ix_maintenance_org_resolved_at", table_name="maintenance_issues")
    op.drop_index("ix_maintenance_org_state", table_name="maintenance_issues")
    op.drop_index("ix_payments_org_paid_at_status", table_name="payments")
    op.drop_index("ix_rent_schedules_status_due_date", table_name="rent_schedules")
    op.drop_index("ix_rent_schedules_due_date_status", table_name="rent_schedules")
