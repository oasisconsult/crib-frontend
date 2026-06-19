"""
Tenants REST API — 18 endpoints.

Route order matters: /invite, /onboarding/:token must be registered before /:id
to prevent FastAPI matching those path segments as UUID tenant IDs.

Endpoints:
  POST   /tenants/invite
  GET    /tenants/onboarding/{token}
  POST   /tenants/onboarding/{token}/submit
  PATCH  /tenants/onboarding/{token}/draft      ← save partial progress (public)
  GET    /tenants
  GET    /tenants/{id}
  PUT    /tenants/{id}
  DELETE /tenants/{id}
  PATCH  /tenants/{id}/approve
  PATCH  /tenants/{id}/reject
  POST   /tenants/{id}/resend-invite            ← regenerate expired/pending invite
  GET    /tenants/{id}/documents
  POST   /tenants/{id}/documents
  PATCH  /tenants/{id}/documents/{doc_id}/verify
  DELETE /tenants/{id}/documents/{doc_id}
  POST   /tenants/{id}/anonymise
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id, require_org_access
from app.core.database import get_db
from app.services import audit_service
from app.services.policy_service import require_permission
from app.services.subscription_limits import check_feature_access
from app.schemas.tenant import (
    OnboardingDraftSave,
    OnboardingResponse,
    TenantCreate,
    TenantDocumentCreate,
    TenantDocumentOut,
    TenantInviteCreate,
    TenantInviteOut,
    TenantOnboardingSubmit,
    TenantOut,
    TenantUpdate,
)
from app.services import tenant_service as svc

router = APIRouter(prefix="/tenants", tags=["tenants"])

_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


async def _own_tenant_or_manager(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Document access guard:
    - Superadmin, owner, manager → unrestricted access to any tenant in their org.
    - Tenant role → may only access their own tenant record
      (profile.tenant_id must match the URL {tenant_id}).

    This prevents cross-tenant document reads within the same org, and allows
    tenants to upload and delete their own documents.
    """
    if current_user.has_role("superadmin"):
        return current_user
    if current_user.org_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No organisation context in token",
        )
    if current_user.is_owner_or_manager():
        return current_user
    # Tenant: enforce own-record access only
    if current_user.profile.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenants can only access their own documents",
        )
    return current_user


# ── Direct create (no invite email) ──────────────────────────────────────────

@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """Create a tenant profile directly. No invite email is sent."""
    assert current_user.org_id is not None  # guaranteed by _write / require_org_access
    tenant = await svc.create_tenant(body, current_user.org_id, db)
    await audit_service.append(
        db,
        organisation_id=current_user.org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="tenant",
        resource_id=uuid.UUID(tenant.id),
        resource_label=tenant.first_name,
        action="tenant.created",
        request=request,
    )
    return tenant


# ── Invite ────────────────────────────────────────────────────────────────────

@router.post("/invite", response_model=TenantInviteOut, status_code=status.HTTP_201_CREATED)
async def invite_tenant(
    body: TenantInviteCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.invite_tenant(body, current_user.org_id, db)


# ── Onboarding (public — no auth required) ────────────────────────────────────

@router.get("/onboarding/{token}", response_model=OnboardingResponse)
async def get_onboarding(token: str, db: AsyncSession = Depends(get_db)):
    result = await svc.get_onboarding_by_token(token, db)
    return result


@router.post("/onboarding/{token}/submit", response_model=TenantOut)
async def submit_onboarding(
    token: str,
    body: TenantOnboardingSubmit,
    db: AsyncSession = Depends(get_db),
):
    return await svc.submit_onboarding(token, body, db)


@router.patch("/onboarding/{token}/draft", status_code=status.HTTP_204_NO_CONTENT)
async def save_onboarding_draft(
    token: str,
    body: OnboardingDraftSave,
    db: AsyncSession = Depends(get_db),
):
    """
    Save partial onboarding progress (current step + profile fields) so the
    tenant can resume from where they left off if they return via a new invite
    link. No authentication required — the invite token is the credential.
    """
    await svc.save_onboarding_draft(token, body, db)


# ── Tenant CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=dict, dependencies=[require_permission("read", "tenant")])
async def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    search: str | None = Query(None),
    onboarding_state: str | None = Query(None, alias="onboardingState"),
    tenant_status: str | None = Query(None, alias="status"),
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_tenants(
        get_org_id(current_user), db, page, page_size, search, onboarding_state, tenant_status
    )


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_tenant(tenant_id, get_org_id(current_user), db)


@router.put("/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdate,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    tenant = await svc.update_tenant(tenant_id, body, org_id, db)
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="tenant",
        resource_id=tenant_id,
        resource_label=tenant.first_name,
        action="tenant.updated",
        request=request,
    )
    return tenant


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    existing = await svc.get_tenant(tenant_id, org_id, db)
    label = existing.first_name if existing else None
    await svc.delete_tenant(tenant_id, org_id, db)
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="tenant",
        resource_id=tenant_id,
        resource_label=label,
        action="tenant.deleted",
        request=request,
    )


