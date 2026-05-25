"""
GDPR service — profile erasure and audit helpers.

Tenant erasure lives in tenant_service.anonymise_tenant() because it is
tightly coupled to lease/document state.  This module handles:

  anonymise_profile()  — erase PII on a Profile row (platform user account)
  get_gdpr_log()       — paginated audit log for superadmin / compliance

Right to Erasure design (Art. 17 GDPR)
--------------------------------------
* PII fields are overwritten with anonymous placeholders.
* The row is kept (deleted_at + anonymised_at set) for referential integrity
  — payments, leases, audit entries all reference profile IDs.
* The corresponding Logto account should be suspended/deleted by the caller
  after this function returns (the service has no Logto dependency here so
  it can be used in tests without a live Logto instance).
* All erasures are logged in gdpr_requests for compliance reporting.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gdpr import GdprRequest
from app.models.profile import Profile


# PII fields on Profile that are cleared during erasure.
_PROFILE_PII_FIELDS = [
    "display_name", "email", "phone", "avatar_url",
]


async def anonymise_profile(
    profile_id: uuid.UUID,
    db: AsyncSession,
    *,
    requested_by_profile_id: uuid.UUID | None = None,
) -> None:
    """
    GDPR right to erasure for a platform user's Profile.

    Overwrites all PII, sets anonymised_at + deleted_at, and writes a
    GdprRequest audit row.

    The caller is responsible for:
      - Suspending / deleting the corresponding Logto account.
      - Soft-deleting or anonymising any linked Tenant record separately
        (use tenant_service.anonymise_tenant() for that).
    """
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    if profile.anonymised_at is not None:
        # Idempotent — already erased; nothing to do.
        return

    now = datetime.now(timezone.utc)
    anon_id = str(profile_id)[:8]

    profile.display_name = "Deleted User"
    profile.email        = f"deleted-{anon_id}@deleted.invalid"
    profile.phone        = None
    profile.avatar_url   = None
    profile.anonymised_at = now
    profile.deleted_at   = now

    await db.flush()

    db.add(GdprRequest(
        subject_type="profile",
        subject_id=profile_id,
        request_type="anonymise",
        requested_by_profile_id=requested_by_profile_id,
        completed_at=now,
        fields_cleared=_PROFILE_PII_FIELDS,
        notes="Profile PII erased. Caller must suspend/delete the Logto account.",
    ))
    await db.flush()


async def get_gdpr_log(
    db: AsyncSession,
    *,
    subject_type: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Paginated GDPR audit log — superadmin / compliance use only.

    Returns { items: [...], total: int, page: int, page_size: int }.
    """
    from sqlalchemy import func

    q = select(GdprRequest)
    if subject_type:
        q = q.where(GdprRequest.subject_type == subject_type)
    q = q.order_by(desc(GdprRequest.requested_at))

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = (
        await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    return {
        "items": [
            {
                "id":                      str(r.id),
                "subjectType":             r.subject_type,
                "subjectId":               str(r.subject_id),
                "requestType":             r.request_type,
                "requestedByProfileId":    str(r.requested_by_profile_id) if r.requested_by_profile_id else None,
                "requestedAt":             r.requested_at.isoformat(),
                "completedAt":             r.completed_at.isoformat() if r.completed_at else None,
                "fieldsCleared":           r.fields_cleared,
                "notes":                   r.notes,
            }
            for r in rows
        ],
        "total":    total,
        "page":     page,
        "pageSize": page_size,
    }
