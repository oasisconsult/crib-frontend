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

    resource = str(s.logto_admin_api_resource)
    url = f"{str(s.logto_endpoint).rstrip('/')}/oidc/token"

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
    Assign the 'tenant' role to a user.
    Uses regular roles instead of organization roles for better compatibility.
    Creates the role if it doesn't exist.
    Returns True if successful, False otherwise (but doesn't block provisioning).
    """
    try:
        log.info("logto.assign_role_start", org_id=org_id, user_id=user_id)
        
        # Try to find existing "tenant" role
        roles_resp = await client.get(
            f"{base}/roles",
            headers=headers,
        )
        
        log.info("logto.get_roles_response", 
                status=roles_resp.status_code,
                response_body=roles_resp.text[:500])
        
        role_id = None
        if roles_resp.status_code == 200:
            roles = roles_resp.json()
            log.info("logto.found_roles", role_count=len(roles))
            
            # Find "tenant" role (case-insensitive)
            tenant_role = next(
                (r for r in roles if r.get("name", "").lower() == "tenant"),
                None,
            )
            
            if tenant_role:
                role_id = tenant_role["id"]
                log.info("logto.tenant_role_found", role_id=role_id)
            else:
                # Create the tenant role
                log.info("logto.tenant_role_not_found_creating")
                create_role_resp = await client.post(
                    f"{base}/roles",
                    json={
                        "name": "tenant",
                        "description": "Tenant role for property tenants"
                    },
                    headers=headers,
                )
                
                log.info("logto.create_role_response",
                        status=create_role_resp.status_code,
                        response_body=create_role_resp.text[:500])
                
                if create_role_resp.status_code not in (200, 201, 204):
                    log.warning(
                        "logto.create_tenant_role_failed",
                        status=create_role_resp.status_code,
                        response_body=create_role_resp.text,
                    )
                    return False
                
                role_id = create_role_resp.json()["id"]
                log.info("logto.tenant_role_created", role_id=role_id)
        else:
            log.warning(
                "logto.get_roles_failed",
                status=roles_resp.status_code,
                response_body=roles_resp.text,
            )
            return False

        # Assign role to user using regular roles endpoint
        log.info("logto.assigning_role_to_user", 
                user_id=user_id, 
                role_id=role_id)
        
        assign_resp = await client.post(
            f"{base}/users/{user_id}/roles",
            json={"roleIds": [role_id]},
            headers=headers,
        )

        log.info("logto.assign_role_response",
                user_id=user_id,
                role_id=role_id,
                status=assign_resp.status_code,
                response_body=assign_resp.text[:500])

        if assign_resp.status_code in (200, 201, 204):
            log.info(
                "logto.tenant_role_assigned",
                user_id=user_id,
                role_id=role_id,
            )
            return True

        log.warning(
            "logto.assign_role_failed",
            user_id=user_id,
            role_id=role_id,
            status=assign_resp.status_code,
            response_body=assign_resp.text,
        )
        return False

    except Exception as exc:  # noqa: BLE001
        log.warning(
            "logto.assign_role_exception",
            user_id=user_id,
            error=str(exc),
        )
        return False


# ── Create landlord user (no org — app-level role only) ───────────────────────


async def create_landlord_user(
    *,
    email: str,
    first_name: str,
    last_name: str,
    temp_password: str,
    logto_org_id: str | None = None,
) -> str | None:
    """
    Create a Logto user for an invited landlord.
    Assigns the app-level `landlord` role.
    If logto_org_id is provided, also adds the user to the agency's Logto org
    and assigns the org-level `landlord` role so the JWT carries org context.
    Returns the Logto user ID on success, None on failure.
    """
    if not _is_configured():
        log.debug("logto.m2m_not_configured — skipping landlord user creation", email=email)
        return None

    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"

        async with httpx.AsyncClient(timeout=10) as client:
            # Create user
            create_resp = await client.post(
                f"{base}/users",
                json={
                    "primaryEmail": email,
                    "name": f"{first_name} {last_name}",
                    "username": email.split("@")[0].lower(),
                    "password": temp_password,
                },
                headers=headers,
            )

            if create_resp.status_code == 422:
                # User already exists — look them up
                search = await client.get(f"{base}/users", params={"search": email}, headers=headers)
                search.raise_for_status()
                users = search.json()
                if not users:
                    return None
                logto_user_id = users[0]["id"]
            else:
                create_resp.raise_for_status()
                logto_user_id = create_resp.json()["id"]

            # Assign app-level 'landlord' role
            await _assign_app_role(client, base, logto_user_id, "landlord", headers)

            # Add to agency org + assign org-level landlord role so JWT carries org_id
            if logto_org_id:
                add_resp = await client.post(
                    f"{base}/organizations/{logto_org_id}/users",
                    json={"userIds": [logto_user_id]},
                    headers=headers,
                )
                if add_resp.status_code not in (200, 201, 204):
                    log.warning(
                        "logto.landlord_add_to_org_failed",
                        user_id=logto_user_id,
                        org_id=logto_org_id,
                        status=add_resp.status_code,
                    )
                else:
                    log.info(
                        "logto.landlord_added_to_org",
                        user_id=logto_user_id,
                        org_id=logto_org_id,
                    )
                    await _assign_org_role(
                        client, base, logto_org_id, logto_user_id, "landlord", headers
                    )

        log.info("logto.landlord_user_provisioned", email=email, logto_user_id=logto_user_id)
        return logto_user_id

    except Exception as exc:  # noqa: BLE001
        log.warning("logto.create_landlord_user_failed", email=email, error=str(exc))
        return None


async def _assign_app_role(
    client: httpx.AsyncClient,
    base: str,
    user_id: str,
    role_name: str,
    headers: dict,
) -> bool:
    """Find or create an app-level role by name and assign it to the user."""
    try:
        roles_resp = await client.get(f"{base}/roles", headers=headers)
        roles_resp.raise_for_status()
        role_id = None
        for r in roles_resp.json():
            if r.get("name", "").lower() == role_name.lower():
                role_id = r["id"]
                break

        if not role_id:
            create_resp = await client.post(
                f"{base}/roles",
                json={"name": role_name, "description": f"{role_name.capitalize()} role"},
                headers=headers,
            )
            create_resp.raise_for_status()
            role_id = create_resp.json()["id"]

        assign_resp = await client.post(
            f"{base}/users/{user_id}/roles",
            json={"roleIds": [role_id]},
            headers=headers,
        )
        return assign_resp.status_code in (200, 201, 204)
    except Exception as exc:  # noqa: BLE001
        log.warning("logto.assign_app_role_failed", user_id=user_id, role=role_name, error=str(exc))
        return False


# ── Create agency organisation + manager user ──────────────────────────────────


async def create_agency_with_manager(
    *,
    agency_name: str,
    agency_slug: str,
    manager_email: str,
    manager_first_name: str,
    manager_last_name: str,
    temp_password: str,
) -> tuple[str, str] | None:
    """
    Create a Logto organisation for the agency and a manager user.
    Returns (logto_org_id, logto_user_id) on success, None on failure.

    Flow:
      1. Create Logto org
      2. Create manager user
      3. Add user to org
      4. Assign 'manager' org role
    """
    if not _is_configured():
        log.debug("logto.m2m_not_configured — using dev stubs")
        import secrets as _sec
        return f"org_dev_{agency_slug}", f"user_dev_{_sec.token_hex(8)}"

    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"

        async with httpx.AsyncClient(timeout=15) as client:
            # 1. Create org
            org_resp = await client.post(
                f"{base}/organizations",
                json={"name": agency_name, "description": f"Agency: {agency_slug}"},
                headers=headers,
            )
            org_resp.raise_for_status()
            logto_org_id = org_resp.json()["id"]
            log.info("logto.agency_org_created", org_id=logto_org_id, name=agency_name)

            # 2. Create manager user
            create_resp = await client.post(
                f"{base}/users",
                json={
                    "primaryEmail": manager_email,
                    "name": f"{manager_first_name} {manager_last_name}",
                    "username": manager_email.split("@")[0].lower(),
                    "password": temp_password,
                },
                headers=headers,
            )
            if create_resp.status_code == 422:
                search = await client.get(
                    f"{base}/users", params={"search": manager_email}, headers=headers
                )
                search.raise_for_status()
                users = search.json()
                logto_user_id = users[0]["id"] if users else None
            else:
                create_resp.raise_for_status()
                logto_user_id = create_resp.json()["id"]

            if not logto_user_id:
                log.warning("logto.agency_manager_not_created", email=manager_email)
                return None

            # 3. Add user to org
            add_resp = await client.post(
                f"{base}/organizations/{logto_org_id}/users",
                json={"userIds": [logto_user_id]},
                headers=headers,
            )
            if add_resp.status_code not in (200, 201, 204):
                log.warning("logto.agency_add_to_org_failed", status=add_resp.status_code)

            # 4. Assign manager org-level role (scoped to this org)
            org_role_ok = await _assign_org_role(
                client, base, logto_org_id, logto_user_id, "manager", headers
            )

            # 5. Also assign app-level 'manager' role as a fallback so the JWT
            #    always carries the role claim even if org-role step fails.
            await _assign_app_role(client, base, logto_user_id, "manager", headers)

            if not org_role_ok:
                log.warning(
                    "logto.agency_manager_org_role_failed",
                    user_id=logto_user_id,
                    org_id=logto_org_id,
                )

        log.info(
            "logto.agency_provisioned",
            org_id=logto_org_id, user_id=logto_user_id, agency=agency_name
        )
        return logto_org_id, logto_user_id

    except Exception as exc:  # noqa: BLE001
        log.warning("logto.create_agency_failed", agency=agency_name, error=str(exc))
        return None


async def _assign_org_role(
    client: httpx.AsyncClient,
    base: str,
    org_id: str,
    user_id: str,
    role_name: str,
    headers: dict,
) -> bool:
    """
    Find (or create) a global org-role template by name, then assign it to
    the user within the given organisation.

    Logto org roles are defined globally at /api/organization-roles and then
    assigned per-org per-user. Unlike app-level roles, the previous code did
    not create the template when missing — this caused silent failures every
    time the 'manager' (or 'landlord') org-role hadn't been seeded in Logto.
    """
    try:
        role_id: str | None = None

        # 1. Check org-specific available roles first (fast path)
        roles_resp = await client.get(f"{base}/organizations/{org_id}/roles", headers=headers)
        if roles_resp.status_code == 200:
            for r in roles_resp.json():
                if r.get("name", "").lower() == role_name.lower():
                    role_id = r["id"]
                    break

        # 2. Fall back to global org-role templates
        if not role_id:
            gr = await client.get(f"{base}/organization-roles", headers=headers)
            if gr.status_code == 200:
                for r in gr.json():
                    if r.get("name", "").lower() == role_name.lower():
                        role_id = r["id"]
                        break

        # 3. Create the org-role template if it still doesn't exist
        if not role_id:
            log.info("logto.org_role_not_found_creating", role=role_name)
            create_resp = await client.post(
                f"{base}/organization-roles",
                json={
                    "name": role_name,
                    "description": f"{role_name.capitalize()} organisation role",
                },
                headers=headers,
            )
            if create_resp.status_code in (200, 201):
                role_id = create_resp.json()["id"]
                log.info("logto.org_role_created", role=role_name, role_id=role_id)
            else:
                log.warning(
                    "logto.org_role_create_failed",
                    role=role_name,
                    status=create_resp.status_code,
                    body=create_resp.text[:200],
                )
                return False

        assign = await client.post(
            f"{base}/organizations/{org_id}/users/{user_id}/roles",
            json={"organizationRoleIds": [role_id]},
            headers=headers,
        )
        success = assign.status_code in (200, 201, 204)
        if success:
            log.info("logto.org_role_assigned", user_id=user_id, org_id=org_id, role=role_name)
        else:
            log.warning(
                "logto.org_role_assign_failed",
                user_id=user_id, org_id=org_id, role=role_name,
                status=assign.status_code, body=assign.text[:200],
            )
        return success
    except Exception as exc:  # noqa: BLE001
        log.warning("logto.assign_org_role_failed", error=str(exc))
        return False


# ── Send landlord welcome email ────────────────────────────────────────────────


async def send_landlord_welcome_email(
    *,
    email: str,
    first_name: str,
    temp_password: str,
    frontend_url: str,
) -> None:
    """Send invited landlord their login credentials."""
    from app.integrations.notifications.email import get_email_provider

    subject = "Welcome to Crib — your landlord dashboard is ready"
    body = (
        f"Hi {first_name},\n\n"
        "Your landlord account has been created. You can now sign in to view "
        "your properties, leases, and payment history.\n\n"
        f"Login:     {frontend_url}/login\n"
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
        log.info("logto.landlord_welcome_email_sent", email=email)
    else:
        log.warning("logto.landlord_welcome_email_failed", email=email, reason=result.failure_reason)


async def send_agency_manager_welcome_email(
    *,
    email: str,
    first_name: str,
    agency_name: str,
    temp_password: str,
    frontend_url: str,
) -> None:
    """Send newly-created agency manager their login credentials."""
    from app.integrations.notifications.email import get_email_provider

    subject = f"Welcome to Crib — {agency_name} is now live"
    body = (
        f"Hi {first_name},\n\n"
        f"Your agency '{agency_name}' has been set up on Crib. You can now sign in "
        "to manage your properties, tenants, leases, and more.\n\n"
        f"Login:     {frontend_url}/login\n"
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
        log.info("logto.agency_welcome_email_sent", email=email, agency=agency_name)
    else:
        log.warning("logto.agency_welcome_email_failed", email=email, reason=result.failure_reason)


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


# ── Suspend / unsuspend user ───────────────────────────────────────────────────

async def set_user_suspended(logto_sub: str, *, suspended: bool) -> bool:
    """
    Suspend or unsuspend a Logto user account.
    Called when a profile is deactivated/restored.
    Returns True on success, False on failure (logged but not raised).
    """
    if not _is_configured():
        log.debug(
            "logto.m2m_not_configured — skipping user suspend toggle",
            sub=logto_sub, suspended=suspended
        )
        return False

    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(
                f"{base}/users/{logto_sub}",
                json={"isSuspended": suspended},
                headers=headers,
            )
        if resp.status_code in (200, 201, 204):
            log.info("logto.user_suspended_set", sub=logto_sub, suspended=suspended)
            return True
        log.warning(
            "logto.user_suspend_failed",
            sub=logto_sub, suspended=suspended,
            status=resp.status_code, body=resp.text[:200],
        )
        return False
    except Exception as exc:  # noqa: BLE001
        log.warning("logto.user_suspend_exception", sub=logto_sub, error=str(exc))
        return False


# ── Create personal org for independent landlord ──────────────────────────────

async def create_personal_org_with_owner(
    *,
    user_id: str,
    first_name: str,
    last_name: str,
) -> str | None:
    """
    Create a personal Logto organisation for an independent landlord and
    add them as the owner.  Returns the Logto org ID on success, None on failure.

    This is a lighter variant of create_agency_with_manager that skips user
    creation (the user already exists) and assigns the owner org role.
    """
    if not _is_configured():
        log.debug("logto.m2m_not_configured — skipping personal org creation", user_id=user_id)
        return None

    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"
        org_name = f"{first_name} {last_name}'s Properties"

        async with httpx.AsyncClient(timeout=15) as client:
            # 1. Create the Logto org
            org_resp = await client.post(
                f"{base}/organizations",
                json={"name": org_name, "description": f"Personal org for independent landlord"},
                headers=headers,
            )
            org_resp.raise_for_status()
            logto_org_id = org_resp.json()["id"]
            log.info("logto.personal_org_created", org_id=logto_org_id, name=org_name)

            # 2. Add user to org
            add_resp = await client.post(
                f"{base}/organizations/{logto_org_id}/users",
                json={"userIds": [user_id]},
                headers=headers,
            )
            if add_resp.status_code not in (200, 201, 204):
                log.warning("logto.personal_org_add_user_failed", status=add_resp.status_code)

            # 3. Assign 'owner' org role (create if missing)
            await _assign_org_role(client, base, logto_org_id, user_id, "owner", headers)
            # Also assign app-level 'owner' role as fallback
            await _assign_app_role(client, base, user_id, "owner", headers)

        log.info("logto.personal_org_provisioned", org_id=logto_org_id, user_id=user_id)
        return logto_org_id

    except Exception as exc:  # noqa: BLE001
        log.warning("logto.personal_org_creation_failed", user_id=user_id, error=str(exc))
        return None


# ── Org membership cleanup ────────────────────────────────────────────────────


async def remove_user_from_org(logto_org_id: str, user_id: str) -> bool:
    """Remove a user from a Logto organisation. Non-fatal on failure."""
    if not _is_configured():
        return False
    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.delete(
                f"{base}/organizations/{logto_org_id}/users",
                json={"userIds": [user_id]},
                headers=headers,
            )
        if resp.status_code in (200, 201, 204):
            log.info("logto.user_removed_from_org", org_id=logto_org_id, user_id=user_id)
            return True
        log.warning(
            "logto.remove_from_org_failed",
            org_id=logto_org_id, user_id=user_id,
            status=resp.status_code, body=resp.text[:200],
        )
        return False
    except Exception as exc:  # noqa: BLE001
        log.warning("logto.remove_from_org_exception", org_id=logto_org_id, user_id=user_id, error=str(exc))
        return False


async def remove_user_app_role(user_id: str, role_name: str) -> bool:
    """
    Remove a named app-level role from a Logto user.
    Looks up the role ID first; silently succeeds if the user doesn't have it.
    """
    if not _is_configured():
        return False
    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"
        async with httpx.AsyncClient(timeout=10) as client:
            # Find which roles the user currently holds
            user_roles_resp = await client.get(
                f"{base}/users/{user_id}/roles", headers=headers
            )
            if user_roles_resp.status_code != 200:
                return False
            role_ids = [
                r["id"] for r in user_roles_resp.json()
                if r.get("name", "").lower() == role_name.lower()
            ]
            if not role_ids:
                return True  # User doesn't have the role — nothing to do
            # DELETE endpoint accepts a list of role IDs
            del_resp = await client.delete(
                f"{base}/users/{user_id}/roles",
                json={"roleIds": role_ids},
                headers=headers,
            )
        if del_resp.status_code in (200, 201, 204):
            log.info("logto.app_role_removed", user_id=user_id, role=role_name)
            return True
        log.warning(
            "logto.remove_app_role_failed",
            user_id=user_id, role=role_name,
            status=del_resp.status_code, body=del_resp.text[:200],
        )
        return False
    except Exception as exc:  # noqa: BLE001
        log.warning("logto.remove_app_role_exception", user_id=user_id, error=str(exc))
        return False


async def get_user_logto_org_ids(user_id: str) -> list[str]:
    """Return all Logto org IDs the user currently belongs to."""
    if not _is_configured():
        return []
    try:
        token = await _get_m2m_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        base = "http://logto:3001/api"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base}/users/{user_id}/organizations", headers=headers
            )
        if resp.status_code == 200:
            return [o["id"] for o in resp.json()]
        log.warning(
            "logto.get_user_orgs_failed", user_id=user_id,
            status=resp.status_code, body=resp.text[:200],
        )
        return []
    except Exception as exc:  # noqa: BLE001
        log.warning("logto.get_user_orgs_exception", user_id=user_id, error=str(exc))
        return []


# ── Welcome email for independent landlords ───────────────────────────────────

async def send_independent_landlord_welcome_email(
    *,
    email: str,
    first_name: str,
    temp_password: str,
    frontend_url: str,
) -> None:
    """
    Welcome email for independent landlords (self-managing).
    Differs from the agency-managed landlord email: emphasises that they
    can log in and create their own properties.
    """
    from app.integrations.notifications.email import get_email_provider

    subject = "Welcome to Crib — your landlord account is ready"
    body = (
        f"Hi {first_name},\n\n"
        "Your independent landlord account on Crib has been created.\n\n"
        "Log in to add your properties, invite tenants, and manage leases:\n\n"
        f"Dashboard:  {frontend_url}\n"
        f"Email:      {email}\n"
        f"Password:   {temp_password}\n\n"
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
        log.info("logto.independent_landlord_welcome_sent", email=email)
    else:
        log.warning("logto.independent_landlord_welcome_failed", email=email, reason=result.failure_reason)
