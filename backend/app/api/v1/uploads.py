"""
File upload endpoints.

POST /upload/presign          — return a presigned PUT URL for direct browser-to-storage upload
PUT  /upload/local/{key:path} — dev-only: accept the PUT from the browser and write to disk
GET  /upload/local/{key:path} — dev-only: serve a locally stored file

The presign endpoint calls the active storage provider (configured via system settings).
When the provider is 'local' (default in development), the presigned URL points to the
/upload/local/ path below so local development works without any cloud credentials.

For S3 / R2 / MinIO, the presigned URL is a direct pre-authenticated PUT URL from the
provider — the file never passes through this server.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.core.storage import get_storage_provider
from app.schemas.common import CamelModel
from app.services import settings_service

router = APIRouter(prefix="/upload", tags=["uploads"])

_staff = Depends(require_org_access(allow_tenant_own=False))


# ── Schemas ────────────────────────────────────────────────────────────────────

class PresignRequest(CamelModel):
    key: str = Field(..., description="Object key / path in the storage bucket")
    mime_type: str = Field(..., alias="mimeType")
    expires_in: int = Field(default=900, ge=60, le=3600, alias="expiresIn")


class PresignResponse(CamelModel):
    upload_url: str
    public_url: str
    expires_in: int
    provider: str


# ── Presign endpoint ───────────────────────────────────────────────────────────

@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    body: PresignRequest,
    _: object = _staff,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a presigned PUT URL for direct browser-to-storage upload.

    - **local** (dev): returns a URL pointing to `PUT /upload/local/{key}`.
    - **s3 / r2 / minio**: returns a real presigned URL from the provider;
      the file goes directly to cloud storage without passing through this server.

    The client should:
    1. `PUT upload_url` with the file body and `Content-Type: {mime_type}`.
    2. After upload, reference `public_url` in the document record.
    """
    config = await settings_service.get_storage_config(db)
    try:
        provider = get_storage_provider(config)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    upload_url = await provider.presign_upload(body.key, body.mime_type, body.expires_in)
    public_url = provider.public_url(body.key)

    return PresignResponse(
        upload_url=upload_url,
        public_url=public_url,
        expires_in=body.expires_in,
        provider=config.get("provider", "local"),
    )


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
