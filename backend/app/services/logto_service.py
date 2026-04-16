"""
Logto Management API client (M2M).

Used for:
  - Creating a Logto user account when a tenant activates
  - Assigning the tenant to the organisation in Logto
  - Sending a welcome email with a temporary password so the tenant can log in
  - Resending login credentials from the admin UI

Auth flow:
  POST {logto_admin_endpoint}/oidc/token  (client_credentials)
  → Bearer token for Management API calls

All functions are no-ops when M2M credentials are not configured,
so tests (which do not have real Logto) pass without mocking.
"""

from __future__ import annotations

import secrets
import string

import httpx
import structlog

log = structlog.get_logger(__name__)


# ── Config helpers ─────────────────────────────────────────────────────────────

def _is_configured() -> bool:
    from app.core.config import get_settings
    s = get_settings()
    return bool(s.logto_m2m_app_id and s.logto_m2m_app_secret)


def _generate_temp_password() -> str:
    """Generate a 16-character random password that satisfies most policies."""
    alphabet = string.ascii_letters + string.digits + "!@#$"
    # Ensure at least one of each required character class
    pwd = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$"),
    ]
    pwd += [secrets.choice(alphabet) for _ in range(12)]
    secrets.SystemRandom().shuffle(pwd)
    return "".join(pwd)


# ── M2M token ──────────────────────────────────────────────────────────────────

async def _get_m2m_token() -> str:
    """Exchange M2M client credentials for a Management API Bearer token."""
    from app.core.config import get_settings
    s = get_settings()

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            # OIDC token endpoint is on port 3001 (logto_endpoint), NOT port 3002 (admin console).
            # Resource is the Management API identifier, which lives at logto_admin_endpoint/api.
            f"{s.logto_endpoint}oidc/token",
            data={
                "grant_type": "client_credentials",
                "client_id": s.logto_m2m_app_id,
                "client_secret": s.logto_m2m_app_secret,
                "resource": f"{s.logto_admin_endpoint}api",
                "scope": "all",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


# ── Organisation role lookup ───────────────────────────────────────────────────

async def _get_tenant_org_role_id(
    logto_org_id: str,
    *,
    base: str,
    headers: dict,
) -> str | None:
    """
    Return the ID of the organisation role whose name matches
    settings.logto_tenant_org_role_name (default: "tenant").

    Returns None if the role is not found (role assignment will be skipped).
    """
    from app.core.config import get_settings
    role_name = get_settings().logto_tenant_org_role_name

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{base}/organizations/{logto_org_id}/roles",
            headers=headers,
        )
        if resp.status_code != 200:
            log.warning(
                "logto.org_roles_fetch_failed",
                org_id=logto_org_id,
                status=resp.status_code,
            )
            return None

        for role in resp.json():
            if role.get("name", "").lower() == role_name.lower():
                return role["id"]

    log.warning(
        "logto.tenant_role_not_found",
        org_id=logto_org_id,
        expected_role=role_name,
    )
    return None


# ── Welcome email ──────────────────────────────────────────────────────────────

async def _send_welcome_email(
    *,
    email: str,
    first_name: str,
    temp_password: str,
    portal_url: str,
) -> None:
    """Send the tenant a welcome email with their temporary password."""
    from app.integrations.notifications.email import get_email_provider

    subject = "Welcome to Crib — your tenant portal is ready"
    body = (
        f"Hi {first_name},\n\n"
        "Your account has been created. You can now sign in to the tenant portal "
        "to view your lease, make payments, and manage your tenancy.\n\n"
        f"Portal:    {portal_url}/portal\n"
        f"Email:     {email}\n"
        f"Password:  {temp_password}\n\n"
        "Please change your password after your first sign-in.\n\n"
        "— The Crib Team"
    )

    provider = get_email_provider()
    result = await provider.send(
        recipient_name=first_name,
        recipient_email=email,
        recipient_phone=None,
        subject=subject,
        body=body,
    )
    if result.success:
        log.info("logto.welcome_email_sent", email=email)
    else:
        log.warning("logto.welcome_email_failed", email=email, reason=result.failure_reason)


# ── Core: create tenant user ───────────────────────────────────────────────────