# ── Approve / Reject ──────────────────────────────────────────────────────────

@router.patch("/{tenant_id}/approve", response_model=TenantOut)
async def approve_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    tenant = await svc.approve_tenant(tenant_id, org_id, db)
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="tenant",
        resource_id=tenant_id,
        resource_label=tenant.first_name,
        action="tenant.approved",
        request=request,
    )
    return tenant


class RejectBody(BaseModel):
    reason: str = "Application did not meet requirements."


@router.patch("/{tenant_id}/reject", response_model=TenantOut)
async def reject_tenant(
    tenant_id: uuid.UUID,
    body: RejectBody,
    request: Request,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    tenant = await svc.reject_tenant(tenant_id, body.reason, org_id, db)
    await audit_service.append(
        db,
        organisation_id=org_id,
        actor_id=current_user.id,
        actor_role=next(iter(current_user.roles), None),
        resource_type="tenant",
        resource_id=tenant_id,
        resource_label=tenant.first_name,
        action="tenant.rejected",
        event_data={"reason": body.reason},
        request=request,
    )
    return tenant


# ── Resend invite ─────────────────────────────────────────────────────────────

@router.post("/{tenant_id}/resend-invite", response_model=TenantInviteOut)
async def resend_invite(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a fresh 72-hour invite link for a tenant whose previous link
    expired or who was rejected and needs another chance.

    Allowed for onboarding states: invited, started, rejected.
    Blocked for: submitted, approved, activated.
    """
    return await svc.resend_invite(tenant_id, get_org_id(current_user), db)


# ── Cancel invite ─────────────────────────────────────────────────────────────

@router.delete("/{tenant_id}/invite", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_invite(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel all pending invites for this tenant and reset their onboarding state.
    Only valid for invited / started states.
    """
    await svc.cancel_invite(tenant_id, get_org_id(current_user), db)


# ── Resend login credentials ─────────────────────────────────────────────────

@router.post("/{tenant_id}/resend-login", response_model=dict)
async def resend_login_credentials(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """
    (Re-)send login credentials to an activated tenant.

    Creates the tenant's Logto account if it doesn't exist yet, resets their
    password, and emails them a temporary password with a link to the portal.

    Only allowed for tenants in the 'activated' state.
    """
    return await svc.resend_login_credentials(tenant_id, get_org_id(current_user), db)


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/documents", response_model=list[TenantDocumentOut])
async def list_documents(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = Depends(_own_tenant_or_manager),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_documents(tenant_id, get_org_id(current_user), db)


@router.post(
    "/{tenant_id}/documents",
    response_model=TenantDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    tenant_id: uuid.UUID,
    body: TenantDocumentCreate,
    current_user: CurrentUser = Depends(_own_tenant_or_manager),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "document_storage", db)
    return await svc.upload_document(tenant_id, body, org_id, db)


@router.patch("/{tenant_id}/documents/{document_id}/verify", response_model=TenantDocumentOut)
async def verify_document(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.verify_document(tenant_id, document_id, get_org_id(current_user), db)


@router.delete("/{tenant_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: CurrentUser = Depends(_own_tenant_or_manager),
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_document(tenant_id, document_id, get_org_id(current_user), db)


# ── GDPR ──────────────────────────────────────────────────────────────────────

@router.post("/{tenant_id}/anonymise", status_code=status.HTTP_204_NO_CONTENT)
async def anonymise_tenant(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.anonymise_tenant(
        tenant_id,
        get_org_id(current_user),
        db,
        requested_by_profile_id=current_user.profile.id,
    )
