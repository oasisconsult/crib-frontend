"""RBAC seed: roles, resources, permissions, role_permission mappings

Revision ID: 010
Revises: 009
Create Date: 2026-04-04

Creates four tables:
  - roles            : named roles with descriptions
  - resources        : protected resource names
  - permissions      : CRUD actions per resource
  - role_permissions : many-to-many role ↔ permission assignments

Then seeds initial data according to the following business rules:

  superadmin  — full CRUD on every resource
  owner       — CRUD on property, unit, lease, tenant, payment,
                payment_allocation, ledger, wallet, document,
                notification, mobile_money, inspection, maintenance_request
                READ on organisation, profile, analytics, matching, settings
  manager     — CRUD on property, unit, lease, tenant, inspection,
                maintenance_request, notification, document
                READ on payment, payment_allocation, ledger, wallet,
                mobile_money, organisation, profile, analytics, matching
  tenant      — READ only: property, lease, payment, payment_allocation,
                ledger, wallet, notification, maintenance_request, document
  maintenance — READ only: inspection, maintenance_request

Future resources:
  Add the resource name to the RESOURCES list below and re-run
  `alembic upgrade head`.  The upgrade() function automatically generates
  CRUD permissions for any resource not already present, and assigns all
  new permissions to the superadmin role.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# ── Configuration ─────────────────────────────────────────────────────────────

ROLES: list[tuple[str, str]] = [
    ("superadmin", "Platform operator — cross-org, full system access"),
    ("owner", "Organisation owner / landlord — full access to own properties"),
    ("manager", "Property manager — org-scoped admin"),
    ("tenant", "Tenant — restricted to their own data"),
    ("maintenance", "Maintenance staff — read-only inspections"),
]

RESOURCES: list[str] = [
    "analytics",
    "inspection",
    "lease",
    "ledger",
    "matching",
    "notification",
    "payment",
    "payment_allocation",
    "settings",
    "tenant",
    "wallet",
    "mobile_money",
    "organisation",
    "profile",
    "property",
    "document",
    "maintenance_request",
]

ACTIONS: list[str] = ["create", "read", "update", "delete"]

# ── Role permission matrix ────────────────────────────────────────────────────
# Format: { role: { resource: set_of_actions } }
# Missing resource = no access.  "*" shorthand = all ACTIONS.

_ALL = set(ACTIONS)
_READ = {"read"}
_CRUD = _ALL

ROLE_PERMISSIONS: dict[str, dict[str, set[str]]] = {
    # superadmin — full CRUD on everything (handled programmatically below)
    "superadmin": {r: _CRUD for r in RESOURCES},

    # owner — full CRUD on operational resources, read-only on platform/admin
    "owner": {
        "property":           _CRUD,
        "lease":              _CRUD,
        "tenant":             _CRUD,
        "payment":            _CRUD,
        "payment_allocation": _CRUD,
        "ledger":             _CRUD,
        "wallet":             _CRUD,
        "mobile_money":       _CRUD,
        "inspection":         _CRUD,
        "maintenance_request": _CRUD,
        "notification":       _CRUD,
        "document":           _CRUD,
        # read-only on platform/org resources
        "organisation":       _READ,
        "profile":            _READ,
        "analytics":          _READ,
        "matching":           _READ,
        "settings":           _READ,
    },

    # manager — CRUD on day-to-day property ops; read-only on financials
    "manager": {
        "property":           _CRUD,
        "lease":              _CRUD,
        "tenant":             _CRUD,
        "inspection":         _CRUD,
        "maintenance_request": _CRUD,
        "notification":       _CRUD,
        "document":           _CRUD,
        # read-only on financials and platform
        "payment":            _READ,
        "payment_allocation": _READ,
        "ledger":             _READ,
        "wallet":             _READ,
        "mobile_money":       _READ,
        "organisation":       _READ,
        "profile":            _READ,
        "analytics":          _READ,
        "matching":           _READ,
    },

    # tenant — read-only on their own records
    "tenant": {
        "property":           _READ,
        "lease":              _READ,
        "payment":            _READ,
        "payment_allocation": _READ,
        "ledger":             _READ,
        "wallet":             _READ,
        "notification":       _READ,
        "maintenance_request": _READ,
        "document":           _READ,
    },

    # maintenance — read-only on work-related resources
    "maintenance": {
        "inspection":         _READ,
        "maintenance_request": _READ,
    },
}


# ── Upgrade ───────────────────────────────────────────────────────────────────

def upgrade() -> None:
    # ── 1. Create tables ─────────────────────────────────────────────────────

    op.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id          SERIAL PRIMARY KEY,
            name        VARCHAR(50)  NOT NULL UNIQUE,
            description TEXT
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS resources (
            id   SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS permissions (
            id          SERIAL PRIMARY KEY,
            resource_id INTEGER     NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            action      VARCHAR(20) NOT NULL,
            UNIQUE (resource_id, action)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            PRIMARY KEY (role_id, permission_id)
        )
    """)

    # ── 2. Seed roles ────────────────────────────────────────────────────────

    for name, description in ROLES:
        op.execute(
            f"INSERT INTO roles (name, description) "
            f"VALUES ('{name}', $${description}$$) "
            f"ON CONFLICT (name) DO NOTHING"
        )

    # ── 3. Seed resources ────────────────────────────────────────────────────

    for resource in RESOURCES:
        op.execute(
            f"INSERT INTO resources (name) VALUES ('{resource}') "
            f"ON CONFLICT (name) DO NOTHING"
        )

    # ── 4. Seed permissions (CRUD × resource) ────────────────────────────────
    # Auto-generates permissions for any resource not yet covered.

    for resource in RESOURCES:
        for action in ACTIONS:
            op.execute(f"""
                INSERT INTO permissions (resource_id, action)
                SELECT r.id, '{action}'
                FROM resources r
                WHERE r.name = '{resource}'
                ON CONFLICT (resource_id, action) DO NOTHING
            """)

    # ── 5. Assign role permissions ───────────────────────────────────────────

    for role, resource_map in ROLE_PERMISSIONS.items():
        for resource, actions in resource_map.items():
            for action in actions:
                op.execute(f"""
                    INSERT INTO role_permissions (role_id, permission_id)
                    SELECT ro.id, p.id
                    FROM roles ro
                    JOIN resources res ON res.name = '{resource}'
                    JOIN permissions p  ON p.resource_id = res.id AND p.action = '{action}'
                    WHERE ro.name = '{role}'
                    ON CONFLICT DO NOTHING
                """)


# ── Downgrade ─────────────────────────────────────────────────────────────────

def downgrade() -> None:
    # Remove only the seeded rows — leave tables intact so a partial re-seed
    # doesn't break foreign-key constraints from application data.
    # Drop tables entirely for a clean rollback.
    op.execute("DROP TABLE IF EXISTS role_permissions")
    op.execute("DROP TABLE IF EXISTS permissions")
    op.execute("DROP TABLE IF EXISTS resources")
    op.execute("DROP TABLE IF EXISTS roles")
