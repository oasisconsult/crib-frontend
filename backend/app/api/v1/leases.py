"""
Leases REST API — 9 endpoints.

  POST   /leases                  create a draft lease         [manager/owner]
  GET    /leases                  list leases (filterable)     [manager/owner/tenant-own]
  GET    /leases/{id}             get a single lease           [manager/owner/tenant-own]
  PUT    /leases/{id}             update a draft lease         [manager/owner]
  DELETE /leases/{id}             delete a draft lease         [manager/owner]
  PATCH  /leases/{id}/activate    draft → active               [manager/owner]
  PATCH  /leases/{id}/terminate   active → terminated          [manager/owner]
  PATCH  /leases/{id}/expire      active → expired             [manager/owner]
  POST   /leases/{id}/renew              create renewal draft         [manager/owner]
  POST   /leases/{id}/send-onboarding   resend/refresh onboarding token [manager/owner]
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, get_tenant_record, require_org_access
from app.core.database import get_db
from app.schemas.lease import (
    LeaseActivate,
    LeaseCreate,
    LeaseNotice,
    LeaseOut,
    LeaseRenewRequest,
    LeaseTerminate,
    LeaseUpdate,
)
from app.schemas.onboarding import CountersignBody, OnboardingPaymentOut, PresignBody, TenancyAgreementOut
from app.schemas.tenant import TenantInviteOut
from app.services import lease_service as svc
from app.services import onboarding_service as onb_svc
from app.services import tenant_service as tenant_svc

router = APIRouter(prefix="/leases", tags=["leases"])

_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.post("", response_model=LeaseOut, status_code=status.HTTP_201_CREATED)
async def create_lease(
    body: LeaseCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_lease(body, current_user.org_id, db)


@router.get("", response_model=dict)
async def list_leases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    status_filter: str | None = Query(None, alias="status"),
    states: str | None = Query(None),
    search: str | None = Query(None),
    unit_id: str | None = Query(None, alias="unitId"),
    tenant_id: str | None = Query(None, alias="tenantId"),
    property_id: str | None = Query(None, alias="propertyId"),
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    # Tenants may only see their own leases — override any supplied tenantId param.
    tenant_record = await get_tenant_record(current_user, db)
    if tenant_record is not None:
        tenant_id = str(tenant_record.id)

    state_list = [s.strip() for s in states.split(",")] if states else ([status_filter] if status_filter else None)
    landlord_id = current_user.id if current_user.profile.is_read_only else None
    return await svc.list_leases(
        get_org_id(current_user),
        db,
        status_filters=state_list,
        search=search,
        unit_id=unit_id,
        tenant_id=tenant_id,
        property_id=property_id,
        page=page,
        page_size=page_size,
        landlord_profile_id=landlord_id,
    )


@router.get("/{lease_id}", response_model=LeaseOut)
async def get_lease(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_lease(lease_id, get_org_id(current_user), db)


@router.put("/{lease_id}", response_model=LeaseOut)
async def update_lease(
    lease_id: uuid.UUID,
    body: LeaseUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_lease(lease_id, body, current_user.org_id, db)


@router.delete("/{lease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lease(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_lease(lease_id, current_user.org_id, db)


# ── Lifecycle transitions ──────────────────────────────────────────────────────

@router.patch("/{lease_id}/activate", response_model=LeaseOut)
async def activate_lease(
    lease_id: uuid.UUID,
    body: LeaseActivate = LeaseActivate(),  # noqa: B008
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.activate_lease(lease_id, body, current_user.org_id, db)


@router.patch("/{lease_id}/terminate", response_model=LeaseOut)
async def terminate_lease(
    lease_id: uuid.UUID,
    body: LeaseTerminate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.terminate_lease(lease_id, body, current_user.org_id, db)


@router.patch("/{lease_id}/expire", response_model=LeaseOut)
async def expire_lease(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.expire_lease(lease_id, current_user.org_id, db)


@router.post("/{lease_id}/renew", response_model=LeaseOut, status_code=status.HTTP_201_CREATED)
async def renew_lease(
    lease_id: uuid.UUID,
    body: LeaseRenewRequest,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.renew_lease(lease_id, body, current_user.org_id, db)


@router.post("/{lease_id}/document", response_model=dict)
async def generate_document(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _read,   # tenants can generate their own lease doc
    db: AsyncSession = Depends(get_db),
):
    """Generate an HTML lease agreement document and return a URL to access it."""
    url = await svc.generate_lease_document(lease_id, get_org_id(current_user), db)
    return {"url": url}


@router.post("/{lease_id}/notice", response_model=LeaseOut)
async def submit_vacate_notice(
    lease_id: uuid.UUID,
    body: LeaseNotice,
    current_user: CurrentUser = _read,   # tenants submit notice on their own lease
    db: AsyncSession = Depends(get_db),
):
    """
    Tenant submits a notice-to-vacate.
    Records notice_given_at, notice_vacate_date, and termination_reason on the lease.
    The lease stays active until the vacate date; the landlord is notified separately.
    """
    return await svc.record_vacate_notice(lease_id, body, current_user, db)


@router.delete("/{lease_id}/notice", response_model=LeaseOut)
async def retract_vacate_notice(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,  # manager/owner only
    db: AsyncSession = Depends(get_db),
):
    """
    Retract a previously submitted notice to vacate.
    Clears notice_given_at + notice_vacate_date and sends the tenant a
    system message plus an email notification.
    """
    return await svc.retract_vacate_notice(lease_id, get_org_id(current_user), db)


@router.post("/{lease_id}/send-onboarding", response_model=TenantInviteOut)
async def send_onboarding_link(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Regenerate the onboarding token for this lease (e.g. the tenant lost the link
    or it expired).  On lease creation the link is issued automatically — this
    endpoint is the manual resend / refresh path.
    """
    return await tenant_svc.send_onboarding_link(
        lease_id=lease_id,
        org_id=get_org_id(current_user),
        db=db,
    )


