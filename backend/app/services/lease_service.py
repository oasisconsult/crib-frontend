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
from typing import Any

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)

from app.models.landlord_invite import LandlordPropertyAccess
from app.models.lease import Lease, LeaseStatus
from app.models.property import Property, Unit, UnitStatus
from app.models.tenant import OnboardingState, Tenant, TenantStatus
from app.models.tenancy_agreement import TenancyAgreement
from app.schemas.lease import (
    LeaseActivate,
    LeaseCreate,
    LeaseNotice,
    LeaseOut,
    LeaseRenewRequest,
    LeaseTerminate,
    LeaseUpdate,
)


# ── Serialiser ─────────────────────────────────────────────────────────────────

def _lease_out(
    lease: Lease,
    agreement: TenancyAgreement | None = None,
    tenant_name: str | None = None,
    unit_name: str | None = None,
    property_name: str | None = None,
) -> LeaseOut:
    def _d(v) -> str | None:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)           # date → ISO string

    # Build signatures list from TenancyAgreement when available
    signatures: list[dict] = []
    if agreement:
        signatures.append({
            "party": "tenant",
            "name": tenant_name or "",
            "status": "signed" if agreement.tenant_signed_at else "pending",
            "signedAt": _d(agreement.tenant_signed_at),
            "signatureDataUrl": agreement.tenant_signature_data_url,
        })
        signatures.append({
            "party": "landlord",
            "name": agreement.landlord_signer_name or "",
            "status": "signed" if agreement.landlord_signed_at else "pending",
            "signedAt": _d(agreement.landlord_signed_at),
            "signatureDataUrl": agreement.landlord_signature_data_url,
        })

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
        advance_months=lease.advance_months,
        rent_day_of_month=lease.rent_day_of_month,
        grace_period_days=lease.grace_period_days,
        late_fee_type=lease.late_fee_type,
        late_fee_value=float(lease.late_fee_value),
        notice_period_days=lease.notice_period_days,
        signed_at=_d(lease.signed_at),
        notice_given_at=_d(lease.notice_given_at),
        notice_vacate_date=str(lease.notice_vacate_date) if lease.notice_vacate_date else None,
        terminated_at=_d(lease.terminated_at),
        termination_reason=lease.termination_reason,
        renewal_of_lease_id=str(lease.renewal_of_lease_id) if lease.renewal_of_lease_id else None,
        notes=lease.notes,
        terms_accepted_at=_d(lease.terms_accepted_at),
        onboarding_completed_at=_d(lease.onboarding_completed_at),
        paper_agreement_acknowledged=bool(lease.paper_agreement_acknowledged),
        created_at=lease.created_at.isoformat(),
        updated_at=lease.updated_at.isoformat(),
        signatures=signatures,
        tenant_name=tenant_name,
        unit_name=unit_name,
        property_name=property_name,
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
        advance_months=body.advance_months,  # None → system/unit/property fallback at preview time
    )
    db.add(lease)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "updated_at", "created_at"])

    # Auto-link the lease to the tenant's onboarding invite so the tenant
    # can immediately proceed without the manager taking a separate action.
    if tenant.onboarding_state in (OnboardingState.approved, OnboardingState.activated):
        try:
            from app.services import tenant_service as tenant_svc
            await tenant_svc.send_onboarding_link(
                lease_id=lease.id, org_id=org_id, db=db
            )
        except Exception:
            log.warning(
                "auto_link.onboarding_invite.failed",
                lease_id=str(lease.id),
                tenant_id=str(tenant.id),
                exc_info=True,
            )

    return _lease_out(lease)


async def get_lease(lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> LeaseOut:
    lease = await _get_lease(lease_id, org_id, db)

    # Fetch TenancyAgreement (exists only after tenant signs)
    agreement = await db.scalar(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease.id)
    )

    # Fetch display names for UI (avoids extra round-trips)
    tenant_name: str | None = None
    unit_name: str | None = None
    property_name: str | None = None

    if lease.tenant_id:
        t = await db.scalar(select(Tenant).where(Tenant.id == lease.tenant_id))
        if t:
            tenant_name = f"{t.first_name or ''} {t.last_name or ''}".strip() or t.email

    if lease.unit_id:
        u = await db.scalar(select(Unit).where(Unit.id == lease.unit_id))
        if u:
            unit_name = u.name

    if lease.property_id:
        p = await db.scalar(select(Property).where(Property.id == lease.property_id))
        if p:
            property_name = p.name

    return _lease_out(lease, agreement=agreement, tenant_name=tenant_name,
                      unit_name=unit_name, property_name=property_name)


