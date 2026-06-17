"""
Utility billing workflow actions — record readings, bill, and list.
"""
from __future__ import annotations

import datetime

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("record_utility")
async def record_utility(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Record a utility reading via ``POST /api/v1/leases/{leaseId}/utilities``.

    Input keys
    ----------
    leaseId       : required
    utilityType   : water|electricity|internet|garbage|other (default water)
    billingType   : metered|fixed (default fixed)
    readingDate   : ISO date string (default: today)
    readingValue  : required for metered
    previousValue : required for metered (default 0)
    unitPrice     : required for metered
    amount        : required for fixed
    autoBill      : default False (so we can test the /bill endpoint separately)
    """
    lease_id = input["leaseId"]
    today = datetime.date.today().isoformat()
    billing_type = input.get("billingType", "fixed")

    payload: dict = {
        "utilityType": input.get("utilityType", "water"),
        "billingType": billing_type,
        "readingDate": input.get("readingDate", today),
        "currency": input.get("currency", "UGX"),
        "notes": input.get("notes"),
        "autoBill": input.get("autoBill", False),
    }

    if billing_type == "metered":
        payload["readingValue"] = input["readingValue"]
        payload["previousValue"] = input.get("previousValue", 0)
        payload["unitPrice"] = input["unitPrice"]
    else:
        payload["amount"] = input["amount"]

    resp = await client.post(f"/api/v1/leases/{lease_id}/utilities", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"record_utility failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "record_utility"),
            action="record_utility",
        )
    return resp.json()


@registry.register("bill_utility")
async def bill_utility(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Convert an unbilled utility reading to a payment via
    ``POST /api/v1/leases/{leaseId}/utilities/{readingId}/bill``.

    Input keys
    ----------
    leaseId   : required
    readingId : required
    """
    lease_id = input["leaseId"]
    reading_id = input["readingId"]
    resp = await client.post(
        f"/api/v1/leases/{lease_id}/utilities/{reading_id}/bill", json={}
    )
    if resp.status_code not in (200, 201):
        raise StepError(
            f"bill_utility failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "bill_utility"),
            action="bill_utility",
        )
    return resp.json()


@registry.register("list_utilities")
async def list_utilities(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List utility readings via ``GET /api/v1/leases/{leaseId}/utilities``.

    Returns the paginated response including ``data`` list.
    """
    lease_id = input["leaseId"]
    params = {"page": input.get("page", 1), "pageSize": input.get("pageSize", 20)}
    resp = await client.get(f"/api/v1/leases/{lease_id}/utilities", params=params)
    if resp.status_code != 200:
        raise StepError(
            f"list_utilities failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_utilities"),
            action="list_utilities",
        )
    return resp.json()
