"""
Organisation endpoints.

POST /organisations/provision — called once during agency onboarding.
GET  /organisations/me        — returns the caller's organisation details.
PATCH /organisations/me       — updates org contact info (name: superadmin only).
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.config import get_settings
from app.core.database import get_db
from app.models.organisation import Organisation, Plan
from app.schemas.common import CamelModel
from app.services.logto_service import _get_m2m_token

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
    country: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    features: dict = {}


class OrganisationUpdateRequest(CamelModel):
    """
    Fields editable by manager/owner: contact_phone, contact_email.
    Field editable by superadmin only: name.
    """
    name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None


class UpdateFeaturesRequest(CamelModel):
    """Merge-patch individual feature flags. Unknown keys are ignored."""
    features: dict


async def _create_logto_org(name: str, slug: str) -> str:
    """Create an organization in Logto. Returns the new Logto org ID."""
    mgmt_token = await _get_m2m_token()
    async with httpx.AsyncClient(timeout=15) as client:
        org_resp = await client.post(
            f"{settings.logto_management_api_base}/organizations",
            json={"name": name, "description": f"Organisation: {slug}"},
            headers={"Authorization": f"Bearer {mgmt_token}"},
        )
        org_resp.raise_for_status()
        return org_resp.json()["id"]


async def _add_user_to_logto_org(logto_org_id: str, user_sub: str) -> None:
    """Add a user to a Logto organization by their Logto user ID (sub)."""
    mgmt_token = await _get_m2m_token()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{settings.logto_management_api_base}/organizations/{logto_org_id}/users",
            json={"userIds": [user_sub]},
            headers={"Authorization": f"Bearer {mgmt_token}"},
        )
        resp.raise_for_status()


@router.post(
    "/provision",
    response_model=OrganisationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("superadmin"))],
)
async def provision_organisation(
    body: ProvisionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationOut:
    """
    Superadmin-only: provision the platform organisation.
    Can only be called once — raises 409 if the caller already has an org.
    """
    if current_user.profile.organisation_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already belongs to an organisation",
        )

    # Step 1: Create Logto org and add the caller as a member
    logto_org_id: str
    if settings.is_dev and not settings.logto_m2m_app_id:
        logto_org_id = f"org_dev_{body.slug}"
    else:
        try:
            logto_org_id = await _create_logto_org(body.name, body.slug)
            await _add_user_to_logto_org(logto_org_id, current_user.claims.sub)
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
        plan=Plan.free,
        currency=body.currency,
        country=body.country,
        settings={},
    )
    db.add(org)
    await db.flush()

    # Step 3: Link the profile
    # Preserve superadmin role — don't downgrade to owner.
    profile = current_user.profile
    profile.organisation_id = org.id
    profile.logto_org_id = logto_org_id
    if profile.role != "superadmin":
        profile.role = "owner"
    await db.flush()

    return OrganisationOut(
        id=str(org.id),
        logto_org_id=org.logto_org_id,
        name=org.name,
        slug=org.slug,
        plan=org.plan.value,
        currency=org.currency,
        country=org.country,
        contact_phone=org.settings.get("contact_phone"),
        contact_email=org.settings.get("contact_email"),
        features=org.settings.get("features", {}),
    )


@router.get("/me", response_model=OrganisationOut | None)
async def get_my_organisation(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationOut | None:
    """Return the caller's organisation, or null for superadmin without an org."""
    if not current_user.profile.organisation_id:
        return None
    result = await db.execute(
        select(Organisation).where(Organisation.id == current_user.profile.organisation_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    return OrganisationOut(
        id=str(org.id),
        logto_org_id=org.logto_org_id,
        name=org.name,
        slug=org.slug,
        plan=org.plan.value,
        currency=org.currency,
        country=org.country,
        contact_phone=org.settings.get("contact_phone"),
        contact_email=org.settings.get("contact_email"),
        features=org.settings.get("features", {}),
    )


@router.patch("/me", response_model=OrganisationOut)
async def update_my_organisation(
    body: OrganisationUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationOut:
    """
    Update organisation contact details.
    - contact_phone / contact_email: editable by owner, manager, superadmin.
    - name: superadmin only.
    """
    if not current_user.has_role("owner", "manager", "superadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    if not current_user.profile.organisation_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No organisation found")

    result = await db.execute(
        select(Organisation).where(Organisation.id == current_user.profile.organisation_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    # Name change: superadmin only
    if body.name is not None:
        if not current_user.has_role("superadmin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a superadmin can change the agency name",
            )
        org.name = body.name

    # Contact fields go into JSONB settings
    settings_blob: dict = dict(org.settings or {})
    if body.contact_phone is not None:
        settings_blob["contact_phone"] = body.contact_phone
    if body.contact_email is not None:
        settings_blob["contact_email"] = body.contact_email
    org.settings = settings_blob

    await db.flush()

    return OrganisationOut(
        id=str(org.id),
        logto_org_id=org.logto_org_id,
        name=org.name,
        slug=org.slug,
        plan=org.plan.value,
        currency=org.currency,
        country=org.country,
        contact_phone=org.settings.get("contact_phone"),
        contact_email=org.settings.get("contact_email"),
        features=org.settings.get("features", {}),
    )


# ── Feature flags ──────────────────────────────────────────────────────────────

_ALLOWED_FEATURE_KEYS = {"manualPayments"}


@router.patch("/me/features", response_model=OrganisationOut)
async def update_features(
    body: UpdateFeaturesRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationOut:
    """
    Toggle org-level feature flags. Owner and superadmin only.
    Partial update — only supplied keys are changed, others left as-is.
    Unknown keys are silently ignored.
    """
    if not current_user.has_role("owner", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner or superadmin required to manage features",
        )
    if not current_user.profile.organisation_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No organisation found")

    result = await db.execute(
        select(Organisation).where(Organisation.id == current_user.profile.organisation_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    settings_blob: dict = dict(org.settings or {})
    merged: dict = dict(settings_blob.get("features", {}))
    for key, value in body.features.items():
        if key in _ALLOWED_FEATURE_KEYS:
            merged[key] = bool(value)

    settings_blob["features"] = merged
    org.settings = settings_blob
    await db.flush()

    return OrganisationOut(
        id=str(org.id),
        logto_org_id=org.logto_org_id,
        name=org.name,
        slug=org.slug,
        plan=org.plan.value,
        currency=org.currency,
        country=org.country,
        contact_phone=settings_blob.get("contact_phone"),
        contact_email=settings_blob.get("contact_email"),
        features=settings_blob.get("features", {}),
    )
