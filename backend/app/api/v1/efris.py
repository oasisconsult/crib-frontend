"""
EFRIS REST API — per-organisation fiscal receipt configuration and compliance.

Endpoints:
  GET  /organisations/{org_id}/efris/config         — get EFRIS config (password masked)
  PUT  /organisations/{org_id}/efris/config         — upsert EFRIS config
  POST /organisations/{org_id}/efris/config/test    — test connection to EFRIS server
  GET  /organisations/{org_id}/efris/compliance     — paginated EFRIS audit log
  GET  /organisations/{org_id}/efris/failed         — payments with efris_status=failed
  POST /leases/{lease_id}/payments/{payment_id}/efris/retry  — re-queue failed payment
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access
from app.core.database import get_db
from app.core.encryption import MASKED, decrypt, encrypt, is_encrypted
from app.models.efris import EfrisAuditLog, OrganisationEfrisConfig
from app.models.payment import Payment, PaymentStatus
from app.schemas.common import CamelModel, PaginatedResponse
from app.services.subscription_limits import check_feature_access

router = APIRouter(tags=["efris"])

# Only owners and managers can manage EFRIS config
_write = Depends(require_org_access(allow_tenant_own=False))
_read = Depends(require_org_access(allow_tenant_own=False))


# ── Schemas ────────────────────────────────────────────────────────────────────

class EfrisConfigOut(CamelModel):
    id: str
    organisation_id: str
    environment: str
    api_url: str
    tin: str
    device_no: str
    username: str
    password_set: bool                 # true if password has been saved; value never returned
    taxpayer_id: str | None
    qr_code_url: str | None
    is_active: bool
    updated_by_id: str | None
    created_at: str
    updated_at: str


class EfrisConfigUpsert(CamelModel):
    environment: str = Field(default="mock", pattern=r"^(mock|uat|prod)$")
    api_url: str = Field(default="", max_length=512)
    tin: str = Field(default="", max_length=64)
    device_no: str = Field(default="", max_length=64)
    username: str = Field(default="", max_length=128)
    password: str | None = Field(default=None)  # None = keep existing
    is_active: bool = False


class EfrisTestResult(CamelModel):
    success: bool
    message: str
    taxpayer_id: str | None = None
    legal_name: str | None = None
    environment: str | None = None


class EfrisAuditLogOut(CamelModel):
    id: str
    payment_id: str | None
    action: str
    status_code: int | None
    efris_status: str
    failure_reason: str | None
    duration_ms: int | None
    created_at: str


class EfrisFailedPaymentOut(CamelModel):
    id: str
    lease_id: str
    amount: float
    currency: str
    category: str
    method: str
    paid_at: str | None
    efris_status: str | None
    efris_failure_reason: str | None
    efris_retry_count: int
    created_at: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _config_out(c: OrganisationEfrisConfig) -> EfrisConfigOut:
    return EfrisConfigOut(
        id=str(c.id),
        organisation_id=str(c.organisation_id),
        environment=c.environment,
        api_url=c.api_url,
        tin=c.tin,
        device_no=c.device_no,
        username=c.username,
        password_set=bool(c.password_encrypted),
        taxpayer_id=c.taxpayer_id,
        qr_code_url=c.qr_code_url,
        is_active=c.is_active,
        updated_by_id=str(c.updated_by_id) if c.updated_by_id else None,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )


async def _get_org_config(org_id: uuid.UUID, db: AsyncSession) -> OrganisationEfrisConfig | None:
    return await db.scalar(
        select(OrganisationEfrisConfig).where(
            OrganisationEfrisConfig.organisation_id == org_id
        )
    )


async def _require_efris_feature(org_id: uuid.UUID | None, db: AsyncSession) -> None:
    if org_id is not None:
        await check_feature_access(org_id, "efris", db)


# ── Config endpoints ───────────────────────────────────────────────────────────

@router.get(
    "/organisations/{org_id}/efris/config",
    response_model=EfrisConfigOut | None,
)
async def get_efris_config(
    org_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
) -> EfrisConfigOut | None:
    """Get the EFRIS configuration for an organisation. Password is never returned."""
    scoped_org_id = get_org_id(current_user) or org_id
    await _require_efris_feature(scoped_org_id, db)

    config = await _get_org_config(scoped_org_id, db)
    if config is None:
        return None
    return _config_out(config)


@router.put(
    "/organisations/{org_id}/efris/config",
    response_model=EfrisConfigOut,
)
async def upsert_efris_config(
    org_id: uuid.UUID,
    body: EfrisConfigUpsert,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> EfrisConfigOut:
    """Create or update the EFRIS configuration for an organisation.

    Password is Fernet-encrypted before storage and never returned.
    Omit the password field (or pass null) to keep the existing password.
    """
    scoped_org_id = get_org_id(current_user) or org_id
    await _require_efris_feature(scoped_org_id, db)

    # Validate TLS requirement
    if body.environment != "mock" and body.api_url.startswith("http://"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="api_url must use HTTPS for uat and prod environments.",
        )

    config = await _get_org_config(scoped_org_id, db)

    if config is None:
        config = OrganisationEfrisConfig(
            organisation_id=scoped_org_id,
            created_by_id=current_user.profile.id,
        )
        db.add(config)

    config.environment = body.environment
    config.api_url = body.api_url
    config.tin = body.tin
    config.device_no = body.device_no
    config.username = body.username
    config.is_active = body.is_active
    config.updated_by_id = current_user.profile.id

    if body.password is not None:
        config.password_encrypted = encrypt(body.password)

    await db.flush()
    await db.refresh(config)
    await db.commit()
    return _config_out(config)


@router.post(
    "/organisations/{org_id}/efris/config/test",
    response_model=EfrisTestResult,
)
async def test_efris_connection(
    org_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> EfrisTestResult:
    """Test the EFRIS connection by performing a T103 login.

    Returns the taxpayer profile from URA if successful and saves taxpayer_id.
    """
    scoped_org_id = get_org_id(current_user) or org_id
    config = await _get_org_config(scoped_org_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="EFRIS configuration not found. Save a config first.")

    try:
        password = decrypt(config.password_encrypted) if config.password_encrypted else ""
    except Exception:
        raise HTTPException(status_code=422, detail="EFRIS password cannot be decrypted. Re-save the config.")

    from app.integrations.efris.client import EfrisClient, EfrisApiError
    import fakeredis.aioredis as fakeredis  # noqa — type: ignore

    class _FakeRedis:
        """Minimal fake Redis for the connection test (don't cache the test token)."""
        async def get(self, key: str) -> None: return None
        async def set(self, key: str, value: str, ex: int = 0) -> None: pass

    client = EfrisClient(
        org_id=scoped_org_id,
        environment=config.environment,
        api_url=config.api_url,
        tin=config.tin,
        device_no=config.device_no,
        username=config.username,
        password=password,
        taxpayer_id="",
    )

    try:
        login_resp = await client.login(_FakeRedis())
        # Store the taxpayer_id from URA for use in future encrypted requests
        config.taxpayer_id = login_resp.id
        config.qr_code_url = login_resp.qr_code_url or config.qr_code_url
        await db.commit()

        return EfrisTestResult(
            success=True,
            message="Connection successful.",
            taxpayer_id=login_resp.id,
            legal_name=login_resp.legal_name,
            environment="Production" if login_resp.environment == "0" else "Test/UAT",
        )
    except EfrisApiError as exc:
        return EfrisTestResult(success=False, message=f"EFRIS API error [{exc.code}]: {exc.message}")
    except Exception as exc:
        return EfrisTestResult(success=False, message=f"Connection failed: {exc}")


# ── Compliance / Audit endpoints ───────────────────────────────────────────────

@router.get(
    "/organisations/{org_id}/efris/compliance",
    response_model=PaginatedResponse[EfrisAuditLogOut],
)
async def get_efris_audit_log(
    org_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[EfrisAuditLogOut]:
    """Paginated EFRIS audit log for an organisation.

    Payloads (request/response) are not returned via API — stored for internal audit only.
    """
    scoped_org_id = get_org_id(current_user) or org_id
    offset = (page - 1) * page_size

    from sqlalchemy import func
    total = await db.scalar(
        select(func.count()).select_from(EfrisAuditLog).where(
            EfrisAuditLog.organisation_id == scoped_org_id
        )
    )

    rows = (await db.execute(
        select(EfrisAuditLog)
        .where(EfrisAuditLog.organisation_id == scoped_org_id)
        .order_by(desc(EfrisAuditLog.created_at))
        .offset(offset)
        .limit(page_size)
    )).scalars().all()

    items = [
        EfrisAuditLogOut(
            id=str(r.id),
            payment_id=str(r.payment_id) if r.payment_id else None,
            action=r.action,
            status_code=r.status_code,
            efris_status=r.efris_status,
            failure_reason=r.failure_reason,
            duration_ms=r.duration_ms,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]

    return PaginatedResponse(
        items=items,
        total=total or 0,
        page=page,
        page_size=page_size,
        pages=max(1, ((total or 0) + page_size - 1) // page_size),
    )


@router.get(
    "/organisations/{org_id}/efris/failed",
    response_model=PaginatedResponse[EfrisFailedPaymentOut],
)
async def get_failed_efris_payments(
    org_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[EfrisFailedPaymentOut]:
    """Payments where EFRIS submission failed — available for manual retry."""
    scoped_org_id = get_org_id(current_user) or org_id
    offset = (page - 1) * page_size

    from sqlalchemy import func
    total = await db.scalar(
        select(func.count()).select_from(Payment).where(
            Payment.organisation_id == scoped_org_id,
            Payment.efris_status == "failed",
        )
    )

    rows = (await db.execute(
        select(Payment)
        .where(
            Payment.organisation_id == scoped_org_id,
            Payment.efris_status == "failed",
        )
        .order_by(desc(Payment.updated_at))
        .offset(offset)
        .limit(page_size)
    )).scalars().all()

    items = [
        EfrisFailedPaymentOut(
            id=str(p.id),
            lease_id=str(p.lease_id),
            amount=float(p.amount),
            currency=p.currency,
            category=p.category,
            method=p.method,
            paid_at=p.paid_at.isoformat() if p.paid_at else None,
            efris_status=p.efris_status,
            efris_failure_reason=p.efris_failure_reason,
            efris_retry_count=p.efris_retry_count or 0,
            created_at=p.created_at.isoformat(),
        )
        for p in rows
    ]

    return PaginatedResponse(
        items=items,
        total=total or 0,
        page=page,
        page_size=page_size,
        pages=max(1, ((total or 0) + page_size - 1) // page_size),
    )


# ── Retry endpoint ─────────────────────────────────────────────────────────────

@router.post(
    "/leases/{lease_id}/payments/{payment_id}/efris/retry",
    response_model=dict,
)
async def retry_efris_receipt(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-queue a failed EFRIS receipt submission for a specific payment."""
    scoped_org_id = get_org_id(current_user)

    p = await db.get(Payment, payment_id)
    if p is None or (scoped_org_id and p.organisation_id != scoped_org_id):
        raise HTTPException(status_code=404, detail="Payment not found.")

    if p.efris_receipt_number:
        raise HTTPException(
            status_code=409,
            detail=f"Payment already has EFRIS receipt {p.efris_receipt_number}.",
        )

    if p.status not in (PaymentStatus.completed, PaymentStatus.confirmed):
        raise HTTPException(
            status_code=409,
            detail="Only completed payments can be submitted to EFRIS.",
        )

    # Reset retry counter and re-queue
    p.efris_status = "pending"
    p.efris_failure_reason = None
    p.efris_retry_count = 0
    await db.commit()

    from app.worker.tasks.efris import issue_efris_receipt
    issue_efris_receipt.delay(str(payment_id))

    return {"queued": True, "payment_id": str(payment_id)}
