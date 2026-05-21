"""
Bulk property + unit import API.

Endpoints:
  GET  /properties/import/template  — download a CSV template
  POST /properties/import/preview   — parse & validate CSV, return preview (no DB writes)
  POST /properties/import/commit    — validate & persist properties + units
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.models.profile import Profile
from app.services.subscription_limits import check_property_limit, check_unit_limit
from app.services.property_import_service import (
    MAX_FILE_BYTES,
    ImportPreviewResponse,
    ImportResultResponse,
    build_preview,
    commit_import,
    generate_template_csv,
    parse_csv,
)

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/properties/import", tags=["property-import"])


# ── Template ───────────────────────────────────────────────────────────────────

@router.get(
    "/template",
    summary="Download CSV import template",
    dependencies=[Depends(require_role("owner", "manager", "superadmin", "landlord"))],
)
async def get_import_template() -> Response:
    csv_content = generate_template_csv()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="property_import_template.csv"'},
    )


# ── Preview ────────────────────────────────────────────────────────────────────

@router.post(
    "/preview",
    response_model=ImportPreviewResponse,
    summary="Preview import — parse & validate CSV without writing to DB",
    dependencies=[Depends(require_role("owner", "manager", "superadmin", "landlord"))],
)
async def preview_import(
    file: UploadFile,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImportPreviewResponse:
    _validate_upload(file)
    content = await file.read()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit",
        )

    rows, errors = parse_csv(content)

    organisation_id = _resolve_org_id(current_user)
    return await build_preview(rows, errors, db, organisation_id)


# ── Commit ─────────────────────────────────────────────────────────────────────

@router.post(
    "/commit",
    response_model=ImportResultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Commit import — write validated CSV data to the database",
    dependencies=[Depends(require_role("owner", "manager", "superadmin", "landlord"))],
)
async def commit_import_endpoint(
    file: UploadFile,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImportResultResponse:
    _validate_upload(file)
    content = await file.read()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit",
        )

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

    profile: Profile = current_user.profile

    # ── Subscription limit checks (atomic — reject entire import if over limit) ──
    if profile.organisation_id:
        # Count distinct property names in the CSV (each unique name = 1 property)
        import_property_count = len({r.property_name for r in rows})
        import_unit_count = len(rows)  # each row = 1 unit
        await check_property_limit(
            profile.organisation_id, db, adding=import_property_count
        )
        await check_unit_limit(
            profile.organisation_id, db, adding=import_unit_count
        )

    result = await commit_import(rows=rows, db=db, profile=profile)
    await db.commit()
    log.info("property_import.api_committed", user_id=str(profile.id), properties=result.imported_properties)
    return result


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_upload(file: UploadFile) -> None:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV files are accepted",
        )


def _resolve_org_id(current_user: CurrentUser) -> uuid.UUID:
    org_id = current_user.profile.organisation_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account is not linked to an organisation — complete onboarding first",
        )
    return org_id
