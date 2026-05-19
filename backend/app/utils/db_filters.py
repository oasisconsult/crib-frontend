"""
Shared query filter helpers.

org_scope — applies an organisation_id filter to a SELECT query,
            or returns the query unchanged when org_id is None (superadmin).
"""
from __future__ import annotations

import uuid

from sqlalchemy import Select


def org_scope(q: Select, column, org_id: uuid.UUID | None) -> Select:
    """
    Conditionally filter a query by organisation_id.

    - org_id is a UUID  → add WHERE column = org_id  (normal users)
    - org_id is None    → return query unchanged       (superadmin, cross-org)
    """
    if org_id is not None:
        return q.where(column == org_id)
    return q
