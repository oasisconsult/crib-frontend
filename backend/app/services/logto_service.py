"""
Logto Management API client (M2M).

Used for:
  - Creating a Logto user account when a tenant activates
  - Assigning the tenant to the organisation in Logto
  - Sending a welcome email with a temporary password so the tenant can log in
  - Resending login credentials from the admin UI

Auth flow:
  POST {logto_admin_api_endpoint}/oidc/token  (client_credentials)
  → Bearer token for Management API calls

All functions are no-ops when M2M credentials are not configured,
so tests (which do not have real Logto) pass without mocking.
"""

from __future__ import annotations

import resource
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
    # s = get_settings()
    # url = f"{s.logto_endpoint}oidc/token"

    # async with httpx.AsyncClient(timeout=10) as client:
    #     resp = await client.post(
    #         url,
    #         # OIDC token endpoint is on port 3001 (logto_endpoint), NOT port 3002 (admin console).
    #         # Resource is the Management API identifier, which lives at logto_admin_api_endpoint/api.
    #         data={
    #             "grant_type": "client_credentials",
    #             "client_id": s.logto_m2m_app_id,
    #             "client_secret": s.logto_m2m_app_secret,
    #             "resource": f"{s.logto_admin_api_endpoint}api",
    #             "scope": "all",
    #         },
    #     )
    #     log.debug("logto.m2m_token_response", status=resp.status_code, response=resp.text)
    #     log.info("logto.m2m_token_obtained", status=resp.status_code)
    #     log.info("logto_admin_api_endpoint", status=resp.status_code, response=resp.text)
    #     log.info("logto.m2m_final_url", url=str(resp.request.url))
    #     log.debug("logto.m2m_token_response", status=resp.status_code, response=resp.text)
    #     resp.raise_for_status()
    #     return resp.json()["access_token"]
    
    s = get_settings()

    # base_url = str(s.logto_endpoint)
    base_url = f"http://logto:3001"
    # resource = str(s.logto_admin_api_resource)
    resource = f"https://default.logto.app/api"  # Match configured API identifier

    url = f"{base_url.rstrip('/')}/oidc/token"

    log.info("logto.m2m_request", url=url, resource=resource)

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            url,
            auth=(s.logto_m2m_app_id, s.logto_m2m_app_secret),
            data={
                "grant_type": "client_credentials",
                "resource": resource,
                "scope": "all",
            },
        )

    log.info("logto.m2m_response", status=resp.status_code)
    log.debug("logto.m2m_final_url", url=str(resp.request.url))
    log.debug("logto.m2m_response_body", body=resp.text)

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

    Flow:
      1. Search for existing user by email (find and link if exists)
      2. If not found, create new user with temporary password
      3. Add user to organisation
      4. Assign 'tenant' org role immediately
      5. Send welcome email with credentials

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
        base = f"http://logto:3001/api"
        temp_password: str | None = None
        is_new_user = False

        async with httpx.AsyncClient(timeout=10) as client:
            # ─ Step 1: Create the user, or resolve conflict if they already exist ──
            create_resp = await client.post(
                f"{base}/users",
                json={
                    "primaryEmail": email,
                    "name": f"{first_name} {last_name}",
                    "username": email.split("@")[0].lower(),
                    "password": _generate_temp_password(),  # Set password during creation
                },
                headers=headers,
            )

            if create_resp.status_code == 422:
                # Conflict: the user already exists in Logto.
                search_resp = await client.get(
                    f"{base}/users",
                    params={"search": email},
                    headers=headers,
                )
                search_resp.raise_for_status()
                existing_users = search_resp.json()

                if not existing_users:
                    log.warning("logto.user_not_found_after_conflict", email=email)
                    return None

                logto_user_id = existing_users[0]["id"]
                log.info(
                    "logto.user_found_existing",
                    email=email,
                    logto_user_id=logto_user_id,
                )
                temp_password = None  # Don't set password for existing users
            else:
                create_resp.raise_for_status()
                logto_user_id = create_resp.json()["id"]
                log.info("logto.user_created_new", email=email, logto_user_id=logto_user_id)
                is_new_user = True
                temp_password = _generate_temp_password()  # Password was set during creation

                log.info("logto.password_set_during_creation", user_id=logto_user_id)

            # ─ Step 3: Add user to organisation ──────────────────────────────
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
                    response_body=add_resp.text,
                )

            # ─ Step 4: Assign 'tenant' org role immediately ───────────────────
            await _assign_tenant_role(
                client, base, logto_org_id, logto_user_id, headers
            )

        log.info(
            "logto.tenant_user_provisioned",
            logto_user_id=logto_user_id,
            email=email,
            org_id=logto_org_id,
            is_new_user=is_new_user,
        )

        # ─ Step 5: Send welcome email (only for new users with password) ─────
        if is_new_user and temp_password:
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


