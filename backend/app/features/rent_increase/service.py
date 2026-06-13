"""
Rent increase service — Uganda LTA 2022.

Rules enforced here:
  - new_rent > current_rent
  - increase % ≤ 10%  (LTA 2022 §38)
  - effective_date ≥ today + 90 days  (LTA 2022 §38)
  - only one active (pending_ack / acknowledged) notice per lease at a time
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

from app.features.rent_increase.model import RentIncrease, RentIncreaseStatus
from app.features.rent_increase.schema import RentIncreaseCreate, RentIncreaseOut, RentIncreaseWithdraw

log = logging.getLogger(__name__)

_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
_jinja = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)

LTA_MAX_INCREASE_PCT = 10.0
LTA_MIN_NOTICE_DAYS  = 90


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_dt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _fmt_date(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _to_out(ri: RentIncrease) -> RentIncreaseOut:
    return RentIncreaseOut(
        id=str(ri.id),
        organisation_id=str(ri.organisation_id),
        lease_id=str(ri.lease_id),
        property_id=str(ri.property_id) if ri.property_id else None,
        unit_id=str(ri.unit_id) if ri.unit_id else None,
        tenant_id=str(ri.tenant_id) if ri.tenant_id else None,
        issued_by=ri.issued_by,
        status=ri.status.value,
        current_rent=float(ri.current_rent),
        new_rent=float(ri.new_rent),
        increase_pct=float(ri.increase_pct),
        effective_date=_fmt_date(ri.effective_date),
        issued_at=_fmt_dt(ri.issued_at),
        acknowledged_at=_fmt_dt(ri.acknowledged_at),
        applied_at=_fmt_dt(ri.applied_at),
        withdrawn_at=_fmt_dt(ri.withdrawn_at),
        notice_pdf_url=ri.notice_pdf_url,
        notes=ri.notes,
        created_at=ri.created_at.isoformat(),
        updated_at=ri.updated_at.isoformat(),
    )


async def _get_ri(increase_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> RentIncrease:
    ri = await db.scalar(
        select(RentIncrease).where(
            RentIncrease.id == increase_id,
            RentIncrease.organisation_id == org_id,
        )
    )
    if not ri:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rent increase not found")
    return ri


# ── PDF generation ─────────────────────────────────────────────────────────────

async def _generate_notice_pdf(ri: RentIncrease, db: AsyncSession) -> str | None:
    """
    Render the Jinja2 notice template to HTML and convert to PDF via WeasyPrint.
    Returns the local serve URL or None on failure (non-fatal — notice is still created).
    """
    try:
        from weasyprint import HTML as WPHtml

        from app.models.lease import Lease
        from app.models.organisation import Organisation
        from app.models.property import Property, Unit
        from app.models.tenant import Tenant

        lease = await db.scalar(select(Lease).where(Lease.id == ri.lease_id))
        org   = await db.scalar(select(Organisation).where(Organisation.id == ri.organisation_id))
        prop  = await db.scalar(select(Property).where(Property.id == ri.property_id)) if ri.property_id else None
        unit  = await db.scalar(select(Unit).where(Unit.id == ri.unit_id)) if ri.unit_id else None
        tenant = await db.scalar(select(Tenant).where(Tenant.id == ri.tenant_id)) if ri.tenant_id else None

        # Build address string
        prop_address = ""
        if prop and prop.address:
            addr = prop.address if isinstance(prop.address, dict) else {}
            parts = [addr.get("line1"), addr.get("city"), addr.get("state"), addr.get("country")]
            prop_address = ", ".join(p for p in parts if p)

        tenant_name = "Tenant"
        if tenant:
            tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email

        ctx = {
            "notice_ref":     str(ri.id)[:8].upper(),
            "org_name":       org.name if org else "Property Management",
            "org_address":    "",
            "property_name":  prop.name if prop else "—",
            "unit_name":      unit.name if unit else "—",
            "property_address": prop_address,
            "tenant_name":    tenant_name,
            "tenant_email":   tenant.email if tenant else "",
            "tenant_phone":   getattr(tenant, "phone", "") or "",
            "currency":       lease.currency if lease else "UGX",
            "current_rent":   float(ri.current_rent),
            "new_rent":       float(ri.new_rent),
            "increase_pct":   float(ri.increase_pct),
            "effective_date": ri.effective_date.strftime("%d %B %Y"),
            "issued_date":    ri.issued_at.strftime("%d %B %Y"),
            "issued_by_name": ri.issued_by,
            "notes":          ri.notes or "",
        }

        template = _jinja.get_template("notice.html")
        html_str = template.render(**ctx)

        upload_dir = os.path.join(os.getcwd(), "uploads", "documents", "rent_increases", str(ri.id))
        os.makedirs(upload_dir, exist_ok=True)
        pdf_path = os.path.join(upload_dir, "notice.pdf")

        WPHtml(string=html_str).write_pdf(pdf_path)

        return f"/api/v1/upload/local/documents/rent_increases/{ri.id}/notice.pdf"

    except Exception:
        log.warning("rent_increase.pdf_generation.failed", extra={"increase_id": str(ri.id)}, exc_info=True)
        return None


# ── Public API ─────────────────────────────────────────────────────────────────

async def create_increase(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    body: RentIncreaseCreate,
    issued_by: str,
    db: AsyncSession,
) -> RentIncreaseOut:
    from app.models.lease import Lease

    lease = await db.scalar(
        select(Lease).where(Lease.id == lease_id, Lease.organisation_id == org_id)
    )
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")

    if lease.status.value not in ("active",):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Rent increases can only be issued on active leases",
        )

    # Validate increase amount
    current_rent = float(lease.monthly_rent)
    new_rent = body.new_rent
    if new_rent <= current_rent:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New rent must be greater than current rent",
        )

    increase_pct = (new_rent - current_rent) / current_rent * 100
    if increase_pct > LTA_MAX_INCREASE_PCT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Increase of {increase_pct:.2f}% exceeds the Uganda LTA 2022 cap of {LTA_MAX_INCREASE_PCT}%",
        )

    # Validate notice period
    today = date.today()
    min_effective = today + timedelta(days=LTA_MIN_NOTICE_DAYS)
    if body.effective_date < min_effective:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Effective date must be at least {LTA_MIN_NOTICE_DAYS} days from today (≥ {min_effective.isoformat()})",
        )

    # Only one active notice per lease
    existing = await db.scalar(
        select(RentIncrease).where(
            RentIncrease.lease_id == lease_id,
            RentIncrease.status.in_([RentIncreaseStatus.pending_ack, RentIncreaseStatus.acknowledged]),
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is already an active rent increase notice for this lease",
        )

    now = datetime.now(tz=timezone.utc)
    ri = RentIncrease(
        organisation_id=org_id,
        lease_id=lease_id,
        property_id=lease.property_id,
        unit_id=lease.unit_id,
        tenant_id=lease.tenant_id,
        issued_by=issued_by,
        status=RentIncreaseStatus.pending_ack,
        current_rent=current_rent,
        new_rent=new_rent,
        increase_pct=round(increase_pct, 2),
        effective_date=body.effective_date,
        issued_at=now,
        notes=body.notes,
    )
    db.add(ri)
    await db.flush()  # populate ri.id

    # Generate PDF (non-fatal)
    pdf_url = await _generate_notice_pdf(ri, db)
    if pdf_url:
        ri.notice_pdf_url = pdf_url

    await db.commit()
    await db.refresh(ri)

    # Schedule Celery tasks for application and reminders
    _schedule_tasks(ri)

    # Queue tenant notification
    await _notify_tenant_issued(ri, db)

    return _to_out(ri)


async def list_increases(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> list[RentIncreaseOut]:
    rows = await db.scalars(
        select(RentIncrease)
        .where(RentIncrease.lease_id == lease_id, RentIncrease.organisation_id == org_id)
        .order_by(RentIncrease.issued_at.desc())
    )
    return [_to_out(ri) for ri in rows]


async def get_increase(
    increase_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> RentIncreaseOut:
    ri = await _get_ri(increase_id, org_id, db)
    return _to_out(ri)


async def acknowledge_increase(
    increase_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> RentIncreaseOut:
    ri = await _get_ri(increase_id, org_id, db)
    if ri.status != RentIncreaseStatus.pending_ack:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot acknowledge a notice in status '{ri.status.value}'",
        )
    ri.status = RentIncreaseStatus.acknowledged
    ri.acknowledged_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await db.refresh(ri)
    return _to_out(ri)


async def withdraw_increase(
    increase_id: uuid.UUID,
    org_id: uuid.UUID,
    body: RentIncreaseWithdraw,
    db: AsyncSession,
) -> RentIncreaseOut:
    ri = await _get_ri(increase_id, org_id, db)
    if ri.status in (RentIncreaseStatus.applied, RentIncreaseStatus.withdrawn):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot withdraw a notice in status '{ri.status.value}'",
        )
    ri.status = RentIncreaseStatus.withdrawn
    ri.withdrawn_at = datetime.now(tz=timezone.utc)
    if body.reason:
        ri.notes = (ri.notes or "") + f"\n\nWithdrawal reason: {body.reason}"
    await db.commit()
    await db.refresh(ri)
    return _to_out(ri)


async def apply_increase(increase_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Called by Celery task on effective_date.
    Updates the lease monthly_rent and marks the notice applied.
    """
    from app.models.lease import Lease

    ri = await db.scalar(select(RentIncrease).where(RentIncrease.id == increase_id))
    if not ri or ri.status in (RentIncreaseStatus.withdrawn, RentIncreaseStatus.applied):
        return

    lease = await db.scalar(select(Lease).where(Lease.id == ri.lease_id))
    if lease:
        lease.monthly_rent = ri.new_rent

    ri.status = RentIncreaseStatus.applied
    ri.applied_at = datetime.now(tz=timezone.utc)
    await db.commit()
    log.info("rent_increase.applied", extra={"increase_id": str(increase_id), "new_rent": str(ri.new_rent)})


