"""
MobileMoneyTransaction — raw inbound telecom payment record.

Every MTN MoMo / Airtel Money payment hits this table first, before
the matching engine tries to link it to a lease and tenant.

Status machine:
  pending   — request sent to provider, awaiting PIN entry
  received  — provider confirmed payment (webhook or poll)
  matched   — matching engine linked it to a Payment row
  unmatched — could not find a tenant / lease automatically (needs admin)
  failed    — provider reported failure or timeout
  expired   — pending request timed out (e.g. no PIN entered in 10 min)

raw_payload stores the exact webhook JSON for audit. Never stripped.
"""

from __future__ import annotations

import uuid

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class MobileMoneyTransaction(TimestampedBase):
    __tablename__ = "mobile_money_transactions"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    provider: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )  # "MTN" | "AIRTEL"

    external_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
    )  # provider's unique transaction ID — idempotency key

    phone_number: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="UGX",
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )  # pending | received | matched | unmatched | failed | expired

    received_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    raw_payload: Mapped[dict] = mapped_column(
        JSONB(),
        nullable=False,
        default=dict,
    )

    matched_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    # Reference ID used when we initiated the request (stored inside raw_payload too,
    # but surfaced here for fast lookups in the polling worker).
    reference_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<MobileMoneyTransaction provider={self.provider} "
            f"phone={self.phone_number} amount={self.amount} status={self.status}>"
        )
