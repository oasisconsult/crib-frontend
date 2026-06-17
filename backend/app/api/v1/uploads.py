"""
File upload endpoints.

POST /upload/presign                       — presigned PUT URL (authenticated staff/tenant)
POST /upload/presign/onboarding/{token}    — presigned PUT URL for unauthenticated onboarding flow
POST /upload/file                          — proxy upload: backend streams file to storage
PUT  /upload/local/{key:path}              — dev-only: accept the PUT and write to disk
GET  /upload/local/{key:path}              — dev-only: serve a locally stored file

The proxy endpoint (/upload/file) is the preferred path when the storage backend
(MinIO) is not directly reachable from the browser. The file is uploaded to the
backend and forwarded to storage using the internal network endpoint, avoiding the
need to expose MinIO's S3 API port publicly or configure CORS on the bucket.
"""

from __future__ import annotations

import os
import uuid as _uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_org_access
from app.core.config import get_settings
from app.core.database import get_db
from app.core.storage import get_storage_provider
from app.schemas.common import CamelModel
from app.services import settings_service

router = APIRouter(prefix="/upload", tags=["uploads"])

_staff = Depends(require_org_access(allow_tenant_own=False))

# Allowed upload categories
_VALID_CATEGORIES = {"document", "signature", "inspection_photo", "property_image", "payment_receipt"}


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
        provider = get_storage_provider(config, local_base_url=get_settings().storage_local_base_url)
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


# ── Proxy upload endpoint ─────────────────────────────────────────────────────

@router.post("/file", response_model=PresignResponse)
async def upload_file_proxy(
    file: UploadFile = File(...),
    category: str = Form(...),
    tenant_id: str | None = Form(default=None),
    lease_id: str | None = Form(default=None),
    inspection_id: str | None = Form(default=None),
    _: object = _staff,
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a file through the backend to storage.

    Use instead of /presign when the storage backend (MinIO) is not
    directly reachable from the browser. The backend forwards the file
    to storage over the internal network — no public MinIO API port or
    bucket CORS configuration required.
    """
    if category not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category. Must be one of: {', '.join(sorted(_VALID_CATEGORIES))}",
        )

    config = await settings_service.get_storage_config(db)
    try:
        provider = get_storage_provider(config, local_base_url=get_settings().storage_local_base_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    key = _build_key(
        category,
        file.filename or "upload",
        tenant_id=tenant_id,
        lease_id=lease_id,
        inspection_id=inspection_id,
    )
    data = await file.read()
    mime = file.content_type or "application/octet-stream"
    public = await provider.upload(key, data, mime)

    return PresignResponse(
        upload_url="",
        public_url=public,
        key=key,
        expires_in=0,
        provider=config.get("provider", "local"),
    )


# ── Presign endpoint (authenticated tenant — payment receipts only) ────────

@router.post("/presign/payment-receipt", response_model=PresignResponse)
async def presign_payment_receipt(
    body: PresignRequest,
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Allow any authenticated user to upload a bank transfer / cash payment receipt.
    Category is forced to 'payment_receipt' — caller cannot override it.
    """
    body.category = "payment_receipt"
    return await _do_presign(body, db)


@router.post("/presign/tenant-document", response_model=PresignResponse)
async def presign_tenant_document(
    body: PresignRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Allow any authenticated user to upload their own ID documents or proof files.
    Category is forced to 'document' — caller cannot override it.
    tenant_id is injected from the calling user's profile so the key path is
    correctly scoped (document/tenants/{tenant_id}/{uuid}/{filename}).
    """
    body.category = "document"
    # Inject tenant_id from profile so key path is scoped correctly
    if not body.tenant_id and current_user.profile.tenant_id:
        body.tenant_id = str(current_user.profile.tenant_id)
    return await _do_presign(body, db)


@router.post("/presign/maintenance-photo", response_model=PresignResponse)
async def presign_maintenance_photo(
    body: PresignRequest,
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Allow any authenticated user (including tenants) to upload maintenance issue photos.
    Category is forced to 'inspection_photo' — caller cannot override it.
    """
    body.category = "inspection_photo"
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

    from app.models.tenant import TenantInvite

    result = await db.execute(
        select(TenantInvite).where(TenantInvite.token == token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token")

    now = datetime.now(timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite token has expired")

    # Do NOT block on invite.status == accepted — after a landlord rejects and
    # the tenant needs to upload more documents, submit_onboarding has already set
    # status=accepted from the previous submission. The expiry check above is the
    # correct security gate. submit_onboarding itself guards against re-activating
    # a fully activated tenant.

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


# ── Authenticated file proxy (MinIO / S3 private buckets) ────────────────────

@router.get("/serve/{key:path}")
async def serve_file(
    key: str,
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticated proxy for files stored in private MinIO/S3 buckets.

    The browser cannot reach MinIO directly (private bucket, internal network).
    This endpoint downloads the file server-side and streams it back to the
    authenticated caller. Used for inspection photos, tenant documents, etc.
    """
    import mimetypes
    from fastapi.responses import Response as _Response

    # Basic path-traversal guard — key must not escape its prefix
    if ".." in key or key.startswith("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid key")

    config = await settings_service.get_storage_config(db)
    try:
        provider = get_storage_provider(config, local_base_url=get_settings().storage_local_base_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    try:
        data = await provider.download(key)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    mime, _ = mimetypes.guess_type(key)
    return _Response(content=data, media_type=mime or "application/octet-stream")


# ── Public file proxy (inspection sign flow) ─────────────────────────────────

@router.get("/serve-public/{key:path}")
async def serve_file_public(
    key: str,
    sign_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Unauthenticated photo proxy for the tenant inspection sign page.
    Access is gated by a valid, unexpired inspection sign token.
    Only serves photos belonging to the inspection referenced by the token.
    """
    import mimetypes
    from datetime import datetime, timezone

    from fastapi.responses import Response as _Response

    from app.models.inspection import Inspection

    if ".." in key or key.startswith("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid key")

    if not key.startswith("inspections/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    insp = await db.scalar(select(Inspection).where(Inspection.sign_token == sign_token))
    if not insp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token")

    now = datetime.now(timezone.utc)
    if insp.sign_token_expires_at and insp.sign_token_expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")

    if not key.startswith(f"inspections/{insp.id}/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    config = await settings_service.get_storage_config(db)
    try:
        provider = get_storage_provider(config, local_base_url=get_settings().storage_local_base_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    try:
        data = await provider.download(key)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    mime, _ = mimetypes.guess_type(key)
    return _Response(content=data, media_type=mime or "application/octet-stream")


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