# ── Internal helpers ───────────────────────────────────────────────────────────

def _schedule_tasks(ri: RentIncrease) -> None:
    """Schedule the apply task and 30/60-day reminder tasks via Celery eta."""
    try:
        from app.features.rent_increase.tasks import (
            apply_rent_increase,
            send_rent_increase_reminder,
        )

        effective_dt = datetime.combine(ri.effective_date, datetime.min.time()).replace(tzinfo=timezone.utc)

        # Apply on the effective date
        apply_rent_increase.apply_async(
            args=[str(ri.id)],
            eta=effective_dt,
        )

        # Reminders at 60 and 30 days before effective date
        for days_before in (60, 30):
            reminder_dt = effective_dt - timedelta(days=days_before)
            if reminder_dt > datetime.now(tz=timezone.utc):
                send_rent_increase_reminder.apply_async(
                    args=[str(ri.id), days_before],
                    eta=reminder_dt,
                )
    except Exception:
        log.warning("rent_increase.task_scheduling.failed", extra={"increase_id": str(ri.id)}, exc_info=True)


async def _notify_tenant_issued(ri: RentIncrease, db: AsyncSession) -> None:
    """Send a notification to the tenant that a rent increase notice has been issued."""
    try:
        if not ri.tenant_id:
            return

        from app.models.tenant import Tenant
        from app.models.notification import Notification, NotificationState

        tenant = await db.scalar(select(Tenant).where(Tenant.id == ri.tenant_id))
        if not tenant or not tenant.email:
            return

        tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email

        body = (
            f"Dear {tenant_name},\n\n"
            f"Your landlord has issued a rent increase notice. "
            f"Your monthly rent will change from {ri.current_rent:,.0f} to {ri.new_rent:,.0f} "
            f"effective {ri.effective_date.strftime('%d %B %Y')}.\n\n"
            f"Please log in to your tenant portal to view and acknowledge the notice."
        )

        notif = Notification(
            organisation_id=ri.organisation_id,
            channel="email",
            state=NotificationState.queued,
            recipient_id=ri.tenant_id,
            recipient_email=tenant.email,
            subject="Rent Increase Notice",
            body=body,
        )
        db.add(notif)
        await db.flush()

        from app.worker.tasks.notifications import deliver_notification
        deliver_notification.delay(str(notif.id))
    except Exception:
        log.warning("rent_increase.tenant_notification.failed", extra={"increase_id": str(ri.id)}, exc_info=True)
