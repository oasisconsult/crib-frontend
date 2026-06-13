"""
Mock URA EFRIS API server for local development and testing.

Implements the T103 (Login) and T109 (Invoice Upload) endpoints
using the same JSON envelope the real URA API uses — but without encryption.

Run with:
    uvicorn mock_efris.main:app --host 0.0.0.0 --port 8099
"""

from __future__ import annotations

import random
import string
from datetime import date, datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="Mock URA EFRIS Server", version="1.0.0")


def _ok(content: dict, interface_code: str = "") -> dict:
    return {
        "data": {"content": content},
        "globalInfo": {"interfaceCode": interface_code},
        "returnStateInfo": {"returnCode": "00", "returnMessage": "SUCCESS"},
    }


def _err(code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "data": {"content": {}},
            "globalInfo": {},
            "returnStateInfo": {"returnCode": code, "returnMessage": message},
        },
    )


def _random_id(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


@app.post("/")
async def handle_all(request: Request) -> dict:
    """Single endpoint — URA EFRIS routes all calls to the same base URL,
    discriminated by globalInfo.interfaceCode."""
    body = await request.json()
    interface_code = body.get("globalInfo", {}).get("interfaceCode", "")

    if interface_code == "T101":
        return _handle_server_time()
    elif interface_code == "T103":
        return _handle_login(body)
    elif interface_code == "T109":
        return _handle_invoice_upload(body)
    else:
        return _err("99", f"Unknown interface code: {interface_code}")


def _handle_server_time() -> dict:
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S")
    return _ok({"currentTime": now}, "T101")


def _handle_login(body: dict) -> dict:
    global_info = body.get("globalInfo", {})
    tin = global_info.get("tin", "0000000000")
    username = global_info.get("userName", "mock_user")

    taxpayer_id = f"MOCK-{_random_id(6)}"

    return _ok({
        "taxpayerInfo": {
            "id": taxpayer_id,
            "tin": tin,
            "legalName": f"Mock Organisation [{username}]",
            "businessName": f"Mock Org [{username}]",
            "taxpayerType": "202",
            "contactEmail": "mock@efris.test",
            "contactMobile": "+256700000000",
            "placeOfBusiness": "Kampala, Uganda",
            "webServiceURL": "",
            "qrCodeURL": "https://efris.ura.go.ug/qr/",
            "environment": "1",
            "isAllowIssueInvoice": "1",
            "isAllowBackDate": "0",
            "maxGrossAmount": 0,
            "dictionaryVersion": 1,
        },
        "systemSetting": {
            "goodsStockLimit": "102",
            "isAllowBackDate": "0",
            "isAllowIssueInvoice": "1",
        },
    }, "T103")


def _handle_invoice_upload(body: dict) -> dict:
    content = body.get("data", {}).get("content", {})
    basic_info = content.get("basicInformation", {})
    summary = content.get("summary", {})
    seller = content.get("sellerDetails", {})

    # Validate required fields
    if not seller.get("tin"):
        return _err("1100", "Seller TIN is required")
    if not basic_info.get("deviceNo"):
        return _err("1200", "Device number is required")

    # Generate a fiscal document number
    today = date.today().strftime("%Y%m%d")
    seq = random.randint(10000, 99999)
    fdn = f"FD-{today}-{seq}"
    invoice_id = f"INV-{_random_id(10)}"
    antifake_code = f"AFC-{_random_id(16)}"
    issued_at = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S")

    # Generate a mock QR code data string
    qr_code = (
        f"020000004{_random_id(4)}9C32200015{_random_id(10)}00016E3600000037DCD"
        f"{_random_id(20)}"
    )

    gross = summary.get("grossAmount", 0)
    net = summary.get("netAmount", gross)
    tax = summary.get("taxAmount", 0)

    return _ok({
        "basicInformation": {
            "invoiceId": invoice_id,
            "invoiceNo": fdn,
            "antifakeCode": antifake_code,
            "deviceNo": basic_info.get("deviceNo", ""),
            "issuedDate": issued_at,
            "operator": basic_info.get("operator", "System"),
            "currency": basic_info.get("currency", "UGX"),
            "invoiceType": basic_info.get("invoiceType", "1"),
            "invoiceKind": basic_info.get("invoiceKind", "2"),
            "dataSource": "103",
        },
        "summary": {
            "netAmount": str(net),
            "taxAmount": str(tax),
            "grossAmount": str(gross),
            "itemCount": summary.get("itemCount", 1),
            "modeCode": "1",
            "qrCode": qr_code,
        },
        "sellerDetails": {
            "branchName": "Head Office",
            "branchCode": "01",
        },
    }, "T109")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "server": "mock-efris"}