@router.post("/{lease_id}/confirm-payments", response_model=OnboardingPaymentOut)
async def confirm_onboarding_payments(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Manager confirms all pending onboarding payments for this lease.
    Advances the lease from payment_pending → payment_secured when all are confirmed.
    """
    return await onb_svc.confirm_all_onboarding_payments(
        lease_id=lease_id,
        org_id=get_org_id(current_user),
        db=db,
    )


@router.post("/{lease_id}/agreement/presign", response_model=TenancyAgreementOut)
async def presign_agreement(
    lease_id: uuid.UUID,
    body: PresignBody,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Manager/landlord pre-signs the agreement before sending it to the tenant.
    Creates a TenancyAgreement record at 'draft' status with the landlord
    signature stored.  When the tenant signs during onboarding the agreement
    immediately becomes 'fully_executed'.
    """
    return await onb_svc.presign_agreement(
        lease_id=str(lease_id),
        signature_data_url=body.signature_data_url,
        signer_id=current_user.sub,
        signer_name=current_user.profile.display_name or current_user.sub,
        db=db,
    )


@router.post("/{lease_id}/agreement/countersign", response_model=TenancyAgreementOut)
async def countersign_agreement(
    lease_id: uuid.UUID,
    body: CountersignBody,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Manager/landlord countersigns the tenancy agreement.
    The tenant must have already signed (lease must be active).
    Once countersigned the agreement becomes fully_executed.
    """
    return await onb_svc.countersign_agreement(
        lease_id=str(lease_id),
        signature_data_url=body.signature_data_url,
        signer_id=current_user.sub,
        signer_name=current_user.profile.display_name or current_user.sub,
        db=db,
    )


# ── Offline agreement acknowledgement ─────────────────────────────────────────


@router.patch("/{lease_id}/acknowledge", response_model=LeaseOut)
async def acknowledge_lease(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Manager records that a signed paper agreement is on file for this lease.
    Sets paper_agreement_acknowledged=True. Clears the 'pending confirmation'
    banner for this lease in the dashboard and detail panel.
    """
    return await svc.acknowledge_lease(lease_id, get_org_id(current_user), db)


@router.patch("/{lease_id}/confirm-terms", response_model=LeaseOut)
async def tenant_confirm_terms(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    """
    Tenant confirms they have received and agree to the terms of their imported
    lease. Sets terms_accepted_at=now(). Only callable by the tenant who owns
    the lease; blocks calls from managers/owners via the staff dashboard.
    """
    if not current_user.has_role("tenant"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the tenant can confirm lease terms",
        )
    return await svc.tenant_confirm_terms(
        lease_id=lease_id,
        tenant_logto_sub=current_user.sub,
        db=db,
    )
