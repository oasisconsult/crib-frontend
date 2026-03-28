"""Shared Pydantic response schemas used across all endpoints."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class CamelModel(BaseModel):
    """Base model that serialises to camelCase for the frontend."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=lambda s: "".join(
            word.capitalize() if i else word
            for i, word in enumerate(s.split("_"))
        ),
    )


class PaginatedResponse(CamelModel, Generic[T]):
    data: list[T]
    total: int
    page: int = 1
    page_size: int = Field(alias="pageSize", default=20)
    has_next: bool = Field(alias="hasNext", default=False)


class MessageResponse(CamelModel):
    message: str


class ErrorDetail(CamelModel):
    code: str
    message: str
    field: str | None = None


class ErrorResponse(CamelModel):
    errors: list[ErrorDetail]
