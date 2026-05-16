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

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_org_access
from app.core.database import get_db
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


# ── Direct create (no invite email) ──────────────────────────────────────────

@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """Create a tenant profile directly. No invite email is sent."""
    assert current_user.org_id is not None  # guaranteed by _write / require_org_access
    return await svc.create_tenant(body, current_user.org_id, db)


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

@router.get("", response_model=dict)
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
        current_user.org_id, db, page, page_size, search, onboarding_state, tenant_status
    )


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_tenant(tenant_id, current_user.org_id, db)


@router.put("/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_tenant(tenant_id, body, current_user.org_id, db)


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_tenant(tenant_id, current_user.org_id, db)


# ── Approve / Reject ──────────────────────────────────────────────────────────

@router.patch("/{tenant_id}/approve", response_model=TenantOut)
async def approve_tenant(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.approve_tenant(tenant_id, current_user.org_id, db)


class RejectBody(BaseModel):
    reason: str = "Application did not meet requirements."


@router.patch("/{tenant_id}/reject", response_model=TenantOut)
async def reject_tenant(
    tenant_id: uuid.UUID,
    body: RejectBody,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.reject_tenant(tenant_id, body.reason, current_user.org_id, db)


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
    return await svc.resend_invite(tenant_id, current_user.org_id, db)


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
    assert current_user.org_id is not None
    await svc.cancel_invite(tenant_id, current_user.org_id, db)


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
    return await svc.resend_login_credentials(tenant_id, current_user.org_id, db)  # type: ignore[arg-type]


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/documents", response_model=list[TenantDocumentOut])
async def list_documents(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_documents(tenant_id, current_user.org_id, db)


@router.post(
    "/{tenant_id}/documents",
    response_model=TenantDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    tenant_id: uuid.UUID,
    body: TenantDocumentCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.upload_document(tenant_id, body, current_user.org_id, db)


@router.patch("/{tenant_id}/documents/{document_id}/verify", response_model=TenantDocumentOut)
async def verify_document(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.verify_document(tenant_id, document_id, current_user.org_id, db)


@router.delete("/{tenant_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_document(tenant_id, document_id, current_user.org_id, db)


# ── GDPR ──────────────────────────────────────────────────────────────────────

@router.post("/{tenant_id}/anonymise", status_code=status.HTTP_204_NO_CONTENT)
async def anonymise_tenant(
    tenant_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.anonymise_tenant(tenant_id, current_user.org_id, db)
