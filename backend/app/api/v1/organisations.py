"""
Organisation provisioning endpoint.

POST /organisations/provision — called once during landlord onboarding.
Creates:
  1. A Logto Organization (via Management API)
  2. Our Organisation row
  3. Updates the caller's Profile with org linkage + role=owner

This endpoint is intentionally minimal — Logto handles member invitations
and role assignments via its own UI/API flows.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.organisation import Organisation, Plan
from app.models.profile import Role
from app.schemas.common import CamelModel

router = APIRouter(prefix="/organisations", tags=["organisations"])
settings = get_settings()


class ProvisionRequest(CamelModel):
    name: str
    slug: str
    country: str | None = None
    currency: str = "UGX"


class OrganisationOut(CamelModel):
    id: str
    logto_org_id: str
    name: str
    slug: str
    plan: str
    currency: str


async def _create_logto_org(name: str, slug: str) -> str:
    """
    Create an organization in Logto via the Management API.
    Returns the new Logto organization ID.
    """
    # First obtain a Management API token (M2M)
    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            f"{settings.logto_endpoint}oidc/token",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.logto_m2m_app_id,
                "client_secret": settings.logto_m2m_app_secret,
                "scope": "all",
                "resource": f"{settings.logto_admin_endpoint}api",
            },
        )
        token_resp.raise_for_status()
        mgmt_token = token_resp.json()["access_token"]

        # Create the org
        org_resp = await client.post(
            f"{settings.logto_management_api_base}/organizations",
            json={"name": name, "description": f"Organisation: {slug}"},
            headers={"Authorization": f"Bearer {mgmt_token}"},
        )
        org_resp.raise_for_status()
        return org_resp.json()["id"]


@router.post("/provision", response_model=OrganisationOut, status_code=status.HTTP_201_CREATED)
async def provision_organisation(
    body: ProvisionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationOut:
    """
    Provision a new Organisation for an onboarding landlord.
    The calling user becomes the owner of the new org.
    """
    if current_user.profile.organisation_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already belongs to an organisation",
        )

    # Step 1: Create Logto org (skip in dev if M2M not configured)
    logto_org_id: str
    if settings.is_dev and not settings.logto_m2m_app_id:
        logto_org_id = f"org_dev_{body.slug}"
    else:
        try:
            logto_org_id = await _create_logto_org(body.name, body.slug)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Logto organisation creation failed: {exc}",
            ) from exc

    # Step 2: Create our Organisation row
    org = Organisation(
        logto_org_id=logto_org_id,
        name=body.name,
        slug=body.slug,
        plan=Plan.starter,
        currency=body.currency,
        country=body.country,
        settings={},
    )
    db.add(org)
    await db.flush()

    # Step 3: Link the profile
    profile = current_user.profile
    profile.organisation_id = org.id
    profile.logto_org_id = logto_org_id
    profile.role = Role.owner
    await db.flush()

    return OrganisationOut(
        id=str(org.id),
        logto_org_id=org.logto_org_id,
        name=org.name,
        slug=org.slug,
        plan=org.plan.value,
        currency=org.currency,
    )
