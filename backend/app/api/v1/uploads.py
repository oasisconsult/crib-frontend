"""
File upload endpoints.

POST /upload/presign                       — presigned PUT URL (authenticated staff/tenant)
POST /upload/presign/onboarding/{token}    — presigned PUT URL for unauthenticated onboarding flow
PUT  /upload/local/{key:path}              — dev-only: accept the PUT and write to disk
GET  /upload/local/{key:path}              — dev-only: serve a locally stored file

The presign endpoint calls the active storage provider (configured via system settings).
When the provider is 'local' (default in development), the presigned URL points to the
/upload/local/ path below so local development works without any cloud credentials.

For S3 / R2 / MinIO, the presigned URL is a direct pre-authenticated PUT URL from the
provider — the file never passes through this server.
"""

from __future__ import annotations

import os
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.core.storage import get_storage_provider
from app.schemas.common import CamelModel
from app.services import settings_service

router = APIRouter(prefix="/upload", tags=["uploads"])

_staff = Depends(require_org_access(allow_tenant_own=False))

# Allowed upload categories
_VALID_CATEGORIES = {"document", "signature", "inspection_photo", "property_image"}


# ── Schemas ────────────────────────────────────────────────────────────────────

class PresignRequest(CamelModel):
    """
    The client passes the original filename, mime type, and context (category +
    optional entity IDs). The server constructs the object key so callers never
    craft arbitrary storage paths.
    """
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., alias="mimeType")
    category: str = Field(..., description="document | signature | inspection_photo | property_image")
    tenant_id: str | None = Field(default=None, alias="tenantId")
    lease_id: str | None = Field(default=None, alias="leaseId")
    inspection_id: str | None = Field(default=None, alias="inspectionId")
    expires_in: int = Field(default=900, ge=60, le=3600, alias="expiresIn")


class PresignResponse(CamelModel):
    upload_url: str
    public_url: str
    key: str
    expires_in: int
    provider: str


def _build_key(category: str, filename: str, **ids: str | None) -> str:
    """
    Construct a deterministic, collision-resistant object key.

    Pattern:  {category}/{entity_id}/{uuid4}/{safe_filename}
    Example:  documents/tenants/abc123/550e8400.../passport.pdf
    """
    import re
    # Sanitise filename — keep only safe characters
    safe_name = re.sub(r"[^\w.\-]", "_", filename)[:200]
    unique = _uuid.uuid4().hex

    if category == "document" and ids.get("tenant_id"):
        return f"documents/tenants/{ids['tenant_id']}/{unique}/{safe_name}"
    if category == "signature" and ids.get("tenant_id"):
        return f"signatures/tenants/{ids['tenant_id']}/{unique}/{safe_name}"
    if category == "inspection_photo" and ids.get("inspection_id"):
        return f"inspections/{ids['inspection_id']}/{unique}/{safe_name}"
    if category == "property_image":
        return f"properties/{ids.get('tenant_id', 'general')}/{unique}/{safe_name}"
    if ids.get("lease_id"):
        return f"{category}/leases/{ids['lease_id']}/{unique}/{safe_name}"
    # Fallback
    return f"{category}/misc/{unique}/{safe_name}"


async def _do_presign(
    body: PresignRequest,
    db: AsyncSession,
) -> PresignResponse:
    if body.category not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category. Must be one of: {', '.join(sorted(_VALID_CATEGORIES))}",
        )

    config = await settings_service.get_storage_config(db)
    try:
        provider = get_storage_provider(config)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    key = _build_key(
        body.category,
        body.filename,
        tenant_id=body.tenant_id,
        lease_id=body.lease_id,
        inspection_id=body.inspection_id,
    )
    upload_url = await provider.presign_upload(key, body.mime_type, body.expires_in)
    public_url = provider.public_url(key)

    return PresignResponse(
        upload_url=upload_url,
        public_url=public_url,
        key=key,
        expires_in=body.expires_in,
        provider=config.get("provider", "local"),
    )


# ── Presign endpoint (authenticated staff / tenant) ────────────────────────────

@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    body: PresignRequest,
    _: object = _staff,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a presigned PUT URL for direct browser-to-storage upload.

    Requires a valid org-scoped JWT with manager/owner/superadmin role.

    - **local** (dev): returns a URL pointing to `PUT /upload/local/{key}`.
    - **s3 / r2 / minio**: returns a real presigned URL — the file goes directly
      to cloud storage without passing through this server.
    """
    return await _do_presign(body, db)


# ── Presign endpoint (public — onboarding token auth) ─────────────────────────

@router.post("/presign/onboarding/{token}", response_model=PresignResponse)
async def presign_upload_onboarding(
    token: str,
    body: PresignRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a presigned PUT URL for a tenant who is completing onboarding.

    Authentication is the invite token in the URL path instead of a JWT.
    Only allows category='document' or 'signature' — not property images.
    """
    from datetime import datetime, timezone

    from app.models.tenant import InviteStatus, TenantInvite

    result = await db.execute(
        select(TenantInvite).where(TenantInvite.token == token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token")

    now = datetime.now(timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite token has expired")

    if invite.status == InviteStatus.accepted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding already completed")

    # Restrict which categories a public onboarding upload can use
    if body.category not in {"document", "signature"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only 'document' and 'signature' uploads are allowed during onboarding",
        )

    # Override tenantId with the one from the invite (don't trust the client value)
    body = PresignRequest(
        filename=body.filename,
        mime_type=body.mime_type,
        category=body.category,
        tenant_id=str(invite.tenant_id),
        expires_in=body.expires_in,
    )

    return await _do_presign(body, db)


# ── Local dev upload / serve ───────────────────────────────────────────────────

_UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")


@router.put("/local/{key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def local_upload(key: str, request: Request):
    """
    Dev-only: accept a raw PUT body and write it to the local uploads directory.
    This endpoint is the target of presigned URLs when provider='local'.
    """
    dest = os.path.join(_UPLOAD_DIR, key.replace("/", os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    body = await request.body()
    with open(dest, "wb") as f:
        f.write(body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/local/{key:path}")
async def local_serve(key: str):
    """Dev-only: serve a locally stored upload."""
    path = os.path.join(_UPLOAD_DIR, key.replace("/", os.sep))
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    # Basic path-traversal guard
    real_path = os.path.realpath(path)
    real_base = os.path.realpath(_UPLOAD_DIR)
    if not real_path.startswith(real_base + os.sep):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return FileResponse(real_path)
