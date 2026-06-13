"""
EFRIS HTTP client — handles communication with the URA EFRIS API.

For mock environment (environment='mock'):
  Sends plain JSON; no encryption required.
  Mock server returns standard URA response shapes.

For UAT/prod environments (future):
  The real URA API requires AES-encrypted data payloads with RSA key exchange.
  Token caching: Redis key crib:efris:token:{org_id}  TTL = 3540s
  TODO: add encryption layer when connecting to real URA servers.

Security:
  - Never logs password, password_encrypted, or access token values
  - Raises ValueError if api_url is http:// in non-mock environment
  - Token never persisted to DB; cached in Redis only
"""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.efris.schemas import (
    EfrisInvoiceRequest,
    EfrisInvoiceResponse,
    LoginResponse,
    ReturnStateInfo,
)

log = logging.getLogger(__name__)

_REDIS_TOKEN_TTL = 3540        # 59 minutes (URA tokens expire at 60 min)
_REQUEST_TIMEOUT = 30.0        # seconds


class EfrisApiError(Exception):
    """Raised when URA EFRIS API returns a non-success response."""
    def __init__(self, code: str, message: str, status_code: int = 0) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(f"EFRIS API error [{code}]: {message}")


class EfrisNotConfiguredError(Exception):
    """Raised when an org has no active EFRIS configuration."""