async def _set_user_password(
    client: httpx.AsyncClient,
    base: str,
    user_id: str,
    password: str,
    headers: dict,
) -> bool:
    """
    DEPRECATED: Password is now set during user creation.
    This function is kept for backward compatibility but no longer used.
    """
    log.warning("logto.set_user_password_deprecated", user_id=user_id)
    return True


async def _assign_tenant_role(
    client: httpx.AsyncClient,
    base: str,
    org_id: str,
    user_id: str,
    headers: dict,
) -> bool:
    """
    Assign the 'tenant' org role to a user immediately after creation.
    Creates the role if it doesn't exist.
    Returns True if successful, False otherwise (but doesn't block provisioning).
    """
    try:
        log.info("logto.assign_role_start", org_id=org_id, user_id=user_id)
        
        # Fetch org roles
        roles_resp = await client.get(
            f"{base}/organizations/{org_id}/roles",
            headers=headers,
        )
        
        log.info("logto.get_org_roles_response", 
                org_id=org_id, 
                status=roles_resp.status_code,
                response_body=roles_resp.text[:500])  # Truncate for logging
        
        if roles_resp.status_code == 404:
            # Organization roles not found - try to create the tenant role
            log.info("logto.org_roles_not_found_creating_tenant_role", org_id=org_id)
            create_role_resp = await client.post(
                f"{base}/organizations/{org_id}/roles",
                json={
                    "name": "tenant",
                    "description": "Tenant role for property tenants"
                },
                headers=headers,
            )
            
            log.info("logto.create_role_response",
                    org_id=org_id,
                    status=create_role_resp.status_code,
                    response_body=create_role_resp.text[:500])
            
            if create_role_resp.status_code not in (200, 201, 204):
                log.warning(
                    "logto.create_tenant_role_failed",
                    org_id=org_id,
                    status=create_role_resp.status_code,
                    response_body=create_role_resp.text,
                )
                return False
            
            role_id = create_role_resp.json()["id"]
            log.info("logto.tenant_role_created", org_id=org_id, role_id=role_id)
            
        elif roles_resp.status_code not in (200, 201, 204):
            log.warning(
                "logto.get_org_roles_failed",
                org_id=org_id,
                status=roles_resp.status_code,
                response_body=roles_resp.text,
            )
            return False
        else:
            roles = roles_resp.json()
            log.info("logto.found_org_roles", org_id=org_id, role_count=len(roles))

            # Find "tenant" role (case-insensitive)
            tenant_role = next(
                (r for r in roles if r.get("name", "").lower() == "tenant"),
                None,
            )

            if not tenant_role:
                # Tenant role doesn't exist - create it
                log.info("logto.tenant_role_not_found_creating", org_id=org_id)
                create_role_resp = await client.post(
                    f"{base}/organizations/{org_id}/roles",
                    json={
                        "name": "tenant",
                        "description": "Tenant role for property tenants"
                    },
                    headers=headers,
                )
                
                log.info("logto.create_role_response_existing_org",
                        org_id=org_id,
                        status=create_role_resp.status_code,
                        response_body=create_role_resp.text[:500])
                
                if create_role_resp.status_code not in (200, 201, 204):
                    log.warning(
                        "logto.create_tenant_role_failed",
                        org_id=org_id,
                        status=create_role_resp.status_code,
                        response_body=create_role_resp.text,
                    )
                    return False
                
                role_id = create_role_resp.json()["id"]
                log.info("logto.tenant_role_created", org_id=org_id, role_id=role_id)
            else:
                role_id = tenant_role["id"]
                log.info("logto.tenant_role_found", org_id=org_id, role_id=role_id)

        # Assign role to user
        log.info("logto.assigning_role_to_user", 
                org_id=org_id, 
                user_id=user_id, 
                role_id=role_id)
        
        assign_resp = await client.post(
            f"{base}/organizations/{org_id}/users/{user_id}/roles",
            json={"organizationRoleIds": [role_id]},
            headers=headers,
        )

        log.info("logto.assign_role_response",
                org_id=org_id,
                user_id=user_id,
                role_id=role_id,
                status=assign_resp.status_code,
                response_body=assign_resp.text[:500])

        if assign_resp.status_code in (200, 201, 204):
            log.info(
                "logto.tenant_role_assigned",
                user_id=user_id,
                org_id=org_id,
                role_id=role_id,
            )
            return True

        log.warning(
            "logto.assign_role_failed",
            user_id=user_id,
            org_id=org_id,
            role_id=role_id,
            status=assign_resp.status_code,
            response_body=assign_resp.text,
        )
        return False

    except Exception as exc:  # noqa: BLE001
        log.warning(
            "logto.assign_role_exception",
            org_id=org_id,
            user_id=user_id,
            error=str(exc),
        )
        return False


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
        base = f"http://logto:3001/api"

        temp_password = _generate_temp_password()

        async with httpx.AsyncClient(timeout=10) as client:
            password_set = await _set_user_password(
                client, base, logto_user_id, temp_password, headers
            )
            if not password_set:
                log.warning(
                    "logto.resend_set_password_failed",
                    user_id=logto_user_id,
                    email=email,
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
