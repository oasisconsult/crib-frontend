"""
Document Signing REST API

  POST /leases/{lease_id}/agreement/sealed.pdf    stream sealed PDF   [org member OR lease tenant]
  GET  /leases/{lease_id}/agreement/signing-info  signing metadata    [org member OR lease tenant]
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id
from app.core.database import get_db
from app.features.document_signing.schema import SealedAgreementOut
from app.models.lease import Lease
from app.models.tenancy_agreement import TenancyAgreement

router = APIRouter(tags=["document-signing"])


async def _get_lease_and_ta(
    lease_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession,
) -> tuple[Lease, TenancyAgreement]:
    """Resolve lease + agreement and assert the caller has access."""
    lease = await db.scalar(select(Lease).where(Lease.id == lease_id))
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found.")

    org_id = get_org_id(current_user)

    # Access: org member OR the tenant on this lease
    is_org_member = org_id and str(org_id) == str(lease.organisation_id)
    is_lease_tenant = (
        current_user.profile
        and current_user.profile.role == "tenant"
        and str(lease.tenant_id) == str(current_user.profile.id)
    )
    if not (is_org_member or is_lease_tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    ta = await db.scalar(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease_id)
    )
    if not ta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenancy agreement found for this lease.",
        )
    return lease, ta


@router.get("/leases/{lease_id}/agreement/signing-info", response_model=SealedAgreementOut)
async def get_signing_info(
    lease_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns signing metadata, document hash, and sealed PDF URL (if available)."""
    _, ta = await _get_lease_and_ta(lease_id, current_user, db)
    return SealedAgreementOut(
        lease_id=str(ta.lease_id),
        agreement_id=str(ta.id),
        status=ta.status.value,
        document_hash=ta.document_hash,
        sealed_pdf_url=ta.sealed_pdf_url,
        signing_event_count=len(ta.signing_events or []),
    )


@router.get("/leases/{lease_id}/agreement/sealed.pdf")
async def download_sealed_pdf(
    lease_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Redirect to the sealed certificate PDF (MinIO presigned URL).
    Returns 404 if the agreement is not yet fully executed.
    Returns 202 if fully_executed but PDF generation is still pending.
    """
    _, ta = await _get_lease_and_ta(lease_id, current_user, db)

    if ta.sealed_pdf_url:
        return RedirectResponse(url=ta.sealed_pdf_url, status_code=302)

    if ta.status.value == "fully_executed":
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Agreement is fully executed but the sealed PDF is still being generated. "
                   "Please try again in a few moments.",
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Sealed PDF is not available yet (agreement status: {ta.status.value}).",
    )
