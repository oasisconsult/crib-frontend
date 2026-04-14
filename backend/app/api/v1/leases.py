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

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_tenant_record, require_org_access
from app.core.database import get_db
from app.schemas.lease import (
    LeaseActivate,
    LeaseCreate,
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

    return await svc.list_leases(
        current_user.org_id,
        db,
        status_filter=status_filter,
        unit_id=unit_id,
        tenant_id=tenant_id,
        property_id=property_id,
        page=page,
        page_size=page_size,
    )


@router.get("/{lease_id}", response_model=LeaseOut)
async def get_lease(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_lease(lease_id, current_user.org_id, db)


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
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """Generate an HTML lease agreement document and return a URL to access it."""
    url = await svc.generate_lease_document(lease_id, current_user.org_id, db)
    return {"url": url}


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
    assert current_user.org_id is not None  # guaranteed by require_org_access
    return await tenant_svc.send_onboarding_link(
        lease_id=lease_id,
        org_id=current_user.org_id,
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
    assert current_user.org_id is not None
    return await onb_svc.confirm_all_onboarding_payments(
        lease_id=lease_id,
        org_id=current_user.org_id,
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
