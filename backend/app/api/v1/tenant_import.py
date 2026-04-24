"""
Bulk tenant import API.

Endpoints:
  GET  /tenants/import/template  — download a CSV template
  POST /tenants/import/preview   — parse & validate CSV, return preview (no DB writes)
  POST /tenants/import/commit    — validate & persist tenants + leases
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.services.tenant_import_service import (
    MAX_FILE_BYTES,
    TenantImportPreviewResponse,
    TenantImportResultResponse,
    build_preview,
    commit_import,
    generate_template_csv,
    parse_csv,
)

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/tenants/import", tags=["tenant-import"])

_ALLOWED_ROLES = ("owner", "manager", "superadmin")


# ── Template ───────────────────────────────────────────────────────────────────

@router.get(
    "/template",
    summary="Download tenant CSV import template",
    dependencies=[Depends(require_role(*_ALLOWED_ROLES))],
)
async def get_import_template() -> Response:
    csv_content = generate_template_csv()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="tenant_import_template.csv"'},
    )


# ── Preview ────────────────────────────────────────────────────────────────────

@router.post(
    "/preview",
    response_model=TenantImportPreviewResponse,
    summary="Preview import — parse & validate CSV without writing to DB",
    dependencies=[Depends(require_role(*_ALLOWED_ROLES))],
)
async def preview_import(
    file: UploadFile,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantImportPreviewResponse:
    _validate_upload(file)
    content = await file.read()
    _check_size(content)

    rows, errors = parse_csv(content)
    if errors:
        # Return parse errors immediately — no org context needed
        return TenantImportPreviewResponse(
            tenants=[], total_tenants=0, with_lease=0, profile_only=0,
            errors=errors, warnings=[], is_valid=False,
        )
    organisation_id = _resolve_org_id(current_user)
    return await build_preview(rows, [], db, organisation_id)


# ── Commit ─────────────────────────────────────────────────────────────────────

@router.post(
    "/commit",
    response_model=TenantImportResultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Commit import — write validated CSV data to the database",
    dependencies=[Depends(require_role(*_ALLOWED_ROLES))],
)
async def commit_import_endpoint(
    file: UploadFile,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantImportResultResponse:
    _validate_upload(file)
    content = await file.read()
    _check_size(content)

    rows, errors = parse_csv(content)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"row": e.row, "column": e.column, "message": e.message} for e in errors],
        )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV contains no valid rows",
        )

    result = await commit_import(rows=rows, db=db, profile=current_user.profile)
    await db.commit()
    log.info(
        "tenant_import.api_committed",
        user_id=str(current_user.profile.id),
        imported=result.imported_tenants,
    )
    return result


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_upload(file: UploadFile) -> None:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV files are accepted",
        )


def _check_size(content: bytes) -> None:
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit",
        )


def _resolve_org_id(current_user: CurrentUser) -> uuid.UUID:
    org_id = current_user.profile.organisation_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account is not linked to an organisation — complete onboarding first",
        )
    return org_id
