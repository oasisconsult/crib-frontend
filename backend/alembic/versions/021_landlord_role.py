"""021 — Add landlord role to RBAC

Revision ID: 021
Revises: 020
Create Date: 2026-04-20

Adds the `landlord` role (priority 25, between manager=20 and maintenance=30).
Landlords have read-only access to the resources they care about:
  property, unit, lease, payment, analytics, notification, document, inspection.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_READ_RESOURCES = [
    "property",
    "lease",
    "payment",
    "payment_allocation",
    "ledger",
    "analytics",
    "notification",
    "document",
    "inspection",
    "maintenance_request",
    "organisation",
    "profile",
]


def upgrade() -> None:
    # Insert the landlord role with priority 25
    op.execute("""
        INSERT INTO roles (name, description, priority)
        VALUES (
            'landlord',
            'Property owner / landlord — view-only access to their properties',
            25
        )
        ON CONFLICT (name) DO UPDATE
            SET description = EXCLUDED.description,
                priority     = EXCLUDED.priority
    """)

    # Grant read permission on every relevant resource
    for resource in _READ_RESOURCES:
        op.execute(f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT ro.id, p.id
            FROM   roles      ro
            JOIN   resources  res ON res.name = '{resource}'
            JOIN   permissions p  ON p.resource_id = res.id AND p.action = 'read'
            WHERE  ro.name = 'landlord'
            ON CONFLICT DO NOTHING
        """)


def downgrade() -> None:
    op.execute("DELETE FROM roles WHERE name = 'landlord'")