async def create_tenant_user(
    *,
    email: str,
    first_name: str,
    last_name: str,
    logto_org_id: str,
) -> str | None:
    """
    Create a Logto user for the tenant, add them to the organisation,
    assign the 'tenant' org role, set a temporary password, and send a
    welcome email.

    Returns the Logto user ID (string) on success, or None if M2M is not
    configured or the call fails (logged as a warning — not raised, so
    activation still proceeds).
    """
    if not _is_configured():
        log.debug("logto.m2m_not_configured — skipping user creation", email=email)
        return None

    try:
        from app.core.config import get_settings
        s = get_settings()
        token = await _get_m2m_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        base = str(s.logto_management_api_base)

        async with httpx.AsyncClient(timeout=10) as client:
            # 1. Create (or look up) the user ──────────────────────────────────
            create_resp = await client.post(
                f"{base}/users",
                json={
                    "primaryEmail": email,
                    "name": f"{first_name} {last_name}",
                    "username": email.split("@")[0].lower(),
                },
                headers=headers,
            )

            if create_resp.status_code == 422:
                # Conflict — user already exists; find them by email
                search_resp = await client.get(
                    f"{base}/users",
                    params={"search": email, "searchFields": "primaryEmail"},
                    headers=headers,
                )
                search_resp.raise_for_status()
                users = search_resp.json()
                if not users:
                    log.warning("logto.user_not_found_after_conflict", email=email)
                    return None
                logto_user_id: str = users[0]["id"]
                temp_password: str | None = None  # don't overwrite existing password
            else:
                create_resp.raise_for_status()
                logto_user_id = create_resp.json()["id"]
                # New user — set a temporary password
                temp_password = _generate_temp_password()
                patch_resp = await client.patch(
                    f"{base}/users/{logto_user_id}",
                    json={"password": temp_password},
                    headers=headers,
                )
                if patch_resp.status_code not in (200, 201, 204):
                    log.warning(
                        "logto.set_password_failed",
                        user_id=logto_user_id,
                        status=patch_resp.status_code,
                    )
                    temp_password = None

            # 2. Add user to the organisation ──────────────────────────────────
            add_resp = await client.post(
                f"{base}/organizations/{logto_org_id}/users",
                json={"userIds": [logto_user_id]},
                headers=headers,
            )
            if add_resp.status_code not in (200, 201, 204):
                log.warning(
                    "logto.add_to_org_failed",
                    user_id=logto_user_id,
                    org_id=logto_org_id,
                    status=add_resp.status_code,
                )

            # 3. Assign the org-level 'tenant' role ────────────────────────────
            role_id = await _get_tenant_org_role_id(
                logto_org_id, base=base, headers=headers
            )
            if role_id:
                role_resp = await client.post(
                    f"{base}/organizations/{logto_org_id}/users/{logto_user_id}/roles",
                    json={"organizationRoleIds": [role_id]},
                    headers=headers,
                )
                if role_resp.status_code not in (200, 201, 204):
                    log.warning(
                        "logto.assign_role_failed",
                        user_id=logto_user_id,
                        role_id=role_id,
                        status=role_resp.status_code,
                    )

        log.info(
            "logto.tenant_user_created",
            logto_user_id=logto_user_id,
            email=email,
            org_id=logto_org_id,
        )

        # 4. Send welcome email ─────────────────────────────────────────────────
        if temp_password:
            await _send_welcome_email(
                email=email,
                first_name=first_name,
                temp_password=temp_password,
                portal_url=s.frontend_url,
            )

        return logto_user_id

    except Exception as exc:  # noqa: BLE001
        log.warning("logto.create_tenant_user_failed", email=email, error=str(exc))
        return None


# ── Resend login credentials ───────────────────────────────────────────────────

async def resend_login_credentials(
    *,
    logto_user_id: str,
    email: str,
    first_name: str,
) -> bool:
    """
    Generate a new temporary password for an existing Logto user and re-send
    the welcome email.  Called from the admin UI "Resend login credentials" action.

    Returns True on success, False if M2M is not configured or the call fails.
    """
    if not _is_configured():
        log.debug("logto.m2m_not_configured — skipping resend", email=email)
        return False

    try:
        from app.core.config import get_settings
        s = get_settings()
        token = await _get_m2m_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        base = str(s.logto_management_api_base)

        temp_password = _generate_temp_password()

        async with httpx.AsyncClient(timeout=10) as client:
            patch_resp = await client.patch(
                f"{base}/users/{logto_user_id}",
                json={"password": temp_password},
                headers=headers,
            )
            if patch_resp.status_code not in (200, 201, 204):
                log.warning(
                    "logto.resend_set_password_failed",
                    user_id=logto_user_id,
                    status=patch_resp.status_code,
                )
                return False

        await _send_welcome_email(
            email=email,
            first_name=first_name,
            temp_password=temp_password,
            portal_url=s.frontend_url,
        )
        log.info("logto.credentials_resent", logto_user_id=logto_user_id, email=email)
        return True

    except Exception as exc:  # noqa: BLE001
        log.warning("logto.resend_credentials_failed", email=email, error=str(exc))
        return False