class EfrisClient:
    """HTTP client for the URA EFRIS API."""

    def __init__(
        self,
        *,
        org_id: uuid.UUID,
        environment: str,
        api_url: str,
        tin: str,
        device_no: str,
        username: str,
        password: str,             # decrypted; never logged
        taxpayer_id: str = "",
        qr_code_url: str = "",
    ) -> None:
        if environment not in ("mock", "uat", "prod"):
            raise ValueError(f"Invalid EFRIS environment: {environment!r}")
        if environment != "mock" and api_url.startswith("http://"):
            raise ValueError(
                "EFRIS api_url must use HTTPS in non-mock environments. "
                f"Got: {api_url[:20]}..."
            )

        self.org_id = org_id
        self.environment = environment
        self.api_url = api_url.rstrip("/")
        self.tin = tin
        self.device_no = device_no
        self.username = username
        self._password = password      # private — never exposed
        self.taxpayer_id = taxpayer_id
        self.qr_code_url = qr_code_url

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _now_str(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    def _build_global_info(self, interface_code: str) -> dict:
        return {
            "appId": "AP04",
            "version": "1.1.20191201",
            "dataExchangeId": "1",
            "interfaceCode": interface_code,
            "requestCode": "TP",
            "requestTime": self._now_str(),
            "responseCode": "TA",
            "userName": self.username,
            "deviceMAC": "FFFFFFFFFFFF",
            "deviceNo": self.device_no,
            "tin": self.tin,
            "brn": "",
            "taxpayerId": self.taxpayer_id,
            "longitude": "32.5726",
            "latitude": "0.3476",
            "agentType": "0",
        }

    async def _post(self, interface_code: str, data: dict | None = None) -> dict:
        payload = {
            "data": {"content": data or {}},
            "globalInfo": self._build_global_info(interface_code),
            "returnStateInfo": {"returnCode": "", "returnMessage": ""},
        }
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as http:
            resp = await http.post(self.api_url, json=payload)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        body = resp.json()
        return_state = body.get("returnStateInfo", {})
        return_code = return_state.get("returnCode", "")
        return_message = return_state.get("returnMessage", "")

        if resp.status_code != 200 or return_code not in ("", "00"):
            raise EfrisApiError(
                code=return_code or str(resp.status_code),
                message=return_message or resp.text[:200],
                status_code=resp.status_code,
            )

        log.debug(
            "EFRIS %s ok org=%s env=%s duration_ms=%d",
            interface_code, self.org_id, self.environment, elapsed_ms,
        )
        return body

    # ── Public API ─────────────────────────────────────────────────────────────

    async def login(self, redis) -> LoginResponse:
        """Call T103 to authenticate and cache the session token in Redis.

        The returned taxpayer_id must be stored in OrganisationEfrisConfig
        for use in subsequent encrypted requests.
        """
        redis_key = f"crib:efris:token:{self.org_id}"
        cached = await redis.get(redis_key)
        if cached:
            log.debug("EFRIS: using cached token for org=%s env=%s", self.org_id, self.environment)
            import json
            data = json.loads(cached)
            return LoginResponse(**data)

        body = await self._post("T103")
        content = body.get("data", {}).get("content", {})
        taxpayer_data = content.get("taxpayerInfo", content)  # mock may flatten

        login_resp = LoginResponse(
            id=taxpayer_data.get("id", ""),
            tin=taxpayer_data.get("tin", self.tin),
            legal_name=taxpayer_data.get("legalName", ""),
            business_name=taxpayer_data.get("businessName", ""),
            taxpayer_type=taxpayer_data.get("taxpayerType", ""),
            contact_email=taxpayer_data.get("contactEmail", ""),
            contact_mobile=taxpayer_data.get("contactMobile", ""),
            web_service_url=taxpayer_data.get("webServiceURL", self.api_url),
            qr_code_url=taxpayer_data.get("qrCodeURL", ""),
            environment=taxpayer_data.get("environment", "1"),
        )
        self.taxpayer_id = login_resp.id

        import json
        await redis.set(redis_key, json.dumps(login_resp.model_dump()), ex=_REDIS_TOKEN_TTL)
        log.debug("EFRIS: token refreshed for org=%s env=%s", self.org_id, self.environment)
        return login_resp

    async def upload_invoice(
        self,
        request: EfrisInvoiceRequest,
        redis,
    ) -> EfrisInvoiceResponse:
        """Call T109 to upload an invoice/receipt to URA EFRIS."""
        # Ensure authenticated; taxpayer_id populated from cache or fresh login
        if not self.taxpayer_id:
            await self.login(redis)

        payload = _invoice_to_dict(request)
        body = await self._post("T109", data=payload)

        content = body.get("data", {}).get("content", {})
        basic_info = content.get("basicInformation", content)
        summary = content.get("summary", {})
        seller_details = content.get("sellerDetails", {})

        return EfrisInvoiceResponse(
            invoice_id=basic_info.get("invoiceId", ""),
            invoice_no=basic_info.get("invoiceNo", ""),
            antifake_code=basic_info.get("antifakeCode", ""),
            device_no=basic_info.get("deviceNo", ""),
            issued_date=basic_info.get("issuedDate", ""),
            operator=basic_info.get("operator", ""),
            currency=basic_info.get("currency", "UGX"),
            invoice_type=basic_info.get("invoiceType", ""),
            invoice_kind=basic_info.get("invoiceKind", ""),
            net_amount=summary.get("netAmount", ""),
            tax_amount=summary.get("taxAmount", ""),
            gross_amount=summary.get("grossAmount", ""),
            mode_code=summary.get("modeCode", ""),
            qr_code=summary.get("qrCode", ""),
            branch_name=seller_details.get("branchName", ""),
            branch_code=seller_details.get("branchCode", ""),
        )


def _invoice_to_dict(req: EfrisInvoiceRequest) -> dict:
    """Convert an EfrisInvoiceRequest to the URA API snake_case JSON dict."""
    return {
        "sellerDetails": {
            "tin": req.seller.tin,
            "legalName": req.seller.legal_name,
            "businessName": req.seller.business_name,
            "address": req.seller.address,
            "mobilePhone": req.seller.mobile_phone,
            "emailAddress": req.seller.email_address,
            "placeOfBusiness": req.seller.place_of_business,
            "referenceNo": req.seller.reference_no,
            "isCheckReferenceNo": req.seller.is_check_reference_no,
        },
        "basicInformation": {
            "deviceNo": req.device_no,
            "issuedDate": req.issued_date,
            "operator": req.operator,
            "currency": req.currency,
            "invoiceType": req.invoice_type,
            "invoiceKind": req.invoice_kind,
            "dataSource": req.data_source,
            "invoiceIndustryCode": req.invoice_industry_code,
        },
        "buyerDetails": {
            "buyerTin": req.buyer.buyer_tin,
            "buyerLegalName": req.buyer.buyer_legal_name,
            "buyerBusinessName": req.buyer.buyer_business_name,
            "buyerEmail": req.buyer.buyer_email,
            "buyerMobilePhone": req.buyer.buyer_mobile_phone,
            "buyerType": req.buyer.buyer_type,
        },
        "goodsDetails": [
            {
                "item": g.item,
                "itemCode": g.item_code,
                "qty": g.qty,
                "unitOfMeasure": g.unit_of_measure,
                "unitPrice": g.unit_price,
                "total": g.total,
                "taxRate": g.tax_rate,
                "tax": g.tax,
                "goodsCategoryId": g.goods_category_id,
                "vatApplicableFlag": g.vat_applicable_flag,
                "discountFlag": g.discount_flag,
                "deemedFlag": g.deemed_flag,
                "exciseFlag": g.excise_flag,
            }
            for g in req.goods_details
        ],
        "taxDetails": [
            {
                "taxCategoryCode": t.tax_category_code,
                "netAmount": t.net_amount,
                "taxRate": t.tax_rate,
                "taxAmount": t.tax_amount,
                "grossAmount": t.gross_amount,
                "taxRateName": t.tax_rate_name,
            }
            for t in req.tax_details
        ],
        "paymentWay": [
            {
                "paymentMode": p.payment_mode,
                "paymentAmount": p.payment_amount,
                "orderNumber": p.order_number,
            }
            for p in req.payment_ways
        ],
        "summary": {
            "netAmount": req.net_amount,
            "taxAmount": req.tax_amount,
            "grossAmount": req.gross_amount,
            "itemCount": req.item_count,
            "modeCode": req.mode_code,
            "remarks": req.remarks,
        },
    }


@asynccontextmanager
async def get_efris_client(
    org_id: uuid.UUID,
    db: AsyncSession,
) -> AsyncIterator[EfrisClient]:
    """Async context manager that yields an EfrisClient for the given org.

    Raises EfrisNotConfiguredError if no active config exists.
    Mirrors the get_geobox_client() pattern in integrations/geobox/client.py.
    """
    from app.core.encryption import decrypt
    from app.models.efris import OrganisationEfrisConfig

    config = await db.scalar(
        select(OrganisationEfrisConfig).where(
            OrganisationEfrisConfig.organisation_id == org_id
        )
    )

    if config is None or not config.is_active:
        raise EfrisNotConfiguredError(
            f"EFRIS is not configured or not active for organisation {org_id}. "
            "Enable it in Settings > EFRIS."
        )

    try:
        password = decrypt(config.password_encrypted) if config.password_encrypted else ""
    except Exception:
        raise EfrisNotConfiguredError(
            "EFRIS password could not be decrypted. "
            "Re-save the EFRIS configuration to fix this."
        )

    yield EfrisClient(
        org_id=org_id,
        environment=config.environment,
        api_url=config.api_url,
        tin=config.tin,
        device_no=config.device_no,
        username=config.username,
        password=password,
        taxpayer_id=config.taxpayer_id or "",
        qr_code_url=config.qr_code_url or "",
    )
