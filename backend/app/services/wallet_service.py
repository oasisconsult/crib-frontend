"""
Wallet service — tenant credit balance management.

One wallet per tenant. Balance is always >= 0.
All mutations go through credit_wallet / debit_wallet which also
append WalletTransaction rows for audit.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wallet import TenantWallet, WalletTransaction


async def get_or_create_wallet(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    organisation_id: uuid.UUID,
) -> TenantWallet:
    """Fetch the wallet, creating it (with zero balance) if it doesn't exist."""
    result = await db.execute(
        select(TenantWallet).where(TenantWallet.tenant_id == tenant_id)
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = TenantWallet(
            tenant_id=tenant_id,
            organisation_id=organisation_id,
            balance=0,
        )
        db.add(wallet)
        await db.flush()
    return wallet


async def get_wallet(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> TenantWallet | None:
    result = await db.execute(
        select(TenantWallet).where(TenantWallet.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


async def credit_wallet(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    organisation_id: uuid.UUID,
    amount: float,
    reference_type: str,
    reference_id: uuid.UUID | None = None,
    description: str | None = None,
) -> TenantWallet:
    """Add credit to the tenant wallet and record the transaction."""
    wallet = await get_or_create_wallet(db, tenant_id, organisation_id)
    wallet.balance = round(float(wallet.balance) + float(amount), 2)

    txn = WalletTransaction(
        tenant_id=tenant_id,
        organisation_id=organisation_id,
        transaction_type="credit",
        amount=float(amount),
        reference_type=reference_type,
        reference_id=reference_id,
        description=description,
        balance_after=wallet.balance,
    )
    db.add(txn)
    await db.flush()
    return wallet


async def debit_wallet(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    organisation_id: uuid.UUID,
    amount: float,
    reference_type: str,
    reference_id: uuid.UUID | None = None,
    description: str | None = None,
) -> TenantWallet:
    """
    Deduct from the tenant wallet. Raises 400 if insufficient balance.
    """
    wallet = await get_or_create_wallet(db, tenant_id, organisation_id)
    if float(wallet.balance) < float(amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient wallet balance: {wallet.balance} < {amount}",
        )

    wallet.balance = round(float(wallet.balance) - float(amount), 2)

    txn = WalletTransaction(
        tenant_id=tenant_id,
        organisation_id=organisation_id,
        transaction_type="debit",
        amount=float(amount),
        reference_type=reference_type,
        reference_id=reference_id,
        description=description,
        balance_after=wallet.balance,
    )
    db.add(txn)
    await db.flush()
    return wallet


async def get_wallet_transactions(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    from sqlalchemy import func

    q = select(WalletTransaction).where(WalletTransaction.tenant_id == tenant_id)
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = (
        q.order_by(WalletTransaction.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    return {
        "data": list(result.scalars().all()),
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": (page * page_size) < total,
    }
