"""General-purpose audit log model.

Rows are immutable append-only records — never updated or deleted.
Intentionally does NOT extend TimestampedBase (which adds updated_at).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    # NULL = superadmin platform-level action not scoped to any org
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Role snapshotted at the time of the action — the profile role may change later
    actor_role: Mapped[str | None] = mapped_column(String(32), nullable=True)

    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Denormalized display name — preserved even after resources are renamed/deleted
    resource_label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    action: Mapped[str] = mapped_column(String(64), nullable=False)

    # { "field": { "before": ..., "after": ... } } for updates
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Event-specific extras (reason, amount, etc.) — named event_data to avoid SQLAlchemy reserved name
    event_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Correlates with X-Request-ID from structlog context
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.resource_type}.{self.action} org={self.organisation_id}>"
