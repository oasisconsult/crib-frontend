"""
Statement PDF generation service.

Generates a WeasyPrint PDF rent statement for a lease, optionally filtered to
a single calendar month (YYYY-MM). When no month is supplied the statement
covers the full lease history.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
_jinja = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)

_PAID_STATUSES = {"confirmed", "completed", "reconciled", "allocated"}


def _fmt_date(d: date | datetime | None) -> str:
    if d is None:
        return "—"
    if hasattr(d, "date"):
        d = d.date()  # type: ignore[union-attr]
    return d.strftime("%d %b %Y") if hasattr(d, "strftime") else str(d)


def _fmt_method(method: str | None) -> str:
    if not method:
        return "—"
    return method.replace("_", " ").title()


async def generate_statement_pdf(
    lease_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
    month: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> bytes:
    """
    Render a rent statement to PDF bytes.

    date_from / date_to — inclusive date range filter on period_start.
    month               — legacy single-month filter (YYYY-MM); ignored when
                          date_from/date_to are supplied.
    date_to defaults to today so future unpaid schedules are never shown.
    """
    from weasyprint import HTML as WPHtml  # type: ignore[import]

    from app.models.lease import Lease
    from app.models.organisation import Organisation
    from app.models.payment import Payment, RentSchedule
    from app.models.property import Property, Unit
    from app.models.tenant import Tenant

    # ── fetch lease ──────────────────────────────────────────────────────────
    filters = [Lease.id == lease_id, Lease.deleted_at.is_(None)]
    if org_id is not None:
        filters.append(Lease.organisation_id == org_id)
    lease = await db.scalar(select(Lease).where(*filters))
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")

    org    = await db.scalar(select(Organisation).where(Organisation.id == lease.organisation_id))
    prop   = await db.scalar(select(Property).where(Property.id == lease.property_id)) if lease.property_id else None
    unit   = await db.scalar(select(Unit).where(Unit.id == lease.unit_id)) if lease.unit_id else None
    tenant = await db.scalar(select(Tenant).where(Tenant.id == lease.tenant_id)) if lease.tenant_id else None

    # ── resolve date range ────────────────────────────────────────────────────
    # Prefer explicit date_from/date_to; fall back to legacy month param.
    today = date.today()
    if date_from is None and date_to is None and month:
        try:
            year, mon = (int(x) for x in month.split("-"))
            date_from = date(year, mon, 1)
            date_to   = date(year + 1, 1, 1) - timedelta(days=1) if mon == 12 else date(year, mon + 1, 1) - timedelta(days=1)
        except (ValueError, AttributeError):
            pass
    # Default the upper bound to today so future schedules are excluded.
    if date_to is None:
        date_to = today

    # ── fetch schedules ───────────────────────────────────────────────────────
    sched_q = (
        select(RentSchedule)
        .where(RentSchedule.lease_id == lease_id)
        .order_by(RentSchedule.due_date.asc())
    )
    if date_from is not None:
        sched_q = sched_q.where(RentSchedule.period_start >= date_from)
    sched_q = sched_q.where(RentSchedule.period_start <= date_to)

    schedules = list((await db.execute(sched_q)).scalars().all())

    # ── fetch confirmed payments for lease ───────────────────────────────────
    all_payments: list[Payment] = list(
        (await db.execute(
            select(Payment).where(
                Payment.lease_id == lease_id,
                Payment.category == "rent",
                Payment.status.in_(list(_PAID_STATUSES)),
            ).order_by(Payment.paid_at.asc())
        )).scalars().all()
    )

    def _payment_for(s: RentSchedule) -> Payment | None:
        window_end = s.due_date + timedelta(days=45)
        for p in all_payments:
            if p.rent_schedule_id == s.id:
                return p
        for p in all_payments:
            if p.rent_schedule_id is not None:
                continue
            if p.paid_at is None:
                continue
            paid_dt = p.paid_at.date() if hasattr(p.paid_at, "date") else p.paid_at
            if s.period_start <= paid_dt <= window_end:
                return p
        return None

    # ── build table rows ──────────────────────────────────────────────────────
    rows: list[dict[str, Any]] = []
    running: float = 0.0
    total_due:  float = 0.0
    total_paid: float = 0.0

    for s in schedules:
        p           = _payment_for(s)
        amount_due  = float(s.amount_due)
        late_fee    = float(s.late_fee_applied) if s.late_fee_applied else 0.0
        charge      = amount_due + late_fee
        amount_paid = float(p.amount) if p else 0.0
        running     = round(running + charge - amount_paid, 2)
        total_due  += charge
        total_paid += amount_paid

        paid_dt: date | None = None
        if p and p.paid_at:
            paid_dt = p.paid_at.date() if hasattr(p.paid_at, "date") else p.paid_at

        if p:
            if amount_paid >= charge:
                row_status = "late" if paid_dt and paid_dt > s.due_date else "paid"
            elif amount_paid > 0:
                row_status = "partial"
            else:
                row_status = "unpaid"
        else:
            row_status = "unpaid"

        ps = s.period_start
        if ps and isinstance(ps, str):
            try:
                ps = date.fromisoformat(ps)
            except ValueError:
                ps = None
        period_label = ps.strftime("%b %Y") if isinstance(ps, date) else (s.reference or "")

        raw_method = p.method if p else None
        method_str = _fmt_method(raw_method.value if raw_method is not None and hasattr(raw_method, "value") else (str(raw_method) if raw_method else None))

        rows.append({
            "period":      period_label,
            "due_date":    _fmt_date(s.due_date),
            "amount_due":  charge,
            "amount_paid": amount_paid if p else None,
            "paid_at":     _fmt_date(paid_dt),
            "method":      method_str,
            "balance":     running,
            "status":      row_status,
        })

    # ── org contact ───────────────────────────────────────────────────────────
    org_name = (org.name if org else None) or "Property Management"
    settings = (org.settings or {}) if org else {}
    contact_parts = [
        settings.get("agency.contact_email"),
        settings.get("agency.contact_phone"),
    ]
    org_contact = "  |  ".join(x for x in contact_parts if x)

    # ── property address ──────────────────────────────────────────────────────
    prop_address = ""
    if prop and prop.address:
        addr = prop.address if isinstance(prop.address, dict) else {}
        prop_address = ", ".join(x for x in [
            addr.get("line1"), addr.get("city"), addr.get("state"), addr.get("country")
        ] if x)

    # ── tenant ────────────────────────────────────────────────────────────────
    if tenant:
        tenant_name  = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email
        tenant_email = tenant.email or ""
        tenant_phone = tenant.phone or ""
    else:
        tenant_name, tenant_email, tenant_phone = "Tenant", "", ""

    # ── period label ─────────────────────────────────────────────────────────
    if rows:
        first, last = rows[0]["period"], rows[-1]["period"]
        display_period = first if first == last else f"{first} – {last}"
    else:
        display_period = "Full History"

    ctx = {
        "org_name":        org_name,
        "org_contact":     org_contact,
        "lease_ref":       str(lease.id)[:8].upper(),
        "generated_at":    datetime.now(timezone.utc).strftime("%d %B %Y at %H:%M UTC"),
        "tenant_name":     tenant_name,
        "tenant_email":    tenant_email,
        "tenant_phone":    tenant_phone,
        "property_name":   prop.name if prop else "—",
        "unit_name":       unit.name if unit else None,
        "property_address": prop_address,
        "lease_start":     _fmt_date(lease.start_date),
        "lease_end":       _fmt_date(lease.end_date) if lease.end_date else None,
        "monthly_rent":    float(lease.monthly_rent),
        "currency":        lease.currency,
        "period_label":    display_period,
        "rows":            rows,
        "total_due":       total_due,
        "total_paid":      total_paid,
        "closing_balance": round(running, 2),
    }

    html_str = _jinja.get_template("monthly_statement.html").render(**ctx)
    return WPHtml(string=html_str).write_pdf()
