"""Add display_name and is_system to roles table

Revision ID: 071
Revises: 070
Create Date: 2026-06-22

Adds:
  - display_name VARCHAR(100)  — human-readable label shown in the admin UI
  - is_system    BOOLEAN        — TRUE for built-in roles that cannot be deleted

Built-in roles (superadmin, owner, manager, tenant, maintenance, landlord,
caretaker) are marked as system roles and given display names.  Custom roles
added at runtime keep is_system=FALSE.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "071"
down_revision: str | None = "070"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BUILTIN_DISPLAY_NAMES: list[tuple[str, str]] = [
    ("superadmin",   "Super Admin"),
    ("owner",        "Property Owner"),
    ("manager",      "Manager"),
    ("tenant",       "Tenant"),
    ("maintenance",  "Maintenance Staff"),
    ("landlord",     "Landlord"),
    ("caretaker",    "Caretaker"),
]


def upgrade() -> None:
    op.execute("ALTER TABLE roles ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)")
    op.execute("ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE")

    # Backfill display names for built-in roles
    for name, display_name in _BUILTIN_DISPLAY_NAMES:
        op.execute(
            f"UPDATE roles SET display_name = '{display_name}' WHERE name = '{name}'"
        )

    # Mark all built-in roles as system roles
    names = ", ".join(f"'{n}'" for n, _ in _BUILTIN_DISPLAY_NAMES)
    op.execute(f"UPDATE roles SET is_system = TRUE WHERE name IN ({names})")


def downgrade() -> None:
    op.execute("ALTER TABLE roles DROP COLUMN IF EXISTS is_system")
    op.execute("ALTER TABLE roles DROP COLUMN IF EXISTS display_name")
