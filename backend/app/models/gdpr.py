"""
GdprRequest — audit log for all data-erasure and soft-delete events.

Every call to anonymise_tenant() or anonymise_profile() writes one row here.
The log is append-only; rows are never updated or deleted.

subject_type   — 'tenant' | 'profile'
subject_id     — UUID of the erased record (kept even after the record is gone)
request_type   — 'soft_delete' (PII retained, row hidden)
                 'anonymise'   (PII zeroed, row kept for financial audit)
fields_cleared — JSON list of field names that were overwritten/nulled, e.g.
                 ["email", "phone", "nin", "whatsapp_number"]
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GdprRequest(Base):
    """Immutable audit record for a GDPR erasure or soft-delete event."""

    __tablename__ = "gdpr_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )

    # ── What was erased ───────────────────────────────────────────────────────
    subject_type: Mapped[str] = mapped_column(String(50), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # ── Operation type ────────────────────────────────────────────────────────
    request_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # ── Who triggered it ──────────────────────────────────────────────────────
    # NULL when triggered by an automated data-retention job.
    requested_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Timing ────────────────────────────────────────────────────────────────
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Detail ────────────────────────────────────────────────────────────────
    # List of field names that were overwritten or nulled.
    fields_cleared: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="'[]'::jsonb"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<GdprRequest {self.request_type} "
            f"{self.subject_type}={self.subject_id} "
            f"at={self.requested_at}>"
        )
