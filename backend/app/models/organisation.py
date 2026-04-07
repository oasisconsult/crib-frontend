"""
Organisation model — maps to a Logto Organization.

One Organisation = one landlord business (can have multiple managers/tenants).
The `logto_org_id` is the foreign key into Logto's organisations table.
"""

import enum

from sqlalchemy import Enum, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class Plan(str, enum.Enum):
    starter = "starter"
    growth = "growth"
    enterprise = "enterprise"


class Organisation(TimestampedBase):
    __tablename__ = "organisations"

    # Logto foreign key — the Organisation ID from Logto
    logto_org_id: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)

    plan: Mapped[Plan] = mapped_column(
        Enum(Plan, name="plan_enum"), nullable=False, default=Plan.starter
    )

    # Flexible settings blob: feature flags, notification prefs, branding, etc.
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Per-organisation payment method configuration
    # Structure: {
    #   "bank_transfer": {"enabled": true, "bank_name": "...", "account_name": "...",
    #                     "account_number": "...", "sort_code": "..."},
    #   "mobile_money_mtn": {"enabled": true, "number": "...", "name": "..."},
    #   "mobile_money_airtel": {"enabled": true, "number": "...", "name": "..."},
    #   "cash": {"enabled": true, "instructions": "Pay to property manager in person"}
    # }
    payment_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Soft-delete / suspension
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    # Billing contact info (cached — authoritative source is Logto/Stripe)
    billing_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)  # ISO-3166 alpha-2
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")

    def __repr__(self) -> str:
        return f"<Organisation {self.slug!r} plan={self.plan}>"
