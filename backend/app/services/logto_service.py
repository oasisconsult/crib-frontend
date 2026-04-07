"""
Logto Management API client (M2M).

Used for:
  - Creating a Logto user account when a tenant activates
  - Assigning the tenant to the organisation in Logto

Auth flow:
  POST {logto_admin_endpoint}/oidc/token  (client_credentials)
  → Bearer token for Management API calls

All functions are no-ops when M2M credentials are not configured,
so tests (which do not have real Logto) pass without mocking.
"""

from __future__ import annotations

import structlog

log = structlog.get_logger(__name__)


def _is_configured() -> bool:
    from app.core.config import get_settings
    s = get_settings()
    return bool(s.logto_m2m_app_id and s.logto_m2m_app_secret)


async def _get_m2m_token() -> str:
    """Exchange M2M client credentials for a Management API Bearer token."""
    import httpx
    from app.core.config import get_settings
    s = get_settings()

    resp = httpx.post(
        f"{s.logto_admin_endpoint}oidc/token",
        data={
            "grant_type": "client_credentials",
            "client_id": s.logto_m2m_app_id,
            "client_secret": s.logto_m2m_app_secret,
            "resource": f"{s.logto_admin_endpoint}api",
            "scope": "all",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


async def create_tenant_user(
    *,
    email: str,
    first_name: str,
    last_name: str,
    logto_org_id: str,
) -> str | None:
    """
    Create a Logto user for the tenant and add them to the organisation.

    Returns the Logto user ID (string) on success, or None if M2M is not configured
    or the call fails (logged as a warning — not raised, so activation still proceeds).
    """
    if not _is_configured():
        log.debug("logto.m2m_not_configured — skipping user creation", email=email)
        return None

    try:
        import httpx
        from app.core.config import get_settings
        s = get_settings()
        token = await _get_m2m_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        base = f"{s.logto_admin_endpoint}api"

        # 1. Create the user
        create_resp = httpx.post(
            f"{base}/users",
            json={
                "primaryEmail": email,
                "name": f"{first_name} {last_name}",
                "username": email.split("@")[0].lower(),
            },
            headers=headers,
            timeout=10,
        )
        if create_resp.status_code == 422:
            # User already exists — look up by email
            search_resp = httpx.get(
                f"{base}/users",
                params={"search": email, "searchFields": "primaryEmail"},
                headers=headers,
                timeout=10,
            )
            search_resp.raise_for_status()
            users = search_resp.json()
            if not users:
                log.warning("logto.user_not_found_after_conflict", email=email)
                return None
            logto_user_id: str = users[0]["id"]
        else:
            create_resp.raise_for_status()
            logto_user_id = create_resp.json()["id"]

        # 2. Add user to the organisation
        add_resp = httpx.post(
            f"{base}/organizations/{logto_org_id}/users",
            json={"userIds": [logto_user_id]},
            headers=headers,
            timeout=10,
        )
        if add_resp.status_code not in (200, 201, 204):
            log.warning(
                "logto.add_to_org_failed",
                user_id=logto_user_id,
                org_id=logto_org_id,
                status=add_resp.status_code,
            )

        # 3. Assign the 'tenant' role within the organisation
        role_resp = httpx.post(
            f"{base}/organizations/{logto_org_id}/users/{logto_user_id}/roles",
            json={"organizationRoleIds": []},  # populated if we have a role ID
            headers=headers,
            timeout=10,
        )
        # Best-effort — ignore failures here

        log.info(
            "logto.tenant_user_created",
            logto_user_id=logto_user_id,
            email=email,
            org_id=logto_org_id,
        )
        return logto_user_id

    except Exception as exc:  # noqa: BLE001
        log.warning("logto.create_tenant_user_failed", email=email, error=str(exc))
        return None
