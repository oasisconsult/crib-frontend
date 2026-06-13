"""
Eviction notice service — Uganda LTA 2022, §§ 73-78.

Minimum notice periods enforced:
  non_payment / breach : 14 days  (§ 74 — failure to pay / breach of term)
  end_of_term          : 30 days  (§ 76 — periodic tenancy termination)
  redevelopment        : 180 days (§ 77 — demolition / major works)

Only one active (issued / served) notice may exist per lease at a time.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.eviction_notice.model import (
    EvictionNotice,
    EvictionNoticeStatus,
    EvictionNoticeType,
)
from app.features.eviction_notice.schema import (
    EvictionNoticeCreate,
    EvictionNoticeDisputeBody,
    EvictionNoticeOut,
    EvictionNoticeWithdrawBody,
)

log = logging.getLogger(__name__)

_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
_jinja = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)

# Minimum calendar days between issue and effective date (LTA 2022)
_MIN_NOTICE_DAYS: dict[str, int] = {
    EvictionNoticeType.non_payment.value:   14,
    EvictionNoticeType.breach.value:        14,
    EvictionNoticeType.end_of_term.value:   30,
    EvictionNoticeType.redevelopment.value: 180,
}

_ACTIVE_STATUSES = {EvictionNoticeStatus.issued, EvictionNoticeStatus.served}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fmt_dt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _fmt_date(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _to_out(en: EvictionNotice) -> EvictionNoticeOut:
    return EvictionNoticeOut(
        id=str(en.id),
        organisation_id=str(en.organisation_id),
        lease_id=str(en.lease_id),
        property_id=str(en.property_id) if en.property_id else None,
        unit_id=str(en.unit_id) if en.unit_id else None,
        tenant_id=str(en.tenant_id) if en.tenant_id else None,
        issued_by=en.issued_by,
        notice_type=en.notice_type.value,
        status=en.status.value,
        reason=en.reason,
        effective_date=_fmt_date(en.effective_date),
        court_reference=en.court_reference,
        issued_at=_fmt_dt(en.issued_at),
        served_at=_fmt_dt(en.served_at),
        disputed_at=_fmt_dt(en.disputed_at),
        withdrawn_at=_fmt_dt(en.withdrawn_at),
        executed_at=_fmt_dt(en.executed_at),
        notice_pdf_url=en.notice_pdf_url,
        notes=en.notes,
        created_at=en.created_at.isoformat(),
        updated_at=en.updated_at.isoformat(),
    )


async def _get_en(notice_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> EvictionNotice:
    en = await db.scalar(
        select(EvictionNotice).where(
            EvictionNotice.id == notice_id,
            EvictionNotice.organisation_id == org_id,
        )
    )
    if not en:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eviction notice not found")
    return en


# ── PDF generation ─────────────────────────────────────────────────────────────

async def _generate_notice_pdf(en: EvictionNotice, db: AsyncSession) -> str | None:
    try:
        from weasyprint import HTML as WPHtml

        from app.models.lease import Lease
        from app.models.organisation import Organisation
        from app.models.property import Property, Unit
        from app.models.tenant import Tenant

        lease  = await db.scalar(select(Lease).where(Lease.id == en.lease_id))
        org    = await db.scalar(select(Organisation).where(Organisation.id == en.organisation_id))
        prop   = await db.scalar(select(Property).where(Property.id == en.property_id)) if en.property_id else None
        unit   = await db.scalar(select(Unit).where(Unit.id == en.unit_id)) if en.unit_id else None
        tenant = await db.scalar(select(Tenant).where(Tenant.id == en.tenant_id)) if en.tenant_id else None

        prop_address = ""
        if prop and prop.address:
            addr = prop.address if isinstance(prop.address, dict) else {}
            parts = [addr.get("line1"), addr.get("city"), addr.get("state"), addr.get("country")]
            prop_address = ", ".join(p for p in parts if p)

        tenant_name = "Tenant"
        if tenant:
            tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email

        notice_type_labels = {
            "non_payment":   "Non-Payment of Rent",
            "breach":        "Breach of Tenancy Terms",
            "end_of_term":   "End of Tenancy Term",
            "redevelopment": "Redevelopment / Major Works",
        }

        ctx = {
            "notice_ref":       str(en.id)[:8].upper(),
            "org_name":         org.name if org else "Property Management",
            "org_address":      "",
            "property_name":    prop.name if prop else "—",
            "unit_name":        unit.name if unit else "—",
            "property_address": prop_address,
            "tenant_name":      tenant_name,
            "tenant_email":     tenant.email if tenant else "",
            "tenant_phone":     getattr(tenant, "phone", "") or "",
            "currency":         lease.currency if lease else "UGX",
            "notice_type":      notice_type_labels.get(en.notice_type.value, en.notice_type.value),
            "reason":           en.reason,
            "effective_date":   en.effective_date.strftime("%d %B %Y"),
            "issued_date":      en.issued_at.strftime("%d %B %Y"),
            "issued_by_name":   en.issued_by,
            "court_reference":  en.court_reference or "",
            "min_notice_days":  _MIN_NOTICE_DAYS.get(en.notice_type.value, 14),
            "notes":            en.notes or "",
        }

        template = _jinja.get_template("notice.html")
        html_str = template.render(**ctx)

        upload_dir = os.path.join(
            os.getcwd(), "uploads", "documents", "eviction_notices", str(en.id)
        )
        os.makedirs(upload_dir, exist_ok=True)
        pdf_path = os.path.join(upload_dir, "notice.pdf")
        WPHtml(string=html_str).write_pdf(pdf_path)

        return f"/api/v1/upload/local/documents/eviction_notices/{en.id}/notice.pdf"

    except Exception:
        log.warning(
            "eviction_notice.pdf_generation.failed",
            extra={"notice_id": str(en.id)},
            exc_info=True,
        )
        return None


# ── Tenant notification ────────────────────────────────────────────────────────

async def _notify_tenant(en: EvictionNotice, db: AsyncSession, subject: str, body: str) -> None:
    try:
        if not en.tenant_id:
            return

        from app.models.notification import Notification, NotificationState
        from app.models.tenant import Tenant

        tenant = await db.scalar(select(Tenant).where(Tenant.id == en.tenant_id))
        if not tenant or not tenant.email:
            return

        notif = Notification(
            organisation_id=en.organisation_id,
            channel="email",
            state=NotificationState.queued,
            recipient_id=en.tenant_id,
            recipient_email=tenant.email,
            subject=subject,
            body=body,
        )
        db.add(notif)
        await db.flush()

        from app.worker.tasks.notifications import deliver_notification
        deliver_notification.delay(str(notif.id))

    except Exception:
        log.warning(
            "eviction_notice.tenant_notification.failed",
            extra={"notice_id": str(en.id)},
            exc_info=True,
        )


# ── Public API ─────────────────────────────────────────────────────────────────

async def create_notice(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    body: EvictionNoticeCreate,
    issued_by: str,
    db: AsyncSession,
) -> EvictionNoticeOut:
    from app.models.lease import Lease

    # Validate notice type
    try:
        notice_type = EvictionNoticeType(body.notice_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid notice type '{body.notice_type}'. Must be one of: {[t.value for t in EvictionNoticeType]}",
        )

    lease = await db.scalar(
        select(Lease).where(Lease.id == lease_id, Lease.organisation_id == org_id)
    )
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")

    if lease.status.value not in ("active",):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Eviction notices can only be issued on active leases",
        )

    # LTA minimum notice period
    min_days = _MIN_NOTICE_DAYS[notice_type.value]
    today = date.today()
    min_effective = today + timedelta(days=min_days)
    if body.effective_date < min_effective:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Effective date must be at least {min_days} days from today "
                f"for a '{notice_type.value}' notice (≥ {min_effective.isoformat()}) "
                f"— Uganda LTA 2022"
            ),
        )

    # redevelopment requires court_reference
    if notice_type == EvictionNoticeType.redevelopment and not body.court_reference:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A court reference number is required for redevelopment eviction notices",
        )

    # Only one active notice per lease
    existing = await db.scalar(
        select(EvictionNotice).where(
            EvictionNotice.lease_id == lease_id,
            EvictionNotice.status.in_([s.value for s in _ACTIVE_STATUSES]),
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is already an active eviction notice for this lease",
        )

    now = datetime.now(tz=timezone.utc)
    en = EvictionNotice(
        organisation_id=org_id,
        lease_id=lease_id,
        property_id=lease.property_id,
        unit_id=lease.unit_id,
        tenant_id=lease.tenant_id,
        issued_by=issued_by,
        notice_type=notice_type,
        status=EvictionNoticeStatus.issued,
        reason=body.reason,
        effective_date=body.effective_date,
        court_reference=body.court_reference,
        issued_at=now,
        notes=body.notes,
    )
    db.add(en)
    await db.flush()

    pdf_url = await _generate_notice_pdf(en, db)
    if pdf_url:
        en.notice_pdf_url = pdf_url

    await db.commit()
    await db.refresh(en)

    _schedule_reminder(en)

    tenant = None
    if en.tenant_id:
        from app.models.tenant import Tenant
        tenant = await db.scalar(select(Tenant).where(Tenant.id == en.tenant_id))
    tenant_name = "Tenant"
    if tenant:
        tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email

    await _notify_tenant(
        en, db,
        subject="Eviction Notice Issued",
        body=(
            f"Dear {tenant_name},\n\n"
            f"An eviction notice has been issued for your tenancy. "
            f"You are required to vacate the premises by {en.effective_date.strftime('%d %B %Y')}.\n\n"
            f"Reason: {en.reason}\n\n"
            f"Please log in to your tenant portal or contact your landlord for details. "
            f"You have the right to dispute this notice under the Uganda Landlord & Tenant Act 2022."
        ),
    )

    return _to_out(en)


async def list_notices(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> list[EvictionNoticeOut]:
    rows = await db.scalars(
        select(EvictionNotice)
        .where(EvictionNotice.lease_id == lease_id, EvictionNotice.organisation_id == org_id)
        .order_by(EvictionNotice.issued_at.desc())
    )
    return [_to_out(en) for en in rows]


async def get_notice(
    notice_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> EvictionNoticeOut:
    return _to_out(await _get_en(notice_id, org_id, db))


async def serve_notice(
    notice_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> EvictionNoticeOut:
    en = await _get_en(notice_id, org_id, db)
    if en.status != EvictionNoticeStatus.issued:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot mark as served — notice is in status '{en.status.value}'",
        )
    en.status = EvictionNoticeStatus.served
    en.served_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await db.refresh(en)
    return _to_out(en)


async def dispute_notice(
    notice_id: uuid.UUID,
    org_id: uuid.UUID,
    body: EvictionNoticeDisputeBody,
    db: AsyncSession,
) -> EvictionNoticeOut:
    en = await _get_en(notice_id, org_id, db)
    if en.status not in _ACTIVE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot dispute a notice in status '{en.status.value}'",
        )
    en.status = EvictionNoticeStatus.disputed
    en.disputed_at = datetime.now(tz=timezone.utc)
    if body.grounds:
        en.notes = (en.notes or "") + f"\n\nDispute grounds: {body.grounds}"
    await db.commit()
    await db.refresh(en)
    return _to_out(en)


async def withdraw_notice(
    notice_id: uuid.UUID,
    org_id: uuid.UUID,
    body: EvictionNoticeWithdrawBody,
    db: AsyncSession,
) -> EvictionNoticeOut:
    en = await _get_en(notice_id, org_id, db)
    if en.status not in _ACTIVE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot withdraw a notice in status '{en.status.value}'",
        )
    en.status = EvictionNoticeStatus.withdrawn
    en.withdrawn_at = datetime.now(tz=timezone.utc)
    if body.reason:
        en.notes = (en.notes or "") + f"\n\nWithdrawal reason: {body.reason}"
    await db.commit()
    await db.refresh(en)
    return _to_out(en)


async def execute_notice(
    notice_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> EvictionNoticeOut:
    en = await _get_en(notice_id, org_id, db)
    if en.status != EvictionNoticeStatus.served:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A notice must be served before it can be marked as executed",
        )
    if date.today() < en.effective_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"The notice effective date is {en.effective_date.isoformat()} — "
                "execution cannot be recorded before the effective date"
            ),
        )
    en.status = EvictionNoticeStatus.executed
    en.executed_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await db.refresh(en)
    return _to_out(en)


# ── Internal helpers ───────────────────────────────────────────────────────────

def _schedule_reminder(en: EvictionNotice) -> None:
    try:
        from app.features.eviction_notice.tasks import send_eviction_reminder

        effective_dt = datetime.combine(
            en.effective_date, datetime.min.time()
        ).replace(tzinfo=timezone.utc)

        for days_before in (14, 7):
            reminder_dt = effective_dt - timedelta(days=days_before)
            if reminder_dt > datetime.now(tz=timezone.utc):
                send_eviction_reminder.apply_async(
                    args=[str(en.id), days_before],
                    eta=reminder_dt,
                )
    except Exception:
        log.warning(
            "eviction_notice.task_scheduling.failed",
            extra={"notice_id": str(en.id)},
            exc_info=True,
        )
