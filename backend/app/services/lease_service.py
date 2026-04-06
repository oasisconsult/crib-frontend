"""
Business logic for Leases.

Lifecycle transitions:
  create_lease   → draft
  activate_lease → draft → active   (side-effects: unit + tenant cached FKs)
  terminate_lease→ active → terminated
  expire_lease   → active → expired
  renew_lease    → active/expired → new draft (renewal_of_lease_id set)

All write operations flush + refresh to avoid MissingGreenlet / AttributeError
from server-side updated_at trigger and string→enum coercion.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease, LeaseStatus
from app.models.property import Property, Unit, UnitStatus
from app.models.tenant import OnboardingState, Tenant, TenantStatus
from app.schemas.lease import (
    LeaseActivate,
    LeaseCreate,
    LeaseOut,
    LeaseRenewRequest,
    LeaseTerminate,
    LeaseUpdate,
)


# ── Serialiser ─────────────────────────────────────────────────────────────────

def _lease_out(lease: Lease) -> LeaseOut:
    def _d(v) -> str | None:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)           # date → ISO string

    return LeaseOut(
        id=str(lease.id),
        organisation_id=str(lease.organisation_id),
        property_id=str(lease.property_id),
        unit_id=str(lease.unit_id) if lease.unit_id else None,
        tenant_id=str(lease.tenant_id) if lease.tenant_id else None,
        status=lease.status if isinstance(lease.status, str) else lease.status.value,
        start_date=str(lease.start_date),
        end_date=str(lease.end_date) if lease.end_date else None,
        is_rolling=lease.end_date is None,
        monthly_rent=float(lease.monthly_rent),
        currency=lease.currency,
        deposit_amount=float(lease.deposit_amount) if lease.deposit_amount is not None else None,
        deposit_paid=lease.deposit_paid,
        deposit_paid_at=_d(lease.deposit_paid_at),
        rent_day_of_month=lease.rent_day_of_month,
        grace_period_days=lease.grace_period_days,
        late_fee_type=lease.late_fee_type,
        late_fee_value=float(lease.late_fee_value),
        notice_period_days=lease.notice_period_days,
        signed_at=_d(lease.signed_at),
        notice_given_at=_d(lease.notice_given_at),
        terminated_at=_d(lease.terminated_at),
        termination_reason=lease.termination_reason,
        renewal_of_lease_id=str(lease.renewal_of_lease_id) if lease.renewal_of_lease_id else None,
        notes=lease.notes,
        created_at=lease.created_at.isoformat(),
        updated_at=lease.updated_at.isoformat(),
    )


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_lease(lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> Lease:
    result = await db.execute(
        select(Lease).where(Lease.id == lease_id, Lease.organisation_id == org_id)
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    return lease


def _effective_rules(unit: Unit, prop: Property) -> dict:
    """Return the unit's rules if set, otherwise fall back to the property's rules."""
    return unit.rules or prop.rules or {}


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def create_lease(body: LeaseCreate, org_id: uuid.UUID, db: AsyncSession) -> LeaseOut:
    # Load + validate unit
    unit_result = await db.execute(
        select(Unit)
        .join(Property, Unit.property_id == Property.id)
        .where(Unit.id == uuid.UUID(body.unit_id), Property.organisation_id == org_id)
    )
    unit = unit_result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    prop_result = await db.execute(
        select(Property).where(Property.id == unit.property_id)
    )
    prop = prop_result.scalar_one()

    # Load + validate tenant
    tenant_result = await db.execute(
        select(Tenant).where(
            Tenant.id == uuid.UUID(body.tenant_id),
            Tenant.organisation_id == org_id,
        )
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if tenant.onboarding_state not in (OnboardingState.approved, OnboardingState.activated):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tenant must be approved or activated before a lease can be created",
        )

    # Copy billing rules from effective rules
    rules = _effective_rules(unit, prop)

    # Billing rules: body values take precedence; fall back to property rules
    lease = Lease(
        organisation_id=org_id,
        property_id=unit.property_id,
        unit_id=unit.id,
        tenant_id=tenant.id,
        status=LeaseStatus.draft,
        start_date=body.start_date,
        end_date=body.end_date,
        monthly_rent=body.monthly_rent,
        currency=body.currency or unit.currency,
        deposit_amount=body.deposit_amount,
        deposit_paid=body.deposit_paid,
        notes=body.notes,
        rent_day_of_month=body.rent_day_of_month if body.rent_day_of_month is not None else rules.get("rentDayOfMonth", 1),
        grace_period_days=body.grace_period_days if body.grace_period_days is not None else rules.get("gracePeriodDays", 5),
        late_fee_type=body.late_fee_type or rules.get("lateFeeType", "flat"),
        late_fee_value=body.late_fee_value if body.late_fee_value is not None else rules.get("lateFeeValue", 0),
        notice_period_days=body.notice_period_days if body.notice_period_days is not None else rules.get("noticePeriodDays", 30),
    )
    db.add(lease)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "updated_at", "created_at"])
    return _lease_out(lease)


async def get_lease(lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> LeaseOut:
    lease = await _get_lease(lease_id, org_id, db)
    return _lease_out(lease)


async def list_leases(
    org_id: uuid.UUID,
    db: AsyncSession,
    status_filter: str | None = None,
    unit_id: str | None = None,
    tenant_id: str | None = None,
    property_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    from sqlalchemy import func

    q = select(Lease).where(Lease.organisation_id == org_id)
    if status_filter:
        q = q.where(Lease.status == status_filter)
    if unit_id:
        q = q.where(Lease.unit_id == uuid.UUID(unit_id))
    if tenant_id:
        q = q.where(Lease.tenant_id == uuid.UUID(tenant_id))
    if property_id:
        q = q.where(Lease.property_id == uuid.UUID(property_id))

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Lease.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    leases = result.scalars().all()

    return {
        "data": [_lease_out(l) for l in leases],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def update_lease(
    lease_id: uuid.UUID, body: LeaseUpdate, org_id: uuid.UUID, db: AsyncSession
) -> LeaseOut:
    lease = await _get_lease(lease_id, org_id, db)
    if lease.status != LeaseStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft leases can be updated",
        )
    for key, val in body.model_dump(exclude_none=True).items():
        setattr(lease, key, val)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "updated_at"])
    return _lease_out(lease)


async def delete_lease(lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> None:
    lease = await _get_lease(lease_id, org_id, db)
    if lease.status != LeaseStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft leases can be deleted",
        )
    await db.delete(lease)
    await db.flush()


# ── Lifecycle transitions ──────────────────────────────────────────────────────

async def activate_lease(
    lease_id: uuid.UUID, body: LeaseActivate, org_id: uuid.UUID, db: AsyncSession
) -> LeaseOut:
    lease = await _get_lease(lease_id, org_id, db)

    if lease.status != LeaseStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot activate a lease with status '{lease.status}'",
        )

    # Load unit
    unit_result = await db.execute(select(Unit).where(Unit.id == lease.unit_id))
    unit = unit_result.scalar_one_or_none()
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unit no longer exists",
        )

    if unit.status not in (UnitStatus.available, UnitStatus.reserved):
        # Check if there's a conflicting active lease on this unit
        conflict_result = await db.execute(
            select(Lease).where(
                Lease.unit_id == unit.id,
                Lease.status == LeaseStatus.active,
                Lease.id != lease_id,
            )
        )
        conflicting = conflict_result.scalar_one_or_none()
        if conflicting:
            # Special case: if this is a renewal of the conflicting lease, auto-terminate
            if lease.renewal_of_lease_id == conflicting.id:
                now = datetime.now(timezone.utc)
                conflicting.status = LeaseStatus.terminated
                conflicting.terminated_at = now
                conflicting.termination_reason = f"Superseded by renewal lease {lease.id}"
                await db.flush()
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "message": "Unit already has an active lease. Terminate it first.",
                        "conflicting_lease_id": str(conflicting.id),
                    },
                )

    # Load tenant
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == lease.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tenant no longer exists",
        )

    if tenant.onboarding_state not in (OnboardingState.approved, OnboardingState.activated):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tenant must be approved or activated to activate a lease",
        )

    now = datetime.now(timezone.utc)

    # ── Activate lease ─────────────────────────────────────────────────────────
    lease.status = LeaseStatus.active
    lease.signed_at = body.signed_at or now

    # ── Update unit cached FKs ─────────────────────────────────────────────────
    unit.status = UnitStatus.occupied
    unit.current_tenant_id = tenant.id
    unit.current_lease_id = lease.id

    # ── Update tenant cached FKs ───────────────────────────────────────────────
    tenant.status = TenantStatus.active
    tenant.onboarding_state = OnboardingState.activated
    tenant.current_lease_id = lease.id
    tenant.current_unit_id = unit.id
    tenant.current_property_id = unit.property_id

    # ── Payment side-effects ───────────────────────────────────────────────────
    from app.services.payment_service import create_deposit_record, generate_rent_schedules
    await generate_rent_schedules(lease, db)
    await create_deposit_record(lease, db)

    await db.flush()
    await db.refresh(lease, attribute_names=["status", "signed_at", "updated_at"])
    return _lease_out(lease)


async def terminate_lease(
    lease_id: uuid.UUID, body: LeaseTerminate, org_id: uuid.UUID, db: AsyncSession
) -> LeaseOut:
    lease = await _get_lease(lease_id, org_id, db)

    if lease.status != LeaseStatus.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot terminate a lease with status '{lease.status}'",
        )

    now = datetime.now(timezone.utc)
    lease.status = LeaseStatus.terminated
    lease.terminated_at = body.terminated_at or now
    lease.termination_reason = body.reason

    await _clear_unit_and_tenant(lease, db)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "terminated_at", "termination_reason", "updated_at"])
    return _lease_out(lease)


async def expire_lease(lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> LeaseOut:
    lease = await _get_lease(lease_id, org_id, db)

    if lease.status != LeaseStatus.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot expire a lease with status '{lease.status}'",
        )

    lease.status = LeaseStatus.expired
    await _clear_unit_and_tenant(lease, db)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "updated_at"])
    return _lease_out(lease)


async def renew_lease(
    lease_id: uuid.UUID, body: LeaseRenewRequest, org_id: uuid.UUID, db: AsyncSession
) -> LeaseOut:
    original = await _get_lease(lease_id, org_id, db)

    if original.status not in (LeaseStatus.active, LeaseStatus.expired):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only renew an active or expired lease",
        )

    renewal = Lease(
        organisation_id=original.organisation_id,
        property_id=original.property_id,
        unit_id=original.unit_id,
        tenant_id=original.tenant_id,
        status=LeaseStatus.draft,
        # Terms — override from body, fall back to original
        start_date=body.start_date,
        end_date=body.end_date if body.end_date is not None else original.end_date,
        monthly_rent=body.monthly_rent if body.monthly_rent is not None else original.monthly_rent,
        currency=original.currency,
        deposit_amount=original.deposit_amount,
        deposit_paid=False,
        notes=body.notes or original.notes,
        # Billing rules copied verbatim
        rent_day_of_month=original.rent_day_of_month,
        grace_period_days=original.grace_period_days,
        late_fee_type=original.late_fee_type,
        late_fee_value=original.late_fee_value,
        notice_period_days=original.notice_period_days,
        # Renewal chain
        renewal_of_lease_id=original.id,
    )
    db.add(renewal)
    await db.flush()
    await db.refresh(renewal, attribute_names=["status", "updated_at", "created_at"])
    return _lease_out(renewal)


# ── Private helpers ────────────────────────────────────────────────────────────

async def _clear_unit_and_tenant(lease: Lease, db: AsyncSession) -> None:
    """Reset unit + tenant cached FKs when a lease ends."""
    if lease.unit_id:
        unit_result = await db.execute(select(Unit).where(Unit.id == lease.unit_id))
        unit = unit_result.scalar_one_or_none()
        if unit and unit.current_lease_id == lease.id:
            unit.status = UnitStatus.available
            unit.current_tenant_id = None
            unit.current_lease_id = None

    if lease.tenant_id:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == lease.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if tenant and tenant.current_lease_id == lease.id:
            tenant.status = TenantStatus.inactive
            tenant.current_lease_id = None
            tenant.current_unit_id = None
            tenant.current_property_id = None


# ── Document generation ────────────────────────────────────────────────────────

async def generate_lease_document(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    """
    Generate an HTML lease agreement document, persist it to local storage,
    and return the URL to access it.

    The URL points to GET /api/v1/upload/local/... which is served by the
    local storage endpoint in uploads.py.
    """
    lease = await _get_lease(lease_id, org_id, db)

    # Load related records (best-effort — fallback to IDs if not found)
    tenant_name = str(lease.tenant_id) if lease.tenant_id else "—"
    tenant_email = ""
    if lease.tenant_id:
        t = await db.scalar(select(Tenant).where(Tenant.id == lease.tenant_id))
        if t:
            tenant_name = f"{t.first_name or ''} {t.last_name or ''}".strip() or tenant_email
            tenant_email = t.email or ""

    prop_name = str(lease.property_id)
    unit_name = str(lease.unit_id) if lease.unit_id else "—"
    if lease.unit_id:
        u = await db.scalar(select(Unit).where(Unit.id == lease.unit_id))
        if u:
            unit_name = u.name
    if lease.property_id:
        p = await db.scalar(select(Property).where(Property.id == lease.property_id))
        if p:
            prop_name = p.name

    currency = lease.currency or "UGX"
    monthly_rent = float(lease.monthly_rent)
    deposit = float(lease.deposit_amount) if lease.deposit_amount else 0.0
    generated_at = datetime.now(timezone.utc).strftime("%d %B %Y")

    late_fee_str = (
        f"{currency} {float(lease.late_fee_value):,.0f}"
        if lease.late_fee_type == "flat"
        else f"{float(lease.late_fee_value):.1f}% of amount due"
    ) if lease.late_fee_value else "—"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tenancy Agreement — {prop_name} {unit_name}</title>
<style>
  body {{ font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.6; }}
  h1 {{ font-size: 1.5rem; text-align: center; margin-bottom: 4px; }}
  .subtitle {{ text-align: center; color: #555; font-size: 0.9rem; margin-bottom: 32px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
  td {{ padding: 8px 12px; border: 1px solid #ddd; vertical-align: top; }}
  td:first-child {{ font-weight: bold; width: 40%; background: #f9f9f9; }}
  h2 {{ font-size: 1.1rem; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }}
  .footer {{ margin-top: 48px; font-size: 0.8rem; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }}
  .sig-block {{ margin-top: 48px; display: flex; gap: 60px; }}
  .sig-line {{ flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 0.85rem; color: #555; }}
  @media print {{ body {{ margin: 20px; }} }}
</style>
</head>
<body>
<h1>RESIDENTIAL TENANCY AGREEMENT</h1>
<p class="subtitle">Generated {generated_at} &nbsp;·&nbsp; Reference: {str(lease.id)[:8].upper()}</p>

<h2>1. Parties</h2>
<table>
  <tr><td>Tenant</td><td>{tenant_name}{f' &lt;{tenant_email}&gt;' if tenant_email else ''}</td></tr>
  <tr><td>Property</td><td>{prop_name}</td></tr>
  <tr><td>Unit</td><td>{unit_name}</td></tr>
</table>

<h2>2. Tenancy Period</h2>
<table>
  <tr><td>Start date</td><td>{lease.start_date}</td></tr>
  <tr><td>End date</td><td>{lease.end_date or 'Rolling (month-to-month)'}</td></tr>
  <tr><td>Type</td><td>{'Periodic / Rolling' if lease.end_date is None else 'Fixed term'}</td></tr>
</table>

<h2>3. Financial Terms</h2>
<table>
  <tr><td>Monthly rent</td><td>{currency} {monthly_rent:,.0f}</td></tr>
  <tr><td>Security deposit</td><td>{currency} {deposit:,.0f}</td></tr>
  <tr><td>Rent due day</td><td>Day {lease.rent_day_of_month} of each month</td></tr>
  <tr><td>Grace period</td><td>{lease.grace_period_days} days</td></tr>
  <tr><td>Late fee</td><td>{late_fee_str}</td></tr>
</table>

<h2>4. Notice &amp; Termination</h2>
<table>
  <tr><td>Notice period</td><td>{lease.notice_period_days} days written notice required by either party to end the tenancy.</td></tr>
</table>

<h2>5. General Conditions</h2>
<p>The tenant agrees to:</p>
<ul>
  <li>Pay rent on time as specified above.</li>
  <li>Keep the property in good condition and report any damage promptly.</li>
  <li>Not sublet the property without written landlord consent.</li>
  <li>Allow the landlord reasonable access for inspections with prior notice.</li>
  <li>Vacate the property at the end of the tenancy period.</li>
</ul>

<h2>6. Signatures</h2>
<div class="sig-block">
  <div>
    <div class="sig-line">Tenant: {tenant_name}</div>
    <div class="sig-line" style="margin-top:40px">Date: _______________</div>
  </div>
  <div>
    <div class="sig-line">Landlord / Agent</div>
    <div class="sig-line" style="margin-top:40px">Date: _______________</div>
  </div>
</div>

<div class="footer">
  Lease ID: {lease.id} &nbsp;·&nbsp; Status: {lease.status.value if hasattr(lease.status, 'value') else lease.status} &nbsp;·&nbsp; Generated by Crib
</div>
</body>
</html>"""

    # Persist to local uploads directory
    upload_dir = os.path.join(os.getcwd(), "uploads")
    doc_dir = os.path.join(upload_dir, "documents", "leases", str(lease.id))
    os.makedirs(doc_dir, exist_ok=True)
    file_path = os.path.join(doc_dir, "agreement.html")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(html)

    # Return URL via the local serve endpoint
    return f"/api/v1/upload/local/documents/leases/{lease.id}/agreement.html"