async def list_leases(
    org_id: uuid.UUID,
    db: AsyncSession,
    status_filters: list[str] | None = None,
    search: str | None = None,
    unit_id: str | None = None,
    tenant_id: str | None = None,
    property_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
    landlord_profile_id: uuid.UUID | None = None,
) -> dict:
    from sqlalchemy import func

    q = select(Lease).where(Lease.organisation_id == org_id)
    if landlord_profile_id is not None:
        allowed = select(LandlordPropertyAccess.property_id).where(
            LandlordPropertyAccess.landlord_profile_id == landlord_profile_id
        )
        q = q.where(Lease.property_id.in_(allowed))
    if status_filters:
        q = q.where(Lease.status.in_(status_filters))
    if search:
        term = f"%{search}%"
        q = q.where(Lease.id.cast(str).ilike(term))
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

    # Batch-fetch display names to avoid N+1 queries
    tenant_ids  = {l.tenant_id  for l in leases if l.tenant_id}
    unit_ids    = {l.unit_id    for l in leases if l.unit_id}
    property_ids = {l.property_id for l in leases if l.property_id}

    tenant_map:   dict[uuid.UUID, str] = {}
    unit_map:     dict[uuid.UUID, str] = {}
    property_map: dict[uuid.UUID, str] = {}

    if tenant_ids:
        rows = (await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars().all()
        tenant_map = {t.id: (f"{t.first_name or ''} {t.last_name or ''}".strip() or t.email) for t in rows}

    if unit_ids:
        rows = (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()
        unit_map = {u.id: u.name for u in rows}

    if property_ids:
        rows = (await db.execute(select(Property).where(Property.id.in_(property_ids)))).scalars().all()
        property_map = {p.id: p.name for p in rows}

    return {
        "data": [
            _lease_out(
                l,
                tenant_name=tenant_map.get(l.tenant_id) if l.tenant_id else None,
                unit_name=unit_map.get(l.unit_id) if l.unit_id else None,
                property_name=property_map.get(l.property_id) if l.property_id else None,
            )
            for l in leases
        ],
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


# ── Offline agreement acknowledgement ─────────────────────────────────────────


async def acknowledge_lease(
    lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> LeaseOut:
    """
    Manager confirms that a signed paper agreement is on file for this lease.
    Sets paper_agreement_acknowledged=True. No e-signature is generated.
    """
    lease = await _get_lease(lease_id, org_id, db)
    lease.paper_agreement_acknowledged = True
    await db.flush()
    await db.refresh(lease, attribute_names=["paper_agreement_acknowledged", "updated_at"])
    return _lease_out(lease)


async def tenant_confirm_terms(
    lease_id: uuid.UUID,
    tenant_logto_sub: str,
    db: AsyncSession,
) -> LeaseOut:
    """
    Tenant digitally confirms they have received and agree to the terms of their
    imported lease. Sets terms_accepted_at=now(). Only valid for active leases
    where terms_accepted_at is still NULL.

    Access control: the requesting user's Logto sub must match the tenant on
    the lease (enforced by the caller via get_current_user).
    """
    from app.models.tenant import Tenant as TenantModel

    result = await db.execute(
        select(Lease).join(
            TenantModel, TenantModel.id == Lease.tenant_id
        ).where(
            Lease.id == lease_id,
            TenantModel.logto_user_id == tenant_logto_sub,
            Lease.status == LeaseStatus.active,
        )
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lease not found or not accessible",
        )
    if lease.terms_accepted_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lease terms have already been confirmed",
        )

    lease.terms_accepted_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(lease, attribute_names=["terms_accepted_at", "updated_at"])
    return _lease_out(lease)


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


async def record_vacate_notice(
    lease_id: uuid.UUID,
    body: LeaseNotice,
    current_user: "Any",
    db: AsyncSession,
) -> LeaseOut:
    """
    Record a tenant's notice-to-vacate.

    Rules:
      - Lease must be active.
      - vacate_date must be at least notice_period_days from today.
      - If the caller is a tenant, they must own this lease.
      - Sets notice_given_at + notice_vacate_date; does NOT terminate the lease —
        that happens when the tenant physically vacates (manager runs terminate/expire).
    """
    from datetime import date, timedelta

    # Resolve the org_id: CurrentUser exposes it, or fall back to querying
    org_id = current_user.org_id

    # For tenants the org_id may be set; allow a cross-org look-up if not
    lease: Lease | None = None
    if org_id:
        lease = await db.scalar(
            select(Lease).where(Lease.id == lease_id, Lease.organisation_id == org_id)
        )
    else:
        lease = await db.scalar(select(Lease).where(Lease.id == lease_id))

    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found.")

    # Tenants may only submit notice for their own lease
    roles: list[str] = getattr(current_user, "roles", [])
    is_staff = any(r in roles for r in ("manager", "owner", "superadmin"))
    if not is_staff and "tenant" in roles:
        profile_tenant_id = getattr(getattr(current_user, "profile", None), "tenant_id", None)
        if profile_tenant_id is None or str(lease.tenant_id) != str(profile_tenant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only submit a notice for your own lease.",
            )

    if lease.status != LeaseStatus.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit a notice for a lease with status '{lease.status}'. Only active leases accept notice.",
        )

    if lease.notice_given_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A notice to vacate has already been submitted for this lease.",
        )

    # Validate vacate_date respects notice period
    today = date.today()
    min_vacate = today + timedelta(days=lease.notice_period_days)
    if body.vacate_date < min_vacate:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Vacate date must be at least {lease.notice_period_days} days from today "
                f"(earliest allowed: {min_vacate.isoformat()})."
            ),
        )

    now = datetime.now(timezone.utc)
    lease.notice_given_at = now
    lease.notice_vacate_date = body.vacate_date
    if body.reason:
        lease.termination_reason = body.reason

    await db.flush()
    await db.refresh(
        lease,
        attribute_names=["notice_given_at", "notice_vacate_date", "termination_reason", "updated_at"],
    )
    log.info(
        "lease.notice_submitted",
        lease_id=str(lease_id),
        vacate_date=str(body.vacate_date),
    )
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
    Generate the full HTML lease agreement document, persist it to local storage,
    and return the URL to access it.

    Uses the same Jinja2 template as the onboarding flow preview so the
    downloaded document is identical to what the tenant reviewed and signed.
    Signatures are included if the TenancyAgreement record exists.

    The URL points to GET /api/v1/upload/local/... served by uploads.py.
    """
    from app.models.tenancy_agreement import TenancyAgreement
    from app.services.onboarding_service import _render_agreement_html

    lease = await _get_lease(lease_id, org_id, db)

    # Load related records
    tenant = None
    if lease.tenant_id:
        tenant = await db.scalar(select(Tenant).where(Tenant.id == lease.tenant_id))

    unit = None
    if lease.unit_id:
        unit = await db.scalar(select(Unit).where(Unit.id == lease.unit_id))

    prop = None
    if lease.property_id:
        prop = await db.scalar(select(Property).where(Property.id == lease.property_id))

    if not tenant or not unit or not prop:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Lease is missing tenant, unit, or property — cannot generate document.",
        )

    # Pull signatures from the TenancyAgreement if one exists
    ta = await db.scalar(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease.id)
    )

    def _fmt_dt(dt) -> str | None:
        if dt is None:
            return None
        return f"{dt.day} {dt.strftime('%B %Y %H:%M')} UTC"

    html = await _render_agreement_html(
        lease=lease,
        tenant=tenant,
        unit=unit,
        prop=prop,
        db=db,
        tenant_signature_data_url=ta.tenant_signature_data_url if ta else None,
        tenant_signed_at=_fmt_dt(ta.tenant_signed_at) if ta else None,
        landlord_signature_data_url=ta.landlord_signature_data_url if ta else None,
        landlord_signed_at=_fmt_dt(ta.landlord_signed_at) if ta else None,
        landlord_signer_name=ta.landlord_signer_name if ta else None,
    )

    # Persist to local uploads directory
    upload_dir = os.path.join(os.getcwd(), "uploads")
    doc_dir = os.path.join(upload_dir, "documents", "leases", str(lease.id))
    os.makedirs(doc_dir, exist_ok=True)
    file_path = os.path.join(doc_dir, "agreement.html")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(html)

    # Return URL via the local serve endpoint
    return f"/api/v1/upload/local/documents/leases/{lease.id}/agreement.html"
