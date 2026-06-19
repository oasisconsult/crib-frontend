"""
Document signing service — cryptographic evidence layer.

Responsibilities:
  1. Email OTP generation + verification (identity binding)
  2. SHA-256 document hash (tamper evidence)
  3. Signing event audit log (append-only JSONB)
  4. Sealed certificate PDF generation (WeasyPrint) + upload (MinIO/S3)

Called by onboarding_service.py at sign / presign / countersign time.
Never modifies TenancyAgreement.status — that remains the onboarding service's job.
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.document_signing.model import SigningOtp
from app.models.tenancy_agreement import TenancyAgreement

log = logging.getLogger(__name__)

_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
_jinja = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)

OTP_TTL_MINUTES = 15


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _mask_email(email: str) -> str:
    """te***@gmail.com"""
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    visible = local[:2] if len(local) >= 2 else local[:1]
    return f"{visible}***@{domain}"


def compute_html_hash(html: str) -> str:
    """SHA-256 of the rendered agreement HTML (UTF-8 encoded)."""
    return hashlib.sha256(html.encode("utf-8")).hexdigest()


# ── OTP ───────────────────────────────────────────────────────────────────────

async def request_otp(
    lease_id: uuid.UUID,
    email: str,
    purpose: str,
    db: AsyncSession,
) -> str:
    """
    Generate a 6-digit OTP, store its hash, send it by email.
    Invalidates any previous unused OTP for the same lease+purpose.
    Returns the masked email address.
    """
    from app.services.settings_service import get_email_provider_from_db

    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = _hash_code(code)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

    # Invalidate previous unused OTPs for this lease + purpose
    await db.execute(
        update(SigningOtp)
        .where(
            SigningOtp.lease_id == lease_id,
            SigningOtp.purpose == purpose,
            SigningOtp.used_at.is_(None),
        )
        .values(used_at=now)
    )

    otp = SigningOtp(
        lease_id=lease_id,
        email=email,
        code_hash=code_hash,
        purpose=purpose,
        expires_at=expires_at,
    )
    db.add(otp)
    await db.flush()

    # Send email (best-effort — failure raises so client can retry)
    try:
        provider = await get_email_provider_from_db(db)
        result = await provider.send(
            recipient_name="",
            recipient_email=email,
            recipient_phone=None,
            subject="Your signing verification code",
            body=(
                f"Your verification code for signing your tenancy agreement is:\n\n"
                f"  {code}\n\n"
                f"This code expires in {OTP_TTL_MINUTES} minutes.\n"
                "If you did not request this, please contact your property manager.\n\n"
                "— The Crib Team"
            ),
        )
        if not result.success:
            log.warning("document_signing.otp_email_failed lease_id=%s reason=%s", lease_id, result.failure_reason)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not send verification email. Please try again.",
            )
    except HTTPException:
        raise
    except Exception:
        log.exception("document_signing.otp_email_exception lease_id=%s", lease_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send verification email. Please try again.",
        )

    log.info("document_signing.otp_sent lease_id=%s purpose=%s", lease_id, purpose)
    return _mask_email(email)


async def verify_otp(
    lease_id: uuid.UUID,
    code: str,
    purpose: str,
    db: AsyncSession,
) -> None:
    """
    Verify a signing OTP.  Marks it used on success.
    Raises HTTP 422 on invalid / expired code.
    """
    code_hash = _hash_code(code)
    now = datetime.now(timezone.utc)

    otp = await db.scalar(
        select(SigningOtp).where(
            SigningOtp.lease_id == lease_id,
            SigningOtp.code_hash == code_hash,
            SigningOtp.purpose == purpose,
            SigningOtp.used_at.is_(None),
            SigningOtp.expires_at > now,
        )
    )
    if not otp:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid or expired verification code.",
        )

    otp.used_at = now
    await db.flush()
    log.info("document_signing.otp_verified lease_id=%s purpose=%s", lease_id, purpose)


# ── Signing event log ─────────────────────────────────────────────────────────

def append_signing_event(ta: TenancyAgreement, event: dict[str, Any]) -> None:
    """
    Append an event to ta.signing_events (JSONB list).
    Always includes an ISO timestamp.
    Must call db.flush() / await db.commit() after to persist.
    """
    event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    current: list = list(ta.signing_events or [])
    current.append(event)
    ta.signing_events = current  # reassign to trigger JSONB change detection


# ── Sealed PDF ────────────────────────────────────────────────────────────────

def _build_certificate_html(ta: TenancyAgreement) -> str:
    """Render the certificate-of-signing page as an HTML fragment."""
    template = _jinja.get_template("certificate.html")
    events = ta.signing_events or []
    return template.render(
        agreement_id=str(ta.id),
        lease_id=str(ta.lease_id),
        document_hash=ta.document_hash or "—",
        generated_at=datetime.now(timezone.utc).strftime("%-d %B %Y at %H:%M UTC"),
        signing_events=events,
        status=ta.status.value,
    )


def _inject_certificate(agreement_html: str, cert_fragment: str) -> str:
    """Inject the certificate page into the agreement HTML before </body>."""
    marker = "</body>"
    page_break = '<div style="page-break-before:always;margin:0;padding:0">'
    injected = f"{page_break}{cert_fragment}</div>"
    if marker in agreement_html:
        return agreement_html.replace(marker, injected + marker, 1)
    return agreement_html + injected


async def generate_sealed_pdf(
    ta: TenancyAgreement,
    db: AsyncSession,
) -> str | None:
    """
    Render the agreement HTML + certificate page to PDF via WeasyPrint,
    upload to MinIO/S3, store URL in ta.sealed_pdf_url, return the URL.

    Non-fatal: returns None and logs on any error so signing still completes.
    """
    try:
        from weasyprint import HTML as WP  # type: ignore[import]

        from app.core.config import get_settings
        from app.core.storage import get_storage_provider
        from app.services.settings_service import get_storage_config

        cert_html = _build_certificate_html(ta)
        full_html = _inject_certificate(ta.rendered_html, cert_html)
        pdf_bytes: bytes = WP(string=full_html, base_url="/").write_pdf()

        config = await get_storage_config(db)
        provider = get_storage_provider(
            config, local_base_url=get_settings().storage_local_base_url
        )
        key = f"agreements/{ta.lease_id}/sealed_{ta.id}.pdf"
        public_url = await provider.upload(key, pdf_bytes, "application/pdf")

        ta.sealed_pdf_url = public_url

        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
        append_signing_event(ta, {
            "event": "sealed_pdf_generated",
            "pdf_hash": pdf_hash,
            "url": public_url,
        })

        log.info("document_signing.sealed_pdf_uploaded ta_id=%s url=%s", ta.id, public_url)
        return public_url

    except Exception:
        log.exception("document_signing.sealed_pdf_failed ta_id=%s", ta.id)
        return None
