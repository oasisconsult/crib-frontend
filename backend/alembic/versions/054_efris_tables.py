"""054 — EFRIS: organisation config, audit log, subscription plan feature flags

Revision ID: 054
Revises: 053
Create Date: 2026-06-13

Creates:
  organisation_efris_configs  — per-org EFRIS credentials (password Fernet-encrypted)
  efris_audit_log             — append-only audit trail for every EFRIS API call

Updates:
  subscription_plans.features — adds "efris" flag (false on free, true on others)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "054"
down_revision: str | None = "053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── organisation_efris_configs ─────────────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS organisation_efris_configs (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id     UUID        NOT NULL UNIQUE
                                            REFERENCES organisations(id) ON DELETE CASCADE,

            -- URA environment: 'mock' | 'uat' | 'prod'
            environment         VARCHAR(16) NOT NULL DEFAULT 'mock',

            -- Base URL for the EFRIS API (must be https:// for uat/prod)
            api_url             VARCHAR(512) NOT NULL DEFAULT '',

            -- URA Tax Identification Number
            tin                 VARCHAR(64) NOT NULL DEFAULT '',

            -- Registered device serial number
            device_no           VARCHAR(64) NOT NULL DEFAULT '',

            -- API credentials
            username            VARCHAR(128) NOT NULL DEFAULT '',

            -- Fernet-encrypted password — NEVER returned by API
            password_encrypted  TEXT NOT NULL DEFAULT '',

            -- taxpayer id returned by T103 login (stored for subsequent requests)
            taxpayer_id         VARCHAR(64),

            -- QR code verification URL prefix returned by T103 login
            qr_code_url         VARCHAR(512),

            -- Master on/off switch — false until org explicitly enables
            is_active           BOOLEAN NOT NULL DEFAULT FALSE,

            -- Audit fields
            created_by_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
            updated_by_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,

            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_org_efris_configs_org_id
            ON organisation_efris_configs(organisation_id)
    """))

    # ── efris_audit_log ────────────────────────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS efris_audit_log (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id     UUID        NOT NULL
                                            REFERENCES organisations(id) ON DELETE CASCADE,
            payment_id          UUID        REFERENCES payments(id) ON DELETE SET NULL,

            -- T101 | T103 | T109 | retry
            action              VARCHAR(64) NOT NULL,

            -- Scrubbed request payload (passwords/tokens removed before storage)
            request_payload     JSONB,

            -- Full URA response payload
            response_payload    JSONB,

            -- HTTP status code
            status_code         INTEGER,

            -- success | failed | error | skipped
            efris_status        VARCHAR(32) NOT NULL DEFAULT 'unknown',

            failure_reason      TEXT,

            -- Round-trip latency in ms
            duration_ms         INTEGER,

            -- Append-only: no updated_at
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_efris_audit_log_org_created
            ON efris_audit_log(organisation_id, created_at DESC)
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_efris_audit_log_payment_id
            ON efris_audit_log(payment_id)
            WHERE payment_id IS NOT NULL
    """))

    # ── Add "efris" feature flag to all subscription plans ───────────────────
    # free → false; professional / agency / enterprise → true
    conn.execute(sa.text("""
        UPDATE subscription_plans
        SET features = features || '{"efris": false}'::jsonb
        WHERE slug = 'free'
    """))

    conn.execute(sa.text("""
        UPDATE subscription_plans
        SET features = features || '{"efris": true}'::jsonb
        WHERE slug IN ('professional', 'agency', 'enterprise')
    """))


def downgrade() -> None:
    conn = op.get_bind()

    # Remove "efris" flag from plan features
    conn.execute(sa.text("""
        UPDATE subscription_plans
        SET features = features - 'efris'
    """))

    conn.execute(sa.text("DROP TABLE IF EXISTS efris_audit_log"))
    conn.execute(sa.text("DROP TABLE IF EXISTS organisation_efris_configs"))
