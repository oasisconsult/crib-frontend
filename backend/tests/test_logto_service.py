"""
Tests for logto_service.py and the POST /tenants/{id}/resend-login endpoint.

Unit tests mock httpx and email so no real Logto or SMTP is needed.
Integration (endpoint) tests use the real test DB and HTTP client.
"""

from __future__ import annotations

import string
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.tenant import OnboardingState, TenantStatus
from tests.conftest import auth_headers
from tests.factories import make_organisation, make_property, make_tenant


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _resp(status: int, body=None):
    """Minimal httpx-response-like mock."""
    m = MagicMock()
    m.status_code = status
    m.json.return_value = body if body is not None else {}
    m.raise_for_status = MagicMock()
    return m


class _FakeClient:
    """
    Async-context-manager drop-in for a single httpx.AsyncClient() block.
    `responses` maps url_fragment → mock response (method-agnostic).
    """

    def __init__(self, responses: dict[str, object]):
        self._resp = responses
        self.calls: list[tuple[str, str]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def _find(self, url: str):
        for fragment, resp in self._resp.items():
            if fragment in url:
                return resp
        raise KeyError(f"No mock registered for URL containing: {url}")

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url))
        return self._find(url)

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url))
        return self._find(url)

    async def patch(self, url, **kwargs):
        self.calls.append(("PATCH", url))
        return self._find(url)


def _mock_settings(**overrides):
    """Build a MagicMock that looks like Settings with sensible defaults."""
    m = MagicMock()
    m.logto_m2m_app_id = overrides.get("logto_m2m_app_id", "m2m_id")
    m.logto_m2m_app_secret = overrides.get("logto_m2m_app_secret", "m2m_secret")
    m.logto_admin_endpoint = overrides.get("logto_admin_endpoint", "http://logto:3002/")
    m.logto_management_api_base = overrides.get(
        "logto_management_api_base", "http://logto:3002/api"
    )
    m.logto_tenant_org_role_name = overrides.get("logto_tenant_org_role_name", "tenant")
    m.frontend_url = overrides.get("frontend_url", "http://localhost:3000")
    return m


# ─────────────────────────────────────────────────────────────────────────────
# _generate_temp_password
# ─────────────────────────────────────────────────────────────────────────────

def test_generate_temp_password_length_and_policy():
    from app.services.logto_service import _generate_temp_password

    for _ in range(30):
        pwd = _generate_temp_password()
        assert len(pwd) == 16
        assert any(c in string.ascii_uppercase for c in pwd), "No uppercase"
        assert any(c in string.ascii_lowercase for c in pwd), "No lowercase"
        assert any(c in string.digits for c in pwd), "No digit"
        assert any(c in "!@#$" for c in pwd), "No special char"


def test_generate_temp_password_is_random():
    from app.services.logto_service import _generate_temp_password

    passwords = {_generate_temp_password() for _ in range(10)}
    assert len(passwords) > 1


# ─────────────────────────────────────────────────────────────────────────────
# _is_configured
# ─────────────────────────────────────────────────────────────────────────────

def test_is_configured_true_when_both_creds_set():
    from app.services.logto_service import _is_configured

    with patch("app.core.config.get_settings", return_value=_mock_settings()):
        assert _is_configured() is True


def test_is_configured_false_when_credentials_missing():
    from app.services.logto_service import _is_configured

    for app_id, secret in [("", "secret"), ("id", ""), ("", "")]:
        s = _mock_settings(logto_m2m_app_id=app_id, logto_m2m_app_secret=secret)
        with patch("app.core.config.get_settings", return_value=s):
            assert _is_configured() is False


# ─────────────────────────────────────────────────────────────────────────────
# create_tenant_user — not configured
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_tenant_user_not_configured_returns_none():
    from app.services.logto_service import create_tenant_user

    with patch("app.services.logto_service._is_configured", return_value=False):
        result = await create_tenant_user(
            email="t@example.com", first_name="Alice",
            last_name="Smith", logto_org_id="org_abc",
        )

    assert result is None


