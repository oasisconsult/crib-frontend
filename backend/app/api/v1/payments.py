"""
Payments REST API — nested under /leases/{lease_id}.

Endpoints:
  POST   /leases/{id}/schedules/generate
  GET    /leases/{id}/schedules
  GET    /leases/{id}/schedules/{sid}
  PATCH  /leases/{id}/schedules/{sid}/waive
  POST   /leases/{id}/payments
  GET    /leases/{id}/payments
  GET    /leases/{id}/payments/export
  GET    /leases/{id}/payments/{pid}
  PATCH  /leases/{id}/payments/{pid}/confirm      — org staff confirms payment
  PATCH  /leases/{id}/payments/{pid}/refund       — org staff refunds confirmed payment
  PATCH  /leases/{id}/payments/{pid}/reject       — org staff rejects in-progress payment
  PATCH  /leases/{id}/payments/{pid}/cancel       — tenant cancels their own payment
  GET    /leases/{id}/payments/{pid}/allocations
  GET    /leases/{id}/late-fees
  POST   /leases/{id}/late-fees/{schedule_id}/apply
  PATCH  /leases/{id}/late-fees/{fid}/waive
  GET    /leases/{id}/deposit
  PATCH  /leases/{id}/deposit/return
  GET    /leases/{id}/ledger
  GET    /leases/{id}/ledger/entries
  GET    /leases/{id}/statement
  GET    /leases/{id}/statement/pdf
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id, require_org_access
from app.core.database import get_db
from app.services import audit_service
from app.schemas.payment import (
    ChannelCostEstimateOut,
    DepositOut,
    DepositReturn,
    LateFeeOut,
    LateFeeWaive,
    LedgerEntryOut,
    LedgerOut,
    LedgerPageOut,
    ManualPaymentCreate,
    PaymentAllocationOut,
    PaymentCancelBody,
    PaymentCreate,
    PaymentDecisionOut,
    PaymentEstimateRequest,
    PaymentOut,
    PaymentRejectBody,
    RentScheduleOut,
)
from app.services import payment_service as svc
from app.services.ledger_service import get_ledger_entries
from app.services.payment_allocation_service import get_allocations_for_payment
from app.services.policy_service import PolicyService, get_policy_service

router = APIRouter(prefix="/leases", tags=["payments"])

_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


async def _payment_create_guard(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    policy: PolicyService = Depends(get_policy_service),
) -> CurrentUser:
    """Managers/owners always allowed; tenants need payment:create RBAC permission."""
    get_org_id(current_user)  # raises 403 for non-superadmin without org context
    if current_user.is_owner_or_manager():
        return current_user
    if not await policy.can(current_user.roles, "create", "payment", db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager or owner role required",
        )
    return current_user


_payment_create = Depends(_payment_create_guard)


# ── Rent Schedules ─────────────────────────────────────────────────────────────

@router.post(
    "/{lease_id}/schedules/generate",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def generate_schedules(
    lease_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Manually re-generate rent schedules (e.g. after lease extension)."""
    lease = await svc._get_lease_checked(lease_id, get_org_id(current_user), db)
    await svc.generate_rent_schedules(lease, db)
    await db.flush()


