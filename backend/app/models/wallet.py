"""
TenantWallet + WalletTransaction — tenant credit balance.

A wallet holds overpayment credit that gets auto-applied when the next
rent schedule is generated or manually applied by admin.

TenantWallet — one row per tenant (unique on tenant_id).
  balance: current credit balance in organisation currency.
           Always >= 0. Negative balance is impossible — a wallet cannot
           go into debt; debt is tracked on RentSchedule.

WalletTransaction — immutable history of every wallet credit/debit.
  type: "credit" — money added to wallet (overpayment, advance payment)
        "debit"  — money spent from wallet (applied to a rent schedule)
"""

from __future__ import annotations

import uuid

from sqlalchemy import Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class TenantWallet(TimestampedBase):
    __tablename__ = "tenant_wallets"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        unique=True,
        index=True,
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    balance: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=0,
        server_default="0",
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="UGX",
    )

    def __repr__(self) -> str:
        return f"<TenantWallet tenant={self.tenant_id} balance={self.balance}>"


class WalletTransaction(TimestampedBase):
    __tablename__ = "wallet_transactions"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    transaction_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )  # "credit" | "debit"

    amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    reference_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )  # "overpayment" | "rent_application" | "refund" | "manual"

    reference_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    description: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    balance_after: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<WalletTransaction tenant={self.tenant_id} "
            f"type={self.transaction_type} amount={self.amount}>"
        )
