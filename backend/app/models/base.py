"""
SQLAlchemy declarative base with common columns.

All domain models inherit from TimestampedBase which provides:
  - id:         UUID primary key (generated server-side)
  - created_at: UTC timestamp, set on insert
  - updated_at: UTC timestamp, updated on every write
"""

import uuid

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base — all models must use this."""
    pass


class TimestampedBase(Base):
    """Abstract mixin: UUID PK + created_at + updated_at."""

    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
