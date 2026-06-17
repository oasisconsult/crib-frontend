"""Pydantic schemas for the document signing feature."""

from __future__ import annotations

from app.schemas.common import CamelModel


class OtpRequestOut(CamelModel):
    """Response after requesting a signing OTP."""
    lease_id: str
    email_masked: str       # e.g. "te***@gmail.com"
    expires_in_minutes: int = 15


class SealedAgreementOut(CamelModel):
    """Response when the sealed PDF is available."""
    lease_id: str
    agreement_id: str
    status: str             # "fully_executed" | "pending_countersign"
    document_hash: str | None
    sealed_pdf_url: str | None
    signing_event_count: int


class SigningEventOut(CamelModel):
    event: str
    actor: str | None
    timestamp: str
    ip: str | None = None
    otp_verified: bool = False
    session_authenticated: bool = False
