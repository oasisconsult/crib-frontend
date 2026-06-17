"""Utility billing schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field, model_validator

from app.schemas.common import CamelModel

UTILITY_TYPES = {"water", "electricity", "internet", "garbage", "other"}
BILLING_TYPES = {"metered", "fixed"}


class UtilityReadingCreate(CamelModel):
    utility_type: str = Field(..., description="water | electricity | internet | garbage | other")
    billing_type: str = Field("fixed", description="metered | fixed")
    reading_date: date
    # Metered fields
    reading_value: float | None = Field(None, gt=0)
    previous_value: float | None = Field(None, ge=0)
    unit_price: float | None = Field(None, gt=0)
    # Fixed amount (for billing_type == "fixed", or override for metered)
    amount: float | None = Field(None, gt=0)
    currency: str = "UGX"
    notes: str | None = None
    auto_bill: bool = True  # create a Payment immediately

    @model_validator(mode="after")
    def _check_fields(self) -> "UtilityReadingCreate":
        if self.billing_type == "metered":
            if self.reading_value is None or self.previous_value is None or self.unit_price is None:
                raise ValueError(
                    "reading_value, previous_value, and unit_price are required for metered billing"
                )
            if self.reading_value < self.previous_value:
                raise ValueError("reading_value must be >= previous_value")
        elif self.billing_type == "fixed":
            if self.amount is None:
                raise ValueError("amount is required for fixed billing")
        return self


class UtilityReadingOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    lease_id: uuid.UUID
    unit_id: uuid.UUID | None
    utility_type: str
    billing_type: str
    reading_date: date
    reading_value: float | None
    previous_value: float | None
    units_consumed: float | None
    unit_price: float | None
    amount: float
    currency: str
    notes: str | None
    payment_id: uuid.UUID | None
    is_billed: bool
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
