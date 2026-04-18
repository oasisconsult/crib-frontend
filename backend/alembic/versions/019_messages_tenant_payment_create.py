"""
019 — Messages table + tenant payment:create permission

Creates:
  messages  table — internal communications between tenants and property staff

Grants:
  tenant role: payment:create permission (allows tenants to submit payments
  for their own lease via the portal)

  tenant role: maintenance_request:create permission (allows tenants to
  submit maintenance requests via the portal)

  tenant role: message:read + message:create permissions
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1. Messages table ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            lease_id        UUID        NULL,
            sender_id       VARCHAR(100) NOT NULL,
            sender_name     VARCHAR(200) NOT NULL,
            sender_role     VARCHAR(50)  NOT NULL,
            content         TEXT         NOT NULL,
            read_at         TIMESTAMPTZ  NULL,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_messages_org   ON messages (organisation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_messages_lease ON messages (lease_id)")

    # ── 2. Ensure message resource + permissions exist ────────────────────────
    op.execute("INSERT INTO resources (name) VALUES ('message') ON CONFLICT (name) DO NOTHING")

    for action in ("create", "read", "update", "delete"):
        op.execute(f"""
            INSERT INTO permissions (resource_id, action)
            SELECT r.id, '{action}' FROM resources r WHERE r.name = 'message'
            ON CONFLICT (resource_id, action) DO NOTHING
        """)

    # Grant superadmin full message access
    for action in ("create", "read", "update", "delete"):
        op.execute(f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT ro.id, p.id
            FROM roles ro
            JOIN resources res ON res.name = 'message'
            JOIN permissions p  ON p.resource_id = res.id AND p.action = '{action}'
            WHERE ro.name = 'superadmin'
            ON CONFLICT DO NOTHING
        """)

    # Grant owner / manager full message access
    for role in ("owner", "manager"):
        for action in ("create", "read", "update", "delete"):
            op.execute(f"""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT ro.id, p.id
                FROM roles ro
                JOIN resources res ON res.name = 'message'
                JOIN permissions p  ON p.resource_id = res.id AND p.action = '{action}'
                WHERE ro.name = '{role}'
                ON CONFLICT DO NOTHING
            """)

    # Grant tenant message:read + message:create
    for action in ("create", "read"):
        op.execute(f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT ro.id, p.id
            FROM roles ro
            JOIN resources res ON res.name = 'message'
            JOIN permissions p  ON p.resource_id = res.id AND p.action = '{action}'
            WHERE ro.name = 'tenant'
            ON CONFLICT DO NOTHING
        """)

    # ── 3. Grant tenant payment:create permission ─────────────────────────────
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT ro.id, p.id
        FROM roles ro
        JOIN resources res ON res.name = 'payment'
        JOIN permissions p  ON p.resource_id = res.id AND p.action = 'create'
        WHERE ro.name = 'tenant'
        ON CONFLICT DO NOTHING
    """)

    # ── 4. Grant tenant maintenance_request:create permission ─────────────────
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT ro.id, p.id
        FROM roles ro
        JOIN resources res ON res.name = 'maintenance_request'
        JOIN permissions p  ON p.resource_id = res.id AND p.action = 'create'
        WHERE ro.name = 'tenant'
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS messages")
    # Leave permission rows — safe to leave orphaned grants