# ─────────────────────────────────────────────────────────────────────────────
# create_tenant_user — happy path (new user)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_tenant_user_happy_path_new_user():
    """
    New user: 201 from POST /users → set temp password → add to org →
    assign role → send welcome email → return logto_user_id.
    """
    from app.services import logto_service

    new_id = "usr_new_abc"
    fake_role_id = "role_tenant_xyz"

    main_client = _FakeClient({
        "/users":                          _resp(201, {"id": new_id}),
        f"/users/{new_id}":               _resp(200, {}),   # PATCH password
        "/organizations/org_test/users":  _resp(201, {}),   # add to org
        "roles":                          _resp(201, {}),   # assign role
    })

    with patch("app.services.logto_service._is_configured", return_value=True), \
         patch("app.services.logto_service._get_m2m_token", new=AsyncMock(return_value="tok")), \
         patch("app.services.logto_service._get_tenant_org_role_id",
               new=AsyncMock(return_value=fake_role_id)), \
         patch("app.services.logto_service._send_welcome_email",
               new=AsyncMock()) as mock_email, \
         patch("app.core.config.get_settings", return_value=_mock_settings()), \
         patch("app.services.logto_service.httpx.AsyncClient", return_value=main_client):

        result = await logto_service.create_tenant_user(
            email="alice@example.com", first_name="Alice",
            last_name="Nakato", logto_org_id="org_test",
        )

    assert result == new_id
    mock_email.assert_called_once()
    kw = mock_email.call_args.kwargs
    assert kw["email"] == "alice@example.com"
    assert kw["first_name"] == "Alice"
    assert len(kw["temp_password"]) == 16


# ─────────────────────────────────────────────────────────────────────────────
# create_tenant_user — existing user (422 conflict)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_tenant_user_existing_user_no_email():
    """
    When POST /users returns 422 (already exists):
    look up by email, return existing ID, and do NOT send a welcome email.
    """
    from app.services import logto_service

    existing_id = "usr_existing_456"

    conflict_resp = MagicMock()
    conflict_resp.status_code = 422
    search_resp = _resp(200, [{"id": existing_id}])

    class _ConflictClient(_FakeClient):
        async def post(self, url, **kwargs):
            self.calls.append(("POST", url))
            if "/users" in url and "organizations" not in url:
                return conflict_resp
            return self._find(url)

        async def get(self, url, **kwargs):
            self.calls.append(("GET", url))
            if "/users" in url:
                return search_resp
            return self._find(url)

    client = _ConflictClient({
        "/organizations/org_test/users": _resp(201, {}),
        "roles":                         _resp(201, {}),
    })

    with patch("app.services.logto_service._is_configured", return_value=True), \
         patch("app.services.logto_service._get_m2m_token", new=AsyncMock(return_value="tok")), \
         patch("app.services.logto_service._get_tenant_org_role_id",
               new=AsyncMock(return_value="role_x")), \
         patch("app.services.logto_service._send_welcome_email",
               new=AsyncMock()) as mock_email, \
         patch("app.core.config.get_settings", return_value=_mock_settings()), \
         patch("app.services.logto_service.httpx.AsyncClient", return_value=client):

        result = await logto_service.create_tenant_user(
            email="bob@example.com", first_name="Bob",
            last_name="Ssemwanga", logto_org_id="org_test",
        )

    assert result == existing_id
    mock_email.assert_not_called()  # no welcome email for existing users


# ─────────────────────────────────────────────────────────────────────────────
# create_tenant_user — exception swallowed
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_tenant_user_exception_returns_none():
    """Any unexpected error must be caught; None returned so activation isn't blocked."""
    from app.services.logto_service import create_tenant_user

    with patch("app.services.logto_service._is_configured", return_value=True), \
         patch("app.services.logto_service._get_m2m_token",
               new=AsyncMock(side_effect=RuntimeError("Logto is down"))):
        result = await create_tenant_user(
            email="err@example.com", first_name="Err",
            last_name="User", logto_org_id="org_xyz",
        )

    assert result is None


# ─────────────────────────────────────────────────────────────────────────────
# _get_tenant_org_role_id
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_tenant_org_role_id_found():
    from app.services.logto_service import _get_tenant_org_role_id

    target_id = "role_tenant_abc"
    client = _FakeClient({
        "organizations": _resp(200, [
            {"id": "role_other", "name": "manager"},
            {"id": target_id, "name": "Tenant"},  # case-insensitive match
        ])
    })

    with patch("app.services.logto_service.httpx.AsyncClient", return_value=client), \
         patch("app.core.config.get_settings",
               return_value=_mock_settings(logto_tenant_org_role_name="tenant")):
        result = await _get_tenant_org_role_id(
            "org_test", base="http://logto:3002/api", headers={}
        )

    assert result == target_id


@pytest.mark.asyncio
async def test_get_tenant_org_role_id_not_found_returns_none():
    from app.services.logto_service import _get_tenant_org_role_id

    client = _FakeClient({
        "organizations": _resp(200, [{"id": "role_x", "name": "manager"}])
    })

    with patch("app.services.logto_service.httpx.AsyncClient", return_value=client), \
         patch("app.core.config.get_settings",
               return_value=_mock_settings(logto_tenant_org_role_name="tenant")):
        result = await _get_tenant_org_role_id(
            "org_test", base="http://logto:3002/api", headers={}
        )

    assert result is None


