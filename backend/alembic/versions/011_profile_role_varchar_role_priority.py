"""profile.role → VARCHAR(50), add priority to roles table

Revision ID: 011
Revises: 010
Create Date: 2026-04-05

Changes:
  1. Add `priority` column to `roles` table and seed values:
       superadmin=0, owner=10, manager=20, maintenance=30, tenant=40
  2. Convert `profiles.role` from PostgreSQL native enum type `role_enum`
     to VARCHAR(50) — no data loss, enum values already equal the strings.
  3. Drop the `role_enum` type.

Why:
  - The `Role` Python enum is removed in favour of DB-driven role strings.
  - New roles can be added at runtime via the admin UI without code deploys.
  - `priority` replaces the hardcoded `_ROLE_PRIORITY` list in deps.py so
    role ordering is configurable in the database.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_PRIORITIES = [
    ("superadmin",   0),
    ("owner",       10),
    ("manager",     20),
    ("maintenance", 30),
    ("tenant",      40),
]


def upgrade() -> None:
    # ── 1. Add priority column to roles ──────────────────────────────────────
    op.add_column("roles", sa.Column("priority", sa.Integer(), nullable=True))

    # Seed priority values for the default roles
    for name, priority in _PRIORITIES:
        op.execute(
            f"UPDATE roles SET priority = {priority} WHERE name = '{name}'"
        )

    # Set a safe default for any unknown roles added before this migration
    op.execute("UPDATE roles SET priority = 99 WHERE priority IS NULL")

    # Now make it non-nullable with a default
    op.alter_column("roles", "priority", nullable=False, server_default="99")

    # ── 2. Convert profiles.role from role_enum → VARCHAR(50) ─────────────
    # PostgreSQL requires explicit USING clause when casting enum → text.
    op.execute("""
        ALTER TABLE profiles
        ALTER COLUMN role TYPE VARCHAR(50) USING role::text
    """)

    # Set column default to string literal now that the type is varchar
    op.execute("""
        ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'tenant'
    """)

    # ── 3. Drop the enum type ────────────────────────────────────────────────
    # CASCADE handles any remaining references (there should be none after step 2).
    op.execute("DROP TYPE IF EXISTS role_enum CASCADE")


def downgrade() -> None:
    # Recreate the enum type
    op.execute("""
        CREATE TYPE role_enum AS ENUM (
            'superadmin', 'owner', 'manager', 'tenant', 'maintenance'
        )
    """)

    # Normalise any role values that are not in role_enum before casting.
    # 'superuser' was used briefly in production before being renamed to 'superadmin'.
    op.execute("UPDATE profiles SET role = 'superadmin' WHERE role NOT IN ('superadmin','owner','manager','tenant','maintenance')")

    # Drop the string default before changing the column type, then re-add it
    # as an enum cast. Without this, Postgres refuses to cast the default value.
    op.execute("ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT")
    op.execute("""
        ALTER TABLE profiles
        ALTER COLUMN role TYPE role_enum USING role::role_enum
    """)
    op.execute("ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'tenant'::role_enum")

    # Remove priority column
    op.drop_column("roles", "priority")
