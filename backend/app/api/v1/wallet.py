"""
Tenant wallet API — credit balance and transaction history.

Endpoints:
  GET  /tenants/{tenant_id}/wallet               wallet balance
  GET  /tenants/{tenant_id}/wallet/transactions  paginated transaction history
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.models.profile import Role
from app.schemas.payment import WalletOut, WalletTransactionOut, WalletTransactionPageOut
from app.services.wallet_service import get_wallet, get_wallet_transactions

router = APIRouter(prefix="/tenants", tags=["wallet"])

_read = Depends(require_org_access(allow_tenant_own=True))


def _fmt_wallet(w) -> WalletOut:
    return WalletOut(
        id=str(w.id),
        tenant_id=str(w.tenant_id),
        organisation_id=str(w.organisation_id),
        balance=float(w.balance),
        currency=w.currency,
        created_at=w.created_at.isoformat(),
        updated_at=w.updated_at.isoformat(),
    )


def _fmt_txn(t) -> WalletTransactionOut:
    return WalletTransactionOut(
        id=str(t.id),
        tenant_id=str(t.tenant_id),
        organisation_id=str(t.organisation_id),
        transaction_type=t.transaction_type,
        amount=float(t.amount),
        reference_type=t.reference_type,
        reference_id=str(t.reference_id) if t.reference_id else None,
        description=t.description,
        balance_after=float(t.balance_after),
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


@router.get("/{tenant_id}/wallet", response_model=WalletOut)
async def get_tenant_wallet(
    tenant_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Return the tenant's current wallet balance. Returns 404 if no wallet exists yet."""
    wallet = await get_wallet(db, tenant_id)
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Wallet not found — tenant has no recorded payments yet",
        )
    # Tenants may only view their own wallet; org members can view any wallet in their org.
    if (
        current_user.role == Role.tenant
        and str(wallet.tenant_id) != str(current_user.id)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _fmt_wallet(wallet)


@router.get("/{tenant_id}/wallet/transactions", response_model=WalletTransactionPageOut)
async def list_wallet_transactions(
    tenant_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Paginated wallet transaction history, newest-first."""
    # Enforce same ownership check as get_tenant_wallet.
    if (
        current_user.role == Role.tenant
        and str(tenant_id) != str(current_user.id)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await get_wallet_transactions(db, tenant_id, page=page, page_size=page_size)
    return WalletTransactionPageOut(
        data=[_fmt_txn(t) for t in raw["data"]],
        total=raw["total"],
        page=raw["page"],
        page_size=raw["page_size"],
        has_next=raw["has_next"],
    )
