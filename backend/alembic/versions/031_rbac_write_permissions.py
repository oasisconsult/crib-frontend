"""031 — Expand RBAC write permissions for owner and manager

Revision ID: 031
Revises: 030
Create Date: 2026-05-25

Grants the missing write-side profile permissions to owner and manager so
endpoint guards can use require_permission("create"/"update"/"delete", "profile")
instead of hard-coded role-name checks.

  owner   → profile: create, update, delete  (already had read)
  manager → profile: create, update, delete  (already had read)

This covers landlord-invite management (landlords.py) and any other endpoint
that manages user profiles on behalf of the organisation.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "031"
down_revision: str | None = "030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ROLES = ["owner", "manager"]
_RESOURCE = "profile"
_NEW_ACTIONS = ["create", "update", "delete"]


def upgrade() -> None:
    for role in _ROLES:
        for action in _NEW_ACTIONS:
            op.execute(f"""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT ro.id, p.id
                FROM   roles      ro
                JOIN   resources  res ON res.name = '{_RESOURCE}'
                JOIN   permissions p  ON p.resource_id = res.id AND p.action = '{action}'
                WHERE  ro.name = '{role}'
                ON CONFLICT DO NOTHING
            """)


def downgrade() -> None:
    for role in _ROLES:
        for action in _NEW_ACTIONS:
            op.execute(f"""
                DELETE FROM role_permissions
                WHERE role_id       = (SELECT id FROM roles      WHERE name = '{role}')
                  AND permission_id = (
                      SELECT p.id
                      FROM   permissions p
                      JOIN   resources res ON res.id = p.resource_id
                      WHERE  res.name = '{_RESOURCE}' AND p.action = '{action}'
                  )
            """)
