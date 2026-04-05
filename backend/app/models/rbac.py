"""
RBAC models — roles, resources, permissions, and role_permission assignments.

Tables created by migration 010 (with SERIAL integer PKs).
Migration 011 adds a `priority` column to `roles`.

Design principles:
  - Roles are rows, not enum values — new roles can be added at runtime via the admin UI.
  - `Profile.role` (VARCHAR) stores the primary role name as a plain string.
  - `deps.py` reads role priority from this table so ordering is also DB-driven.
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RoleModel(Base):
    """
    Named role with an optional description and a numeric priority.

    Lower priority integer = higher privilege (superadmin=0, tenant=40).
    Priority drives CurrentUser._primary_role() without hardcoding role names.
    """

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=99)

    # Relationships
    role_permissions: Mapped[list[RolePermission]] = relationship(
        "RolePermission", back_populates="role", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RoleModel {self.name!r} priority={self.priority}>"


class Resource(Base):
    """A protected resource name (e.g. 'property', 'tenant', 'wallet')."""

    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    permissions: Mapped[list[Permission]] = relationship(
        "Permission", back_populates="resource", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Resource {self.name!r}>"


class Permission(Base):
    """A single action (create/read/update/delete) on a resource."""

    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("resource_id", "action", name="uq_perm_resource_action"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("resources.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)

    resource: Mapped[Resource] = relationship("Resource", back_populates="permissions")
    role_permissions: Mapped[list[RolePermission]] = relationship(
        "RolePermission", back_populates="permission", cascade="all, delete-orphan"
    )

    @property
    def key(self) -> str:
        """Compact string key: '<resource>:<action>' — used as cache key."""
        return f"{self.resource.name}:{self.action}"

    def __repr__(self) -> str:
        return f"<Permission {self.resource_id}:{self.action}>"


class RolePermission(Base):
    """Many-to-many join: role ↔ permission."""

    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )

    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )

    role: Mapped[RoleModel] = relationship("RoleModel", back_populates="role_permissions")
    permission: Mapped[Permission] = relationship("Permission", back_populates="role_permissions")

    def __repr__(self) -> str:
        return f"<RolePermission role={self.role_id} perm={self.permission_id}>"
