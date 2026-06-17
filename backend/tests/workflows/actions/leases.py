"""
Lease, tenant, payment, and statement actions for sprint workflow tests.
"""
from __future__ import annotations

import datetime

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("create_tenant")
async def create_tenant(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a tenant and auto-submit their onboarding so the tenant is in
    ``submitted`` state (ready to be approved).

    Input keys
    ----------
    firstName, lastName, email  : required
    phone, nationalId, notes    : optional
    """
    first = input.get("firstName", "Test")
    last = input.get("lastName", "Tenant")
    email = input.get("email", "tenant@workflow.example.com")

    payload = {
        "firstName": first,
        "lastName": last,
        "email": email,
        "phone": input.get("phone", "+256700000001"),
        "nationalId": input.get("nationalId"),
        "notes": input.get("notes"),
        "tags": input.get("tags", []),
    }
    resp = await client.post("/api/v1/tenants", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_tenant failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_tenant"),
            action="create_tenant",
        )
    tenant = resp.json()
    tenant_id = tenant["id"]

    # Direct creation leaves the tenant in 'invited' state with no token.
    # Resend-invite creates a fresh token so we can submit onboarding.
    # Direct creation leaves the tenant in 'invited' state with no token.
    # Full onboarding flow: resend-invite → GET (starts) → POST submit (submits).
    invite_resp = await client.post(f"/api/v1/tenants/{tenant_id}/resend-invite")
    if invite_resp.status_code in (200, 201):
        token = invite_resp.json().get("token")
        if token:
            # GET transitions invited → started
            await client._client.get(f"/api/v1/tenants/onboarding/{token}")
            onboarding_payload = {
                "firstName": first,
                "lastName": last,
                "email": email,
                "phone": input.get("phone", "+256700000001"),
                "gdprConsent": True,
            }
            # POST submit transitions started → submitted (public endpoint)
            sub_resp = await client._client.post(
                f"/api/v1/tenants/onboarding/{token}/submit",
                json=onboarding_payload,
            )
            if sub_resp.status_code in (200, 201):
                tenant = sub_resp.json()

    return tenant


@registry.register("approve_tenant")
async def approve_tenant(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Approve a tenant via ``PATCH /api/v1/tenants/{tenantId}/approve``.
    Tenants must be approved before a lease can be created.

    Input keys
    ----------
    tenantId : required
    """
    tenant_id = input["tenantId"]
    resp = await client.patch(f"/api/v1/tenants/{tenant_id}/approve", json={})
    if resp.status_code not in (200, 201):
        raise StepError(
            f"approve_tenant failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "approve_tenant"),
            action="approve_tenant",
        )
    return resp.json()


@registry.register("create_lease")
async def create_lease(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a draft lease via ``POST /api/v1/leases``.

    Input keys
    ----------
    unitId, tenantId  : required
    startDate         : ISO date string (default: today)
    monthlyRent       : default 500000
    currency          : default UGX
    """
    today = datetime.date.today().isoformat()
    payload = {
        "unitId": input["unitId"],
        "tenantId": input["tenantId"],
        "startDate": input.get("startDate", today),
        "endDate": input.get("endDate"),
        "monthlyRent": input.get("monthlyRent", 500_000),
        "currency": input.get("currency", "UGX"),
        "depositAmount": input.get("depositAmount"),
        "depositPaid": input.get("depositPaid", False),
        "notes": input.get("notes"),
    }
    resp = await client.post("/api/v1/leases", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_lease failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_lease"),
            action="create_lease",
        )
    return resp.json()


@registry.register("activate_lease")
async def activate_lease(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Activate a draft lease via ``PATCH /api/v1/leases/{leaseId}/activate``.

    Input keys
    ----------
    leaseId : required
    """
    lease_id = input["leaseId"]
    resp = await client.patch(f"/api/v1/leases/{lease_id}/activate", json={})
    if resp.status_code not in (200, 201):
        raise StepError(
            f"activate_lease failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "activate_lease"),
            action="activate_lease",
        )
    return resp.json()


@registry.register("generate_rent_schedules")
async def generate_rent_schedules(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Generate rent schedules via ``POST /api/v1/leases/{leaseId}/schedules/generate``.
    Returns 204 No Content; action returns a status dict.

    Input keys
    ----------
    leaseId : required
    """
    lease_id = input["leaseId"]
    resp = await client.post(f"/api/v1/leases/{lease_id}/schedules/generate", json={})
    if resp.status_code not in (200, 204):
        raise StepError(
            f"generate_rent_schedules failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "generate_rent_schedules"),
            action="generate_rent_schedules",
        )
    return {"statusCode": resp.status_code, "generated": True}


@registry.register("list_schedules")
async def list_schedules(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List rent schedules via ``GET /api/v1/leases/{leaseId}/schedules``.

    Input keys
    ----------
    leaseId : required
    """
    lease_id = input["leaseId"]
    resp = await client.get(f"/api/v1/leases/{lease_id}/schedules")
    if resp.status_code != 200:
        raise StepError(
            f"list_schedules failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_schedules"),
            action="list_schedules",
        )
    return resp.json()


@registry.register("record_manual_payment")
async def record_manual_payment(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Record a manual payment via ``POST /api/v1/leases/{leaseId}/payments/record``.

    Input keys
    ----------
    leaseId  : required
    amount   : default 500000
    currency : default UGX
    category : default rent
    method   : default cash
    """
    lease_id = input["leaseId"]
    payload = {
        "amount": input.get("amount", 500_000),
        "currency": input.get("currency", "UGX"),
        "category": input.get("category", "rent"),
        "method": input.get("method", "cash"),
        "reference": input.get("reference"),
        "notes": input.get("notes"),
    }
    resp = await client.post(
        f"/api/v1/leases/{lease_id}/payments/record", json=payload
    )
    if resp.status_code not in (200, 201):
        raise StepError(
            f"record_manual_payment failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "record_manual_payment"),
            action="record_manual_payment",
        )
    return resp.json()


@registry.register("get_statement_pdf")
async def get_statement_pdf(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Download statement PDF via ``GET /api/v1/leases/{leaseId}/statement/pdf``.
    Returns status, content-type, and byte size — not the raw bytes.

    Input keys
    ----------
    leaseId : required
    month   : optional YYYY-MM filter
    """
    lease_id = input["leaseId"]
    params = {}
    if "month" in input:
        params["month"] = input["month"]

    resp = await client.get(f"/api/v1/leases/{lease_id}/statement/pdf", params=params)
    content_type = resp.headers.get("content-type", "")
    return {
        "statusCode": resp.status_code,
        "contentType": content_type,
        "size": len(resp.content),
    }


@registry.register("get_statement_csv")
async def get_statement_csv(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Download statement CSV via ``GET /api/v1/leases/{leaseId}/statement``.

    Input keys
    ----------
    leaseId : required
    """
    lease_id = input["leaseId"]
    resp = await client.get(f"/api/v1/leases/{lease_id}/statement")
    content_type = resp.headers.get("content-type", "")
    return {
        "statusCode": resp.status_code,
        "contentType": content_type,
        "size": len(resp.content),
    }
