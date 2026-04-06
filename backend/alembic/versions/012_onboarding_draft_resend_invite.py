"""012 - onboarding_draft column + resend invite support

Add onboarding_draft JSONB column to tenants so partial onboarding
progress (profile fields, current wizard step) survives token expiry
and is restored automatically when a manager resends an invite link.

The column stores:
  {
    "step": "profile" | "documents" | "signature",
    "profile": { "phone": "...", "dateOfBirth": "...", "nationality": "..." },
    "emergencyContact": { ... }   (optional)
  }

Documents are NOT included in the draft — they are persisted as
TenantDocument rows the moment each file is uploaded during onboarding.

Revision ID: 012
Revises: 011
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("onboarding_draft", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "onboarding_draft")
