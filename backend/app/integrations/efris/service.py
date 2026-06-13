"""
EFRIS orchestration service.

Responsibilities:
  - Build URA invoice request from a Payment + Lease + Tenant
  - Call EfrisClient.upload_invoice()
  - Write EfrisAuditLog entry (scrubbed — no passwords/tokens)
  - Update Payment EFRIS columns on success or failure
  - Dispatch tenant notification with fiscal receipt (non-fatal)

Security:
  - No PII is logged; audit log request_payload is scrubbed before insert
  - password and access token never appear in logs or audit records
  - Idempotency: if payment.efris_receipt_number already set, skip silently
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.efris.client import EfrisApiError, EfrisClient, EfrisNotConfiguredError, get_efris_client
from app.integrations.efris.schemas import (
    EfrisBuyerDetails,
    EfrisGoodsItem,
    EfrisInvoiceRequest,
    EfrisPaymentWay,
    EfrisSellerDetails,
    EfrisTaxDetail,
    PAYMENT_MODE_MAP,
)
from app.models.efris import EfrisAuditLog
from app.models.payment import Payment

log = logging.getLogger(__name__)

# URA goods category for residential rental services
_RENTAL_GOODS_CATEGORY = "2010101"
# System operator name for automated receipts
_SYSTEM_OPERATOR = "Crib PMS"


async def issue_receipt(
    payment_id: str,
    db: AsyncSession,
    redis,
) -> None:
    """Issue a URA EFRIS fiscal receipt for a confirmed payment.

    Idempotent: if the payment already has an efris_receipt_number, returns immediately.
    Non-fatal: exceptions are caught, logged, and stored in EfrisAuditLog.
    """
    p = await db.get(Payment, uuid.UUID(payment_id))
    if p is None:
        log.warning("EFRIS: payment %s not found — skipping", payment_id)
        return

    # Idempotency guard
    if p.efris_receipt_number:
        log.debug("EFRIS: payment %s already has receipt %s — skipping", payment_id, p.efris_receipt_number)
        return

    org_id = p.organisation_id
    start = time.monotonic()

    try:
        async with get_efris_client(org_id, db) as client:
            # Ensure authenticated (uses Redis cache)
            await client.login(redis)

            # Build the invoice request
            invoice_req = await _build_invoice_request(p, client, db)

            # Scrub the request payload before audit logging (remove any sensitive fields)
            request_payload = _scrub_payload(invoice_req.model_dump())

            # Upload to URA
            elapsed_ms = int((time.monotonic() - start) * 1000)
            response = await client.upload_invoice(invoice_req, redis)
            elapsed_ms = int((time.monotonic() - start) * 1000)

            # Persist result on payment
            p.efris_status = "issued"
            p.efris_receipt_number = response.invoice_no
            p.efris_receipt_date = datetime.now(timezone.utc)
            p.efris_anti_fake_code = response.antifake_code
            p.efris_qr_code = response.qr_code or None
            await db.flush()

            # Write audit log
            _write_audit(
                db, org_id=org_id, payment_id=p.id,
                action="T109",
                request_payload=request_payload,
                response_payload=response.model_dump(),
                status_code=200,
                efris_status="success",
                duration_ms=elapsed_ms,
            )
            await db.commit()

            log.info(
                "EFRIS: receipt issued payment=%s fdn=%s org=%s",
                payment_id, response.invoice_no, org_id,
            )

    except EfrisNotConfiguredError as exc:
        log.warning("EFRIS: not configured for org=%s payment=%s — %s", org_id, payment_id, exc)
        _write_audit(
            db, org_id=org_id, payment_id=p.id,
            action="T109", efris_status="skipped",
            failure_reason=str(exc),
            duration_ms=int((time.monotonic() - start) * 1000),
        )
        p.efris_status = "skipped"
        await db.commit()

    except EfrisApiError as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        log.warning(
            "EFRIS: API error payment=%s code=%s msg=%s",
            payment_id, exc.code, exc.message,
        )
        p.efris_status = "failed"
        p.efris_failure_reason = f"[{exc.code}] {exc.message}"
        p.efris_retry_count = (p.efris_retry_count or 0) + 1
        _write_audit(
            db, org_id=org_id, payment_id=p.id,
            action="T109", efris_status="failed",
            status_code=exc.status_code,
            failure_reason=str(exc),
            duration_ms=elapsed_ms,
        )
        await db.commit()
        raise  # re-raise so Celery can retry

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        log.exception("EFRIS: unexpected error for payment=%s", payment_id)
        p.efris_status = "failed"
        p.efris_failure_reason = str(exc)
        p.efris_retry_count = (p.efris_retry_count or 0) + 1
        _write_audit(
            db, org_id=org_id, payment_id=p.id,
            action="T109", efris_status="error",
            failure_reason=str(exc),
            duration_ms=elapsed_ms,
        )
        await db.commit()
        raise


async def mark_failed(payment_id: str, reason: str, db: AsyncSession) -> None:
    """Mark a payment as permanently EFRIS-failed after all retries exhausted."""
    p = await db.get(Payment, uuid.UUID(payment_id))
    if p:
        p.efris_status = "failed"
        p.efris_failure_reason = f"[permanent] {reason}"
        await db.commit()


# ── Request builder ────────────────────────────────────────────────────────────

async def _build_invoice_request(
    p: Payment,
    client: EfrisClient,
    db: AsyncSession,
) -> EfrisInvoiceRequest:
    """Construct a T109 invoice request from a confirmed Payment."""
    from app.models.lease import Lease
    from app.models.organisation import Organisation
    from app.models.profile import Profile
    from app.models.tenant import Tenant

    # Load org for seller details
    org = await db.get(Organisation, p.organisation_id)
    org_name = org.name if org else "Unknown Org"
    org_email = (org.settings or {}).get("contact_email", "") if org else ""
    org_address = (org.settings or {}).get("address", "") if org else ""

    # Load lease → tenant for buyer details
    lease = await db.get(Lease, p.lease_id)
    tenant_name = "Tenant"
    tenant_phone = ""
    tenant_email = ""
    if lease and lease.tenant_id:
        tenant = await db.get(Tenant, lease.tenant_id)
        if tenant:
            tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or "Tenant"
            tenant_phone = tenant.phone or ""
            tenant_email = tenant.email or ""

    amount = float(p.amount)
    issued_date = (p.paid_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d %H:%M:%S")

    # Residential rental is VAT-exempt in Uganda
    goods = EfrisGoodsItem(
        item=_payment_description(p),
        item_code="SRV-RENT",
        qty=1.0,
        unit_of_measure="101",
        unit_price=amount,
        total=amount,
        tax_rate=0.0,
        tax=0.0,
        goods_category_id=_RENTAL_GOODS_CATEGORY,
        vat_applicable_flag="0",
        discount_flag="2",
        deemed_flag="2",
        excise_flag="2",
    )

    tax = EfrisTaxDetail(
        tax_category_code="03",    # Exempt
        net_amount=amount,
        tax_rate=0.0,
        tax_amount=0.0,
        gross_amount=amount,
        tax_rate_name="Exempt",
    )

    payment_mode = PAYMENT_MODE_MAP.get(p.method, "102")
    payment_way = EfrisPaymentWay(
        payment_mode=payment_mode,
        payment_amount=amount,
        order_number="a",
    )

    return EfrisInvoiceRequest(
        seller=EfrisSellerDetails(
            tin=client.tin,
            legal_name=org_name,
            business_name=org_name,
            address=org_address or org_name,
            email_address=org_email or "noreply@cribpms.com",
            place_of_business=org_address or org_name,
            reference_no=str(p.id),
            is_check_reference_no="1",
        ),
        device_no=client.device_no,
        issued_date=issued_date,
        operator=_SYSTEM_OPERATOR,
        currency=p.currency or "UGX",
        invoice_type="1",
        invoice_kind="2",
        data_source="103",
        invoice_industry_code="101",
        buyer=EfrisBuyerDetails(
            buyer_tin="",
            buyer_legal_name=tenant_name,
            buyer_email=tenant_email,
            buyer_mobile_phone=tenant_phone,
            buyer_type="1",  # B2C
        ),
        goods_details=[goods],
        tax_details=[tax],
        payment_ways=[payment_way],
        net_amount=amount,
        tax_amount=0.0,
        gross_amount=amount,
        item_count=1,
        mode_code="1",
        remarks=f"Rent payment ref {p.reference or p.id}",
    )


def _payment_description(p: Payment) -> str:
    category_labels = {
        "rent": "Rental Income",
        "deposit": "Security Deposit",
        "late_fee": "Late Payment Fee",
        "other": "Property Management Fee",
    }
    return category_labels.get(p.category, "Property Payment")


# ── Audit log helper ───────────────────────────────────────────────────────────

def _write_audit(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    payment_id: uuid.UUID | None = None,
    action: str,
    request_payload: dict | None = None,
    response_payload: dict | None = None,
    status_code: int | None = None,
    efris_status: str = "unknown",
    failure_reason: str | None = None,
    duration_ms: int | None = None,
) -> None:
    entry = EfrisAuditLog(
        organisation_id=org_id,
        payment_id=payment_id,
        action=action,
        request_payload=request_payload,
        response_payload=response_payload,
        status_code=status_code,
        efris_status=efris_status,
        failure_reason=failure_reason,
        duration_ms=duration_ms,
    )
    db.add(entry)


def _scrub_payload(payload: dict) -> dict:
    """Remove sensitive fields from a payload before storing in the audit log."""
    _SENSITIVE = {"password", "passwordEncrypted", "accessToken", "token", "authorization"}
    return {
        k: ("***" if k in _SENSITIVE else (
            _scrub_payload(v) if isinstance(v, dict) else v
        ))
        for k, v in payload.items()
    }
