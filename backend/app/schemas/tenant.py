"""Pydantic schemas for Tenant endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


# ── Emergency contact ─────────────────────────────────────────────────────────

class EmergencyContactSchema(CamelModel):
    name: str
    relationship: str
    phone: str
    email: str | None = None


# ── Tenant ────────────────────────────────────────────────────────────────────

class TenantInviteCreate(CamelModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    property_id: str
    unit_id: str | None = None
    lease_id: str | None = None   # optional — links a draft lease to this invite


class TenantUpdate(CamelModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = None
    date_of_birth: str | None = None
    nationality: str | None = None
    nin: str | None = None
    whatsapp_number: str | None = None
    mobile_money_provider: str | None = None
    mobile_money_number: str | None = None
    status: str | None = None
    emergency_contact: EmergencyContactSchema | None = None
    notes: str | None = None
    tags: list[str] | None = None


class OnboardingDocumentSubmit(CamelModel):
    """A document uploaded during onboarding, referenced by its storage key."""
    type: str = Field(min_length=1, max_length=50, description="IdDocumentType value")
    name: str = Field(min_length=1, max_length=255, description="Human-readable label, e.g. 'Passport'")
    url: str = Field(min_length=1, description="Public URL returned by the presign response")
    key: str = Field(min_length=1, description="Storage object key returned by presign")
    mime_type: str = Field(min_length=1, max_length=100)
    size_bytes: int = Field(default=0, ge=0)
    expires_at: str | None = None


class TenantOnboardingSubmit(CamelModel):
    """Data submitted by the tenant during onboarding."""
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = None
    date_of_birth: str | None = None
    nationality: str | None = None
    nin: str | None = None                           # National Identification Number
    whatsapp_number: str | None = None               # WhatsApp / contact number
    mobile_money_provider: str | None = None         # mtn | airtel
    mobile_money_number: str | None = None           # Mobile money account number
    emergency_contact: EmergencyContactSchema | None = None
    gdpr_consent: bool = Field(default=False)
    documents: list[OnboardingDocumentSubmit] = Field(default_factory=list)


class OnboardingDraftSave(CamelModel):
    """
    Partial progress saved server-side so the tenant can resume from where
    they left off when they return via a resent invite link.

    Only profile-level fields and the current step are stored here.
    Documents are persisted as TenantDocument rows on upload, so they
    don't need to be included in the draft.
    """
    step: str = Field(description="profile | documents | signature")
    phone: str | None = None
    date_of_birth: str | None = None
    nationality: str | None = None
    emergency_contact: EmergencyContactSchema | None = None


class TenantOut(CamelModel):
    id: str
    user_id: str | None           # logto_user_id — frontend calls it userId
    landlord_id: str              # organisation_id — frontend calls it landlordId
    first_name: str
    last_name: str
    email: str
    phone: str | None
    date_of_birth: str | None
    nationality: str | None
    nin: str | None
    whatsapp_number: str | None
    mobile_money_provider: str | None
    mobile_money_number: str | None
    status: str
    onboarding_state: str
    onboarding_token: str | None
    onboarding_completed_at: str | None
    rejection_reason: str | None
    current_property_id: str | None
    current_unit_id: str | None
    current_lease_id: str | None
    emergency_contact: dict[str, Any] | None
    notes: str | None
    tags: list[str]
    gdpr_consent_at: str | None
    data_retention_until: str | None
    onboarding_draft: dict | None
    documents: list["TenantDocumentOut"]
    created_at: str
    updated_at: str


# ── TenantInvite ──────────────────────────────────────────────────────────────

class TenantInviteOut(CamelModel):
    id: str
    landlord_id: str
    property_id: str | None
    unit_id: str | None
    lease_id: str | None
    email: str
    name: str
    token: str
    status: str
    sent_at: str
    expires_at: str


# ── TenantDocument ────────────────────────────────────────────────────────────

class TenantDocumentCreate(CamelModel):
    type: str
    name: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1)
    mime_type: str
    size_bytes: int = Field(default=0, ge=0)
    expires_at: str | None = None


class TenantDocumentOut(CamelModel):
    id: str
    tenant_id: str
    type: str
    name: str
    url: str
    mime_type: str
    size_bytes: int
    verified: bool
    uploaded_at: str
    expires_at: str | None


# ── Onboarding response ───────────────────────────────────────────────────────

class OnboardingResponse(CamelModel):
    tenant: TenantOut
    invite: TenantInviteOut
