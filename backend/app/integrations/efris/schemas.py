"""
Pydantic schemas for URA EFRIS API request and response payloads.

References:
  T103 — Log In
  T109 — Invoice Upload (invoiceKind=2 for receipts)

The URA EFRIS protocol wraps all payloads in a globalInfo + data envelope.
For the mock server this envelope is sent as plain JSON.
For real UAT/prod the data.content field would be AES-encrypted.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ── Shared envelope ────────────────────────────────────────────────────────────

class GlobalInfo(BaseModel):
    app_id: str = "AP04"
    version: str = "1.1.20191201"
    data_exchange_id: str = "1"
    interface_code: str
    request_code: str = "TP"
    request_time: str          # "yyyy-MM-dd HH:mm:ss"
    response_code: str = "TA"
    user_name: str
    device_mac: str = "FFFFFFFFFFFF"
    device_no: str
    tin: str
    brn: str = ""
    taxpayer_id: str = ""      # populated after T103 login
    longitude: str = "32.5726"
    latitude: str = "0.3476"
    agent_type: str = "0"

    model_config = {"populate_by_name": True}


# ── T103 Login ─────────────────────────────────────────────────────────────────

class LoginResponse(BaseModel):
    """Taxpayer profile returned by T103 login."""
    id: str                    # store as taxpayer_id for future requests
    tin: str
    legal_name: str = ""
    business_name: str = ""
    taxpayer_type: str = ""
    contact_email: str = ""
    contact_mobile: str = ""

    # System configuration flags
    is_allow_issue_invoice: str = "1"
    web_service_url: str = ""
    qr_code_url: str = ""
    environment: str = "1"    # "0"=Production, "1"=Test

    model_config = {"populate_by_name": True}


# ── T109 Invoice Upload ────────────────────────────────────────────────────────

class EfrisGoodsItem(BaseModel):
    """One line item in an EFRIS invoice/receipt."""
    item: str                          # description of the goods/service
    item_code: str                     # registered goods code
    qty: float = 1.0
    unit_of_measure: str = "101"       # 101=months/periods; from T115 dictionary
    unit_price: float
    total: float                       # qty * unit_price (before tax)
    tax_rate: float = 0.0             # decimal: 0.18=18%, 0.0=exempt
    tax: float = 0.0                   # calculated tax amount
    goods_category_id: str = "2010101" # from T115/T123; residential rental
    vat_applicable_flag: str = "0"    # "1"=applicable, "0"=not applicable
    discount_flag: str = "2"          # "2"=no discount
    deemed_flag: str = "2"            # "2"=not deemed
    excise_flag: str = "2"            # "2"=no excise duty

    model_config = {"populate_by_name": True}


class EfrisTaxDetail(BaseModel):
    """Tax category breakdown for the invoice summary."""
    tax_category_code: str = "03"     # "01"=standard 18%, "02"=zero, "03"=exempt
    net_amount: float
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    gross_amount: float
    tax_rate_name: str = "Exempt"

    model_config = {"populate_by_name": True}


class EfrisPaymentWay(BaseModel):
    """Payment method breakdown for the invoice."""
    payment_mode: str                  # "102"=cash, "101"=bank/credit, "105"=mobile money
    payment_amount: float
    order_number: str = "a"

    model_config = {"populate_by_name": True}


class EfrisBuyerDetails(BaseModel):
    """Buyer (tenant) information for B2C receipts."""
    buyer_tin: str = ""
    buyer_legal_name: str = ""
    buyer_business_name: str = ""
    buyer_email: str = ""
    buyer_mobile_phone: str = ""
    buyer_type: str = "1"             # "0"=B2B, "1"=B2C, "2"=Foreigner, "3"=B2G
    buyer_citizenship: str = ""

    model_config = {"populate_by_name": True}


class EfrisSellerDetails(BaseModel):
    """Seller (org/landlord) details for the invoice."""
    tin: str
    legal_name: str
    business_name: str = ""
    address: str
    mobile_phone: str = ""
    email_address: str
    place_of_business: str = ""
    reference_no: str                  # unique per invoice; use payment UUID
    is_check_reference_no: str = "1"

    model_config = {"populate_by_name": True}


class EfrisInvoiceRequest(BaseModel):
    """Full T109 invoice upload request payload."""
    # Seller
    seller: EfrisSellerDetails

    # Basic info
    device_no: str
    issued_date: str                   # "yyyy-MM-dd HH:mm:ss"
    operator: str                      # name of staff/system issuing the receipt
    currency: str = "UGX"
    invoice_type: str = "1"           # "1"=Invoice
    invoice_kind: str = "2"           # "2"=Receipt
    data_source: str = "103"          # WebService API
    invoice_industry_code: str = "101" # "101"=General

    # Buyer
    buyer: EfrisBuyerDetails

    # Line items, tax breakdown, payment
    goods_details: list[EfrisGoodsItem]
    tax_details: list[EfrisTaxDetail]
    payment_ways: list[EfrisPaymentWay]

    # Summary
    net_amount: float
    tax_amount: float
    gross_amount: float
    item_count: int
    mode_code: str = "1"              # "1"=Online
    remarks: str = ""

    model_config = {"populate_by_name": True}


# ── T109 Response ──────────────────────────────────────────────────────────────

class EfrisInvoiceResponse(BaseModel):
    """URA response from T109 invoice upload."""
    invoice_id: str = ""
    invoice_no: str = ""               # Fiscal Document Number (FDN)
    antifake_code: str = ""
    device_no: str = ""
    issued_date: str = ""
    operator: str = ""
    currency: str = "UGX"
    invoice_type: str = ""
    invoice_kind: str = ""
    # Summary echo
    net_amount: str = ""
    tax_amount: str = ""
    gross_amount: str = ""
    item_count: int = 0
    mode_code: str = ""
    qr_code: str = ""
    # Seller echo
    branch_name: str = ""
    branch_code: str = ""

    model_config = {"populate_by_name": True}


# ── URA envelope return state ──────────────────────────────────────────────────

class ReturnStateInfo(BaseModel):
    return_code: str = ""
    return_message: str = ""

    model_config = {"populate_by_name": True}

    @property
    def is_success(self) -> bool:
        return self.return_code == "00"


# ── URA payment mode mapping ───────────────────────────────────────────────────

PAYMENT_MODE_MAP: dict[str, str] = {
    "cash": "102",
    "bank_transfer": "101",
    "mobile_money_mtn": "105",
    "mobile_money_airtel": "105",
    "other": "102",
    "cheque": "101",
}