@pytest.mark.asyncio
async def test_get_tenant_org_role_id_api_error_returns_none():
    from app.services.logto_service import _get_tenant_org_role_id

    client = _FakeClient({"organizations": _resp(500, {})})

    with patch("app.services.logto_service.httpx.AsyncClient", return_value=client), \
         patch("app.core.config.get_settings",
               return_value=_mock_settings(logto_tenant_org_role_name="tenant")):
        result = await _get_tenant_org_role_id(
            "org_test", base="http://logto:3002/api", headers={}
        )

    assert result is None


# ─────────────────────────────────────────────────────────────────────────────
# _send_welcome_email
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_welcome_email_content():
    from app.services.logto_service import _send_welcome_email

    provider = AsyncMock()
    provider.send = AsyncMock(return_value=MagicMock(success=True, failure_reason=None))

    with patch(
        "app.integrations.notifications.email.get_email_provider",
        return_value=provider,
    ):
        await _send_welcome_email(
            email="alice@example.com",
            first_name="Alice",
            temp_password="Temp1234!@#$abcd",
            portal_url="http://localhost:3000",
        )

    provider.send.assert_called_once()
    kw = provider.send.call_args.kwargs
    assert kw["recipient_email"] == "alice@example.com"
    assert kw["recipient_name"] == "Alice"
    assert "Temp1234!@#$abcd" in kw["body"]
    assert "http://localhost:3000/portal" in kw["body"]
    assert kw["subject"]


@pytest.mark.asyncio
async def test_send_welcome_email_failure_does_not_raise():
    """A failed email send must be logged but must not propagate an exception."""
    from app.services.logto_service import _send_welcome_email

    provider = AsyncMock()
    provider.send = AsyncMock(
        return_value=MagicMock(success=False, failure_reason="Connection refused")
    )

    with patch(
        "app.integrations.notifications.email.get_email_provider",
        return_value=provider,
    ):
        await _send_welcome_email(
            email="fail@example.com",
            first_name="Fail",
            temp_password="TempFail1!",
            portal_url="http://localhost:3000",
        )
    # If we get here without an exception, the test passes


# ─────────────────────────────────────────────────────────────────────────────
# resend_login_credentials (logto_service level)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resend_login_credentials_not_configured():
    from app.services.logto_service import resend_login_credentials

    with patch("app.services.logto_service._is_configured", return_value=False):
        result = await resend_login_credentials(
            logto_user_id="usr_123", email="t@example.com", first_name="Test",
        )

    assert result is False


@pytest.mark.asyncio
async def test_resend_login_credentials_happy_path():
    from app.services.logto_service import resend_login_credentials

    client = _FakeClient({"/users/usr_abc": _resp(200, {})})

    with patch("app.services.logto_service._is_configured", return_value=True), \
         patch("app.services.logto_service._get_m2m_token", new=AsyncMock(return_value="tok")), \
         patch("app.core.config.get_settings", return_value=_mock_settings()), \
         patch("app.services.logto_service.httpx.AsyncClient", return_value=client), \
         patch("app.services.logto_service._send_welcome_email",
               new=AsyncMock()) as mock_email:

        result = await resend_login_credentials(
            logto_user_id="usr_abc", email="alice@example.com", first_name="Alice",
        )

    assert result is True
    mock_email.assert_called_once()
    kw = mock_email.call_args.kwargs
    assert kw["email"] == "alice@example.com"
    assert kw["first_name"] == "Alice"
    assert len(kw["temp_password"]) == 16


@pytest.mark.asyncio
async def test_resend_login_credentials_patch_fails_returns_false():
    """If the PATCH /users call returns non-2xx, return False and skip email."""
    from app.services.logto_service import resend_login_credentials

    client = _FakeClient({"/users/usr_abc": _resp(500, {})})

    with patch("app.services.logto_service._is_configured", return_value=True), \
         patch("app.services.logto_service._get_m2m_token", new=AsyncMock(return_value="tok")), \
         patch("app.core.config.get_settings", return_value=_mock_settings()), \
         patch("app.services.logto_service.httpx.AsyncClient", return_value=client), \
         patch("app.services.logto_service._send_welcome_email",
               new=AsyncMock()) as mock_email:

        result = await resend_login_credentials(
            logto_user_id="usr_abc", email="alice@example.com", first_name="Alice",
        )

    assert result is False
    mock_email.assert_not_called()


@pytest.mark.asyncio
async def test_resend_login_credentials_exception_returns_false():
    from app.services.logto_service import resend_login_credentials

    with patch("app.services.logto_service._is_configured", return_value=True), \
         patch("app.services.logto_service._get_m2m_token",
               new=AsyncMock(side_effect=ConnectionError("timeout"))):
        result = await resend_login_credentials(
            logto_user_id="usr_abc", email="x@example.com", first_name="X",
        )

    assert result is False