@router.get("/{lease_id}/schedules", response_model=dict)
async def list_schedules(
    lease_id: uuid.UUID,
    schedule_status: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_schedules(lease_id, get_org_id(current_user), db, schedule_status, page, page_size)


@router.get("/{lease_id}/schedules/{schedule_id}", response_model=RentScheduleOut)
async def get_schedule(
    lease_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_schedule(schedule_id, lease_id, get_org_id(current_user), db)


@router.patch("/{lease_id}/schedules/{schedule_id}/waive", response_model=RentScheduleOut)
async def waive_schedule(
    lease_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.waive_schedule(schedule_id, lease_id, get_org_id(current_user), db)


# ── Payments ───────────────────────────────────────────────────────────────────

# NOTE: /payments/export must be registered BEFORE /{pid} to prevent FastAPI
# matching "export" as a UUID payment ID.

@router.get("/{lease_id}/payments/export")
async def export_payments(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    csv_data = await svc.export_payments_csv(lease_id, get_org_id(current_user), db)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="payments_{lease_id}.csv"'},
    )


@router.post(
    "/{lease_id}/payments",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    lease_id: uuid.UUID,
    body: PaymentCreate,
    current_user: CurrentUser = _payment_create,
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_payment(lease_id, body, current_user.org_id, db)


@router.post(
    "/{lease_id}/payments/record",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
)
async def record_manual_payment(
    lease_id: uuid.UUID,
    body: ManualPaymentCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Record a payment made outside the Crib app (cash, bank transfer, mobile money).

    The payment is immediately confirmed and allocated against pending/overdue
    rent schedules oldest-first. No mobile money STK push is triggered.

    Accessible to: owner, manager, superadmin.
    Blocked if the org has disabled the manualPayments feature flag.
    """
    from sqlalchemy import select as _select
    from app.models.organisation import Organisation as _Org
    from app.api.v1.organisations import resolve_org_features

    _org_id = get_org_id(current_user)
    if _org_id:
        _org = await db.scalar(_select(_Org).where(_Org.id == _org_id))
        if _org:
            _features = await resolve_org_features(_org, db)
            if not _features.get("manualPayments", True):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Manual payment recording has been disabled for this organisation",
                )

    return await svc.record_manual_payment(lease_id, body, _org_id, db)


@router.get("/{lease_id}/payments", response_model=dict)
async def list_payments(
    lease_id: uuid.UUID,
    payment_status: str | None = Query(None, alias="status"),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_payments(lease_id, get_org_id(current_user), db, payment_status, category, page, page_size)


@router.get("/{lease_id}/payments/{payment_id}", response_model=PaymentOut)
async def get_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_payment(payment_id, lease_id, get_org_id(current_user), db)


@router.patch("/{lease_id}/payments/{payment_id}/confirm", response_model=PaymentOut)
async def confirm_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    payment = await svc.confirm_payment(payment_id, lease_id, org_id, db)
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="payment",
        resource_id=payment_id,
        resource_label=f"Payment {payment_id}",
        action="payment.confirmed",
        event_data={"lease_id": str(lease_id)},
        request=request,
    )
    return payment


@router.patch("/{lease_id}/payments/{payment_id}/refund", response_model=PaymentOut)
async def refund_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    payment = await svc.refund_payment(payment_id, lease_id, org_id, db)
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="payment",
        resource_id=payment_id,
        resource_label=f"Payment {payment_id}",
        action="payment.refunded",
        event_data={"lease_id": str(lease_id)},
        request=request,
    )
    return payment


@router.patch("/{lease_id}/payments/{payment_id}/reject", response_model=PaymentOut)
async def reject_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    body: PaymentRejectBody,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Owner / caretaker / agency manager / superadmin declines an in-progress payment.

    Use when a payment was recorded by mistake, has the wrong amount, is a
    duplicate, or is otherwise unacceptable. Requires a reason which is stored
    for audit purposes and surfaced to the tenant in the portal.

    A rejected payment is terminal — a new payment must be created to re-attempt.
    Completed / confirmed payments cannot be rejected; use the refund endpoint instead.
    """
    org_id = get_org_id(current_user)
    payment = await svc.reject_payment(
        payment_id,
        lease_id,
        org_id,
        db,
        reason=body.reason,
        rejected_by_profile_id=current_user.profile.id,
    )
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="payment",
        resource_id=payment_id,
        resource_label=f"Payment {payment_id}",
        action="payment.rejected",
        event_data={"lease_id": str(lease_id), "reason": body.reason},
        request=request,
    )
    return payment


@router.patch("/{lease_id}/payments/{payment_id}/cancel", response_model=PaymentOut)
async def cancel_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    body: PaymentCancelBody,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel an in-progress payment.

    **Tenant** — self-service cancellation of their own payment.
    **Superadmin** — can cancel any payment on behalf of a tenant (e.g. support requests).

    Cancellation is only possible before the payment has been reconciled with the
    payment provider (states: initiated / predicted / routed / pending / retry_scheduled).

    Once a payment reaches ``reconciled`` or beyond — meaning the funds may already
    be in transit — cancellation is blocked. The tenant should contact their property
    manager to request a refund instead.

    A reason may optionally be provided (e.g. "Paid in cash instead") and will be
    visible to the manager in the payment detail view.
    """
    is_superadmin = current_user.has_role("superadmin")
    if not is_superadmin and not current_user.has_role("tenant"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the tenant or a superadmin can cancel a payment",
        )
    return await svc.cancel_payment(
        payment_id,
        lease_id,
        db,
        tenant_logto_sub=current_user.claims.sub,
        reason=body.reason,
        bypass_tenant_check=is_superadmin,
    )


@router.get(
    "/{lease_id}/payments/{payment_id}/allocations",
    response_model=list[PaymentAllocationOut],
)
async def list_payment_allocations(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Return all allocation rows showing how a payment was distributed across schedules."""
    # Verify the payment belongs to this lease / org before exposing allocations.
    await svc.get_payment(payment_id, lease_id, get_org_id(current_user), db)
    allocations = await get_allocations_for_payment(db, payment_id)
    return [
        PaymentAllocationOut(
            id=str(a.id),
            payment_id=str(a.payment_id),
            rent_schedule_id=str(a.rent_schedule_id),
            amount_applied=float(a.amount_applied),
            created_at=a.created_at.isoformat(),
            updated_at=a.updated_at.isoformat(),
        )
        for a in allocations
    ]


# ── Adaptive payment endpoints (v4 skill) ─────────────────────────────────────

# NOTE: /payments/estimate must be registered BEFORE /{pid} to avoid UUID matching.

@router.post(
    "/{lease_id}/payments/estimate",
    response_model=PaymentDecisionOut,
)
async def estimate_payment(
    lease_id: uuid.UUID,
    body: PaymentEstimateRequest,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """
    Return cost estimates and recommended channel for a payment.

    Accepts an optional tenant_id to enable per-tenant failure prediction.
    Safe to call before creating a payment — no state is mutated.
    """
    from app.services.adaptive_payment_service import recommend_channel

    tenant_id = uuid.UUID(body.tenant_id) if body.tenant_id else None
    decision = await recommend_channel(
        amount=body.amount,
        org_id=current_user.org_id,
        db=db,
        tenant_id=tenant_id,
        currency=body.currency,
    )
    return PaymentDecisionOut(
        recommended_channel=decision["recommended_channel"],
        predicted_failure_score=decision["predicted_failure_score"],
        retry_strategy=decision["retry_strategy"],
        cost_estimates=[
            ChannelCostEstimateOut(**e) for e in decision["cost_estimates"]
        ],
        explain=decision["explain"],
    )


@router.post(
    "/{lease_id}/payments/{payment_id}/retry",
    response_model=PaymentOut,
)
async def retry_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """
    Retry a failed payment.

    Resets status → pending, increments retry_count, clears failure_reason.
    Max retries controlled by org.settings.payments.maxRetries (default 3).
    After this call, confirm the payment to process it.
    """
    from app.services.adaptive_payment_service import retry_payment as svc_retry
    from app.services.payment_service import _payment_out

    payment = await svc_retry(payment_id, lease_id, get_org_id(current_user), db)
    return _payment_out(payment)


# ── Late Fees ──────────────────────────────────────────────────────────────────

@router.get("/{lease_id}/late-fees", response_model=list[LateFeeOut])
async def list_late_fees(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_late_fees(lease_id, get_org_id(current_user), db)


@router.post(
    "/{lease_id}/late-fees/{schedule_id}/apply",
    response_model=LateFeeOut,
    status_code=status.HTTP_201_CREATED,
)
async def apply_late_fee(
    lease_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.apply_late_fee(schedule_id, lease_id, get_org_id(current_user), db)


@router.patch("/{lease_id}/late-fees/{fee_id}/waive", response_model=LateFeeOut)
async def waive_late_fee(
    lease_id: uuid.UUID,
    fee_id: uuid.UUID,
    body: LateFeeWaive,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.waive_late_fee(fee_id, lease_id, get_org_id(current_user), body, db)


# ── Deposit ────────────────────────────────────────────────────────────────────

@router.get("/{lease_id}/deposit", response_model=DepositOut)
async def get_deposit(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_deposit(lease_id, get_org_id(current_user), db)


@router.patch("/{lease_id}/deposit/return", response_model=DepositOut)
async def return_deposit(
    lease_id: uuid.UUID,
    body: DepositReturn,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.return_deposit(lease_id, body, get_org_id(current_user), db)


# ── Ledger ─────────────────────────────────────────────────────────────────────

@router.get("/{lease_id}/ledger", response_model=LedgerOut)
async def get_ledger(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Computed ledger summary (totals). Use /ledger/entries for the full audit trail."""
    return await svc.get_ledger(lease_id, get_org_id(current_user), db)


@router.get("/{lease_id}/ledger/entries", response_model=LedgerPageOut)
async def list_ledger_entries(
    lease_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Paginated immutable audit trail for this lease, newest-first."""
    # Verify lease belongs to this org.
    await svc._get_lease_checked(lease_id, get_org_id(current_user), db)
    raw = await get_ledger_entries(db, lease_id, page=page, page_size=page_size)
    return LedgerPageOut(
        data=[
            LedgerEntryOut(
                id=str(e.id),
                organisation_id=str(e.organisation_id),
                lease_id=str(e.lease_id),
                entry_type=e.entry_type,
                amount=float(e.amount),
                reference_type=e.reference_type,
                reference_id=str(e.reference_id),
                balance_after=float(e.balance_after),
                description=e.description,
                created_at=e.created_at.isoformat(),
                updated_at=e.updated_at.isoformat(),
            )
            for e in raw["data"]
        ],
        total=raw["total"],
        page=raw["page"],
        page_size=raw["page_size"],
        has_next=raw["has_next"],
        current_balance=raw["current_balance"],
    )


@router.get("/{lease_id}/statement")
async def get_statement(
    lease_id: uuid.UUID,
    date_from: date | None = Query(None, alias="dateFrom", description="Start of range YYYY-MM-DD (inclusive)"),
    date_to:   date | None = Query(None, alias="dateTo",   description="End of range YYYY-MM-DD (inclusive); defaults to today"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Download a CSV rent statement filtered to the given date range (period_start).
    Defaults to lease start → today, so future unpaid months are excluded.
    """
    csv_data = await svc.export_payments_csv(lease_id, get_org_id(current_user), db, date_from, date_to)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="statement_{lease_id}.csv"'},
    )


@router.get("/{lease_id}/statement/pdf")
async def get_statement_pdf(
    lease_id: uuid.UUID,
    date_from: date | None = Query(None, alias="dateFrom", description="Start of range YYYY-MM-DD (inclusive)"),
    date_to:   date | None = Query(None, alias="dateTo",   description="End of range YYYY-MM-DD (inclusive); defaults to today"),
    month: str | None = Query(None, description="Legacy single-month filter YYYY-MM"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Download a formatted PDF rent statement filtered to a date range.
    Defaults to lease start → today, so future unpaid months are excluded.
    """
    from app.features.statement.service import generate_statement_pdf

    pdf_bytes = await generate_statement_pdf(
        lease_id, get_org_id(current_user), db,
        month=month, date_from=date_from, date_to=date_to,
    )
    filename = f"statement_{str(lease_id)[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