# ═══════════════════════════════════════════════════════════════════════════════
# Integration tests — POST /tenants/{id}/resend-login endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
async def org(db_session):
    return await make_organisation(db_session, logto_org_id="org_dev", slug="org-dev-logto")


@pytest.fixture
async def prop(db_session, org):
    return await make_property(db_session, org)


@pytest.fixture
async def activated_tenant(db_session, org):
    """Activated tenant with no Logto account yet."""
    return await make_tenant(
        db_session, org,
        first_name="Carol", last_name="Apio",
        email="carol@example.com",
        onboarding_state=OnboardingState.activated,
        status=TenantStatus.active,
    )


@pytest.fixture
async def activated_tenant_with_logto(db_session, org):
    """Activated tenant that already has a Logto account."""
    t = await make_tenant(
        db_session, org,
        first_name="David", last_name="Onen",
        email="david@example.com",
        onboarding_state=OnboardingState.activated,
        status=TenantStatus.active,
    )
    t.logto_user_id = "usr_logto_existing_789"
    await db_session.flush()
    return t


@pytest.mark.asyncio
async def test_resend_login_non_activated_tenant_returns_409(
    client: AsyncClient, db_session, org
):
    """resend-login for a non-activated tenant must return 409."""
    non_activated = await make_tenant(
        db_session, org, first_name="Eve", last_name="Ajok",
        email="eve@example.com", onboarding_state=OnboardingState.submitted,
    )
    resp = await client.post(
        f"/api/v1/tenants/{non_activated.id}/resend-login",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 409
    assert "activated" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_login_creates_logto_account_when_missing(
    client: AsyncClient, activated_tenant, db_session
):
    """
    When tenant has no logto_user_id: create an account via logto_service,
    persist it on the tenant row, and return {"ok": True, "logto_user_id": ...}.
    """
    new_id = "usr_brand_new_abc"

    # Mock the logto-level function (imported inside the service function body)
    with patch(
        "app.services.logto_service.create_tenant_user",
        new=AsyncMock(return_value=new_id),
    ):
        resp = await client.post(
            f"/api/v1/tenants/{activated_tenant.id}/resend-login",
            headers=auth_headers("manager-1"),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["logto_user_id"] == new_id

    await db_session.refresh(activated_tenant)
    assert activated_tenant.logto_user_id == new_id


@pytest.mark.asyncio
async def test_resend_login_resets_existing_account(
    client: AsyncClient, activated_tenant_with_logto
):
    """
    When tenant already has logto_user_id: call logto resend_login_credentials
    (not create_tenant_user) to reset password and re-send email.
    """
    with patch(
        "app.services.logto_service.resend_login_credentials",
        new=AsyncMock(return_value=True),
    ) as mock_resend:
        resp = await client.post(
            f"/api/v1/tenants/{activated_tenant_with_logto.id}/resend-login",
            headers=auth_headers("manager-1"),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["logto_user_id"] == "usr_logto_existing_789"
    mock_resend.assert_called_once_with(
        logto_user_id="usr_logto_existing_789",
        email="david@example.com",
        first_name="David",
    )


@pytest.mark.asyncio
async def test_resend_login_logto_unavailable_returns_503(
    client: AsyncClient, activated_tenant_with_logto
):
    """If Logto returns an error, the endpoint must return 503."""
    # Mock the logto-level function so the service still runs and raises 503
    with patch(
        "app.services.logto_service.resend_login_credentials",
        new=AsyncMock(return_value=False),
    ):
        resp = await client.post(
            f"/api/v1/tenants/{activated_tenant_with_logto.id}/resend-login",
            headers=auth_headers("manager-1"),
        )

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_resend_login_cross_org_returns_404(
    client: AsyncClient, db_session, org  # org ensures manager-1's org exists
):
    """A manager cannot resend credentials for a tenant in a different org."""
    other_org = await make_organisation(
        db_session, logto_org_id="org_cross_logto", slug="org-cross-logto"
    )
    other_tenant = await make_tenant(
        db_session, other_org,
        email="cross@example.com",
        onboarding_state=OnboardingState.activated,
        status=TenantStatus.active,
    )
    resp = await client.post(
        f"/api/v1/tenants/{other_tenant.id}/resend-login",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_resend_login_unknown_tenant_returns_404(
    client: AsyncClient, org  # org ensures manager-1's org exists
):
    """Non-existent tenant ID returns 404."""
    import uuid
    resp = await client.post(
        f"/api/v1/tenants/{uuid.uuid4()}/resend-login",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 404
