"""
Pytest fixtures for the Crib backend test suite.

Strategy:
  - Real PostgreSQL via TEST_DATABASE_URL (default: same Postgres, separate DB "crib_test")
  - Redis is mocked with fakeredis so tests don't need a running Redis
  - Auth is bypassed via X-Dev-User-Id header (uses DEV_USERS fixtures)
  - Each test gets a fresh DB transaction that is rolled back on teardown
    (no permanent state between tests)
"""

import inspect
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Force all async test functions to share the session event loop.

    pytest-asyncio 0.24.x no longer shares the session loop with test
    functions by default.  Without this, test functions run in a per-function
    loop while fixtures (including test_engine/db_session) were set up in the
    session loop → asyncpg "Future attached to a different loop" errors.
    """
    session_scope = pytest.mark.asyncio(loop_scope="session")
    for item in items:
        if isinstance(item, pytest.Function) and inspect.iscoroutinefunction(item.function):
            item.add_marker(session_scope, append=False)

import app.models  # noqa: F401 — registers all ORM models with Base.metadata
from app.core.config import get_settings
from app.core.database import get_db
from app.models.base import Base

settings = get_settings()

# Use a separate test database to avoid touching dev data.
# Replace only the DB name (the path component after the last '/') to avoid
# accidentally replacing the username if it shares a prefix with the DB name.
_db_base, _db_sep, _db_name = settings.database_url.rpartition("/")
TEST_DATABASE_URL = f"{_db_base}/crib_test"


# ── Database ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create all tables once per test session, drop them at the end."""
    import sqlalchemy as sa

    engine = create_async_engine(TEST_DATABASE_URL, echo=False, future=True, poolclass=NullPool)

    # Ensure pgcrypto and all enum types are available, then create tables
    async with engine.begin() as conn:
        await conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))

        # Create enum types idempotently (SQLAlchemy won't create them if they exist)
        for stmt in [
            "DO $$ BEGIN CREATE TYPE plan_enum AS ENUM ('free','professional','agency','enterprise'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            # Subscription billing enums (migration 028)
            "DO $$ BEGIN CREATE TYPE subscription_status_enum AS ENUM ('trialing','active','pending_payment','pending_verification','grace_period','past_due','suspended','cancelled','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE billing_cycle_enum AS ENUM ('none','monthly','annual'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE billing_currency_enum AS ENUM ('UGX','USD'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE subscription_payment_method_enum AS ENUM ('mtn_momo','airtel_money','bank_transfer','cash'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE subscription_payment_status_enum AS ENUM ('pending','pending_verification','verified','rejected','refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE invoice_status_enum AS ENUM ('draft','issued','paid','void','overdue'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE subscription_event_enum AS ENUM ('created','upgraded','downgraded','cancelled','reinstated','payment_submitted','payment_verified','payment_rejected','suspended','grace_period_started','expired','trial_started','plan_changed'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            # role_enum was removed in migration 011 — Profile.role is now VARCHAR(50)
            "DROP TYPE IF EXISTS property_type_enum CASCADE",
            "CREATE TYPE property_type_enum AS ENUM ('flat','house','hostel','commercial','villa','bungalow','maisonette','townhouse','bedsitter_block')",
            "DO $$ BEGIN CREATE TYPE property_status_enum AS ENUM ('active','inactive','maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DROP TYPE IF EXISTS unit_type_enum CASCADE",
            "CREATE TYPE unit_type_enum AS ENUM ('single','double','studio','ensuite','shared','bedsitter','one_bed','two_bed','three_bed','four_bed_plus')",
            "DO $$ BEGIN CREATE TYPE unit_status_enum AS ENUM ('available','occupied','reserved','maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE tenant_status_enum AS ENUM ('active','inactive','blacklisted'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE onboarding_state_enum AS ENUM ('invited','started','submitted','approved','activated','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE id_document_type_enum AS ENUM ('passport','national_id','driving_licence','residence_permit','proof_of_income','reference_letter','bank_statement','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE invite_status_enum AS ENUM ('pending','accepted','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE lease_status_enum AS ENUM ('draft','onboarding_started','agreement_previewed','terms_accepted','payment_pending','payment_secured','agreement_signed','active','expired','terminated'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE rent_schedule_status_enum AS ENUM ('pending','paid','overdue','waived'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE payment_category_enum AS ENUM ('rent','deposit','late_fee','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE payment_method_enum AS ENUM ('cash','bank_transfer','mobile_money_mtn','mobile_money_airtel','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            # v4 state machine values added alongside legacy values
            "DO $$ BEGIN CREATE TYPE payment_status_enum AS ENUM ("
            "'pending','confirmed','failed','refunded',"
            "'initiated','predicted','routed','reconciled','allocated','completed',"
            "'predicted_failure','retry_scheduled','permanently_failed'"
            "); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE deposit_status_enum AS ENUM ('held','partially_returned','fully_returned','forfeited'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE inspection_type_enum AS ENUM ('move_in','move_out','routine','maintenance','complaint'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE inspection_state_enum AS ENUM ('scheduled','in_progress','completed','approved','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_reporter_enum AS ENUM ('tenant','landlord','inspector'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_category_enum AS ENUM ('plumbing','electrical','structural','appliance','pest','security','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_priority_enum AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE maintenance_state_enum AS ENUM ('reported','assigned','in_progress','resolved','closed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE notification_channel_enum AS ENUM ('email','sms','whatsapp','in_app'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE notification_trigger_enum AS ENUM ('rent_due','rent_overdue','lease_expiry','lease_activated','onboarding_invite','document_ready','inspection_scheduled','maintenance_update','payment_confirmed','payment_failed','late_fee_applied','deposit_received','custom'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE notification_state_enum AS ENUM ('queued','sent','delivered','read','failed'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE tenancy_agreement_status_enum AS ENUM ('draft','tenant_signed','fully_executed'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            # Uganda feature enums (migration 048)
            "DO $$ BEGIN CREATE TYPE furnished_status_enum AS ENUM ('unfurnished','semi_furnished','furnished'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE water_source_enum AS ENUM ('municipal','borehole','tank','multiple'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE backup_power_enum AS ENUM ('none','solar','generator','both'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE internet_type_enum AS ENUM ('none','wifi','fibre'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE compound_type_enum AS ENUM ('private','shared'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE rent_increase_status_enum AS ENUM ('pending_ack','acknowledged','applied','withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE eviction_notice_type_enum AS ENUM ('non_payment','breach','end_of_term','redevelopment'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE eviction_notice_status_enum AS ENUM ('issued','served','disputed','withdrawn','executed'); EXCEPTION WHEN duplicate_object THEN null; END $$",
        ]:
            await conn.execute(sa.text(stmt))

        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

        # Create updated_at trigger function (used by models, not in metadata)
        await conn.execute(sa.text("""
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN NEW.updated_at = now(); RETURN NEW; END;
            $$ language 'plpgsql'
        """))

        # Seed system_settings defaults (mirrors the migration bulk_insert)
        from app.models.system_setting import SYSTEM_SETTING_DEFAULTS as _SETTING_DEFAULTS
        for key, value, category, label, description, value_type, is_secret, is_required in _SETTING_DEFAULTS:
            await conn.execute(sa.text(
                "INSERT INTO system_settings "
                "(key, value, category, label, description, value_type, is_secret, is_required) "
                "VALUES (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required) "
                "ON CONFLICT (key) DO NOTHING"
            ), {
                "key": key, "value": value, "category": category, "label": label,
                "description": description, "value_type": value_type,
                "is_secret": is_secret, "is_required": is_required,
            })

        # Seed email_templates defaults (mirrors the migration bulk_insert)
        from app.models.email_template import EMAIL_TEMPLATE_DEFAULTS as _EMAIL_TEMPLATE_DEFAULTS
        for _tmpl in _EMAIL_TEMPLATE_DEFAULTS:
            await conn.execute(sa.text(
                "INSERT INTO email_templates (slug, name, description, subject, html_body, text_body, is_active) "
                "VALUES (:slug, :name, :description, :subject, :html_body, :text_body, true) "
                "ON CONFLICT (slug) DO NOTHING"
            ), {
                "slug": _tmpl["slug"], "name": _tmpl["name"], "description": _tmpl["description"],
                "subject": _tmpl["subject"], "html_body": _tmpl["html_body"], "text_body": _tmpl["text_body"],
            })

        # Seed RBAC roles (mirrors migration 010 + 011 priority values).
        # Required so deps._get_priority_map() returns correct ordering in tests.
        _ROLES = [
            ("superadmin", "Platform operator",  0),
            ("owner",      "Organisation owner", 10),
            ("manager",    "Property manager",   20),
            ("landlord",   "Landlord",           25),
            ("maintenance","Maintenance staff",  30),
            ("tenant",     "Tenant",             40),
        ]
        for name, description, priority in _ROLES:
            await conn.execute(sa.text(
                "INSERT INTO roles (name, description, priority) "
                "VALUES (:name, :description, :priority) "
                "ON CONFLICT (name) DO UPDATE SET priority = EXCLUDED.priority"
            ), {"name": name, "description": description, "priority": priority})

        # Seed RBAC resources + permissions + role_permissions.
        # Mirrors migration 010 (initial seed) + 031 (profile write permissions).
        # The test DB is created via create_all() (no Alembic), so we must replicate
        # all migration seed data here or require_permission() guards will 403 every test.
        _RESOURCES = [
            "analytics", "inspection", "lease", "ledger", "matching",
            "notification", "payment", "payment_allocation", "settings",
            "tenant", "wallet", "mobile_money", "organisation", "profile",
            "property", "document", "maintenance_request", "unit",
        ]
        _ACTIONS = ["create", "read", "update", "delete"]
        _ALL = set(_ACTIONS)
        _READ = {"read"}

        # Full permission matrix (migration 010 base + migration 031 additions)
        _ROLE_PERMISSIONS: dict[str, dict[str, set[str]]] = {
            "superadmin": {r: _ALL for r in _RESOURCES},
            "owner": {
                "property": _ALL, "unit": _ALL, "lease": _ALL, "tenant": _ALL,
                "payment": _ALL, "payment_allocation": _ALL, "ledger": _ALL,
                "wallet": _ALL, "mobile_money": _ALL, "inspection": _ALL,
                "maintenance_request": _ALL, "notification": _ALL, "document": _ALL,
                # migration 031: add create/update/delete on profile for owner
                "profile": _ALL,
                "organisation": _READ, "analytics": _READ,
                "matching": _READ, "settings": _READ,
            },
            "manager": {
                "property": _ALL, "unit": _ALL, "lease": _ALL, "tenant": _ALL,
                "inspection": _ALL, "maintenance_request": _ALL,
                "notification": _ALL, "document": _ALL,
                # migration 031: add create/update/delete on profile for manager
                "profile": _ALL,
                "payment": _READ, "payment_allocation": _READ, "ledger": _READ,
                "wallet": _READ, "mobile_money": _READ, "organisation": _READ,
                "analytics": _READ, "matching": _READ,
            },
            "tenant": {
                "property": _READ, "lease": _READ, "payment": _READ,
                "payment_allocation": _READ, "ledger": _READ, "wallet": _READ,
                "notification": _READ, "maintenance_request": _READ, "document": _READ,
            },
            "maintenance": {
                "inspection": _READ, "maintenance_request": _READ,
            },
        }

        for resource in _RESOURCES:
            await conn.execute(sa.text(
                "INSERT INTO resources (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"
            ), {"name": resource})
            for action in _ACTIONS:
                await conn.execute(sa.text(
                    "INSERT INTO permissions (resource_id, action) "
                    "SELECT id, :action FROM resources WHERE name = :resource "
                    "ON CONFLICT (resource_id, action) DO NOTHING"
                ), {"action": action, "resource": resource})

        for role, resource_map in _ROLE_PERMISSIONS.items():
            for resource, actions in resource_map.items():
                for action in actions:
                    await conn.execute(sa.text(
                        "INSERT INTO role_permissions (role_id, permission_id) "
                        "SELECT ro.id, p.id "
                        "FROM roles ro "
                        "JOIN resources res ON res.name = :resource "
                        "JOIN permissions p ON p.resource_id = res.id AND p.action = :action "
                        "WHERE ro.name = :role "
                        "ON CONFLICT DO NOTHING"
                    ), {"role": role, "resource": resource, "action": action})

        # Seed the dev organisation that JWT dev-users reference (org_id="org_dev").
        # Without this, _upsert_profile cannot resolve org_dev → profile.organisation_id=None.
        await conn.execute(sa.text(
            "INSERT INTO organisations (logto_org_id, name, slug, plan, settings, payment_settings, currency, is_active) "
            "VALUES ('org_dev', 'Dev Agency', 'dev-agency', 'free', '{}', '{}', 'UGX', true) "
            "ON CONFLICT (logto_org_id) DO NOTHING"
        ))

        # Seed subscription plans (matches migration 065 — pricing v2).
        # Uses DO UPDATE so re-running tests against an existing crib_test DB
        # always reflects the current plan definitions.
        import json as _json
        _FREE_FEATS = _json.dumps({
            "analytics_basic": True, "analytics_advanced": False,
            "maintenance_workflows": False, "document_storage": False,
            "tenant_messaging": False, "inspection_reports": False,
            "esignature_enabled": False, "onboarding_enabled": False,
            "screenings": False, "efris": False, "team_members": False,
            "custom_branding": False, "priority_support": False,
            "dedicated_support": False, "api_access": False,
            "sso": False, "audit_logs": False, "manualPayments": True,
        })
        _PRO_FEATS = _json.dumps({
            "analytics_basic": True, "analytics_advanced": True,
            "maintenance_workflows": True, "document_storage": True,
            "tenant_messaging": True, "inspection_reports": True,
            "esignature_enabled": True, "onboarding_enabled": True,
            "screenings": False, "efris": False, "team_members": False,
            "custom_branding": False, "priority_support": False,
            "dedicated_support": False, "api_access": False,
            "sso": False, "audit_logs": False, "manualPayments": True,
        })
        _AGENCY_FEATS = _json.dumps({
            "analytics_basic": True, "analytics_advanced": True,
            "maintenance_workflows": True, "document_storage": True,
            "tenant_messaging": True, "inspection_reports": True,
            "esignature_enabled": True, "onboarding_enabled": True,
            "screenings": True, "efris": True, "team_members": True,
            "custom_branding": True, "priority_support": True,
            "dedicated_support": False, "api_access": False,
            "sso": False, "audit_logs": True, "manualPayments": True,
        })
        _ENT_FEATS = _json.dumps({
            "analytics_basic": True, "analytics_advanced": True,
            "maintenance_workflows": True, "document_storage": True,
            "tenant_messaging": True, "inspection_reports": True,
            "esignature_enabled": True, "onboarding_enabled": True,
            "screenings": True, "efris": True, "team_members": True,
            "custom_branding": True, "priority_support": True,
            "dedicated_support": True, "api_access": True,
            "sso": True, "audit_logs": True, "manualPayments": True,
        })
        # slug, name, desc, mugx, augx, musd_cents, ausd_cents, max_props, max_units, max_users, max_mb, feats, trial_days, requires_custom_quote, display_order
        _PLANS = [
            ("free",         "Free",         "Get started with basic property management.", 0, 0, 0, 0, 2, 15, 1, 100, _FREE_FEATS, 0, False, 1),
            ("professional", "Professional", "For growing landlords.", 159_000, 1_526_400, 4_500, 43_200, 20, 100, 5, 10_240, _PRO_FEATS, 14, False, 2),
            ("agency",       "Agency",       "For property management agencies.", 399_000, 3_830_400, 10_900, 104_640, -1, 500, 20, 51_200, _AGENCY_FEATS, 14, False, 3),
            ("enterprise",   "Enterprise",   "Unlimited scale.", 0, 0, 0, 0, -1, -1, -1, -1, _ENT_FEATS, 14, True, 4),
        ]
        for slug, name, desc, mugx, augx, musd, ausd, mp, mu, muser, ms, feats, trial, rcq, order in _PLANS:
            await conn.execute(sa.text(
                "INSERT INTO subscription_plans "
                "(name, slug, description, monthly_price_ugx, annual_price_ugx, "
                "monthly_price_usd_cents, annual_price_usd_cents, "
                "max_properties, max_units, max_users, max_storage_mb, "
                "features, trial_days, requires_custom_quote, is_active, is_publicly_visible, display_order) "
                "VALUES (:name,:slug,:desc,:mugx,:augx,:musd,:ausd,:mp,:mu,:muser,:ms,:feats,:trial,:rcq,true,true,:order) "
                "ON CONFLICT (slug) DO UPDATE SET "
                "  monthly_price_ugx=EXCLUDED.monthly_price_ugx, "
                "  annual_price_ugx=EXCLUDED.annual_price_ugx, "
                "  monthly_price_usd_cents=EXCLUDED.monthly_price_usd_cents, "
                "  annual_price_usd_cents=EXCLUDED.annual_price_usd_cents, "
                "  max_properties=EXCLUDED.max_properties, "
                "  max_units=EXCLUDED.max_units, max_users=EXCLUDED.max_users, "
                "  max_storage_mb=EXCLUDED.max_storage_mb, "
                "  requires_custom_quote=EXCLUDED.requires_custom_quote, "
                "  features=EXCLUDED.features::jsonb"
            ), {"name": name, "slug": slug, "desc": desc,
                "mugx": mugx, "augx": augx, "musd": musd, "ausd": ausd,
                "mp": mp, "mu": mu, "muser": muser, "ms": ms,
                "feats": feats, "trial": trial, "rcq": rcq, "order": order})

        # Seed billing system settings for tests
        _BILLING = [
            ("billing.vat_rate_percent", "18", "billing", "VAT Rate (%)", "number", False, True),
            ("billing.trial_days", "14", "billing", "Trial Period", "number", False, True),
            ("billing.grace_period_days", "7", "billing", "Grace Period", "number", False, True),
            ("billing.invoice_prefix", "CR-INV", "billing", "Invoice Prefix", "string", False, True),
            ("billing.bank.name", "Test Bank", "billing", "Bank Name", "string", False, False),
            ("billing.bank.account_name", "Test Account", "billing", "Account Name", "string", False, False),
            ("billing.bank.account_number", "1234567890", "billing", "Account Number", "string", False, False),
            ("billing.bank.branch", "Test Branch", "billing", "Branch", "string", False, False),
            ("billing.bank.swift_code", "TESTUGKX", "billing", "SWIFT", "string", False, False),
            ("billing.bank.sort_code", "", "billing", "Sort Code", "string", False, False),
            ("billing.mtn_momo.number", "+256700000000", "billing", "MTN Number", "string", False, False),
            ("billing.mtn_momo.name", "Test MTN", "billing", "MTN Name", "string", False, False),
            ("billing.airtel.number", "+256750000000", "billing", "Airtel Number", "string", False, False),
            ("billing.airtel.name", "Test Airtel", "billing", "Airtel Name", "string", False, False),
            ("billing.cash.instructions", "Pay at office.", "billing", "Cash Instructions", "text", False, False),
            # Exchange rate keys (seeded by migration 065; must exist for anonymous-flags tests)
            ("platform.ugx_usd_rate",         "3700", "platform", "UGX/USD Rate",        "integer", False, False),
            ("platform.ugx_usd_rate_updated", "",     "platform", "Rate Last Updated",    "string",  False, False),
        ]
        for key, value, category, label, value_type, is_secret, is_required in _BILLING:
            await conn.execute(sa.text(
                "INSERT INTO system_settings (key, value, category, label, description, value_type, is_secret, is_required) "
                "VALUES (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required) "
                "ON CONFLICT (key) DO NOTHING"
            ), {"key": key, "value": value, "category": category, "label": label,
                "description": "", "value_type": value_type,
                "is_secret": is_secret, "is_required": is_required})

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Each test gets its own transaction that is rolled back.
    This keeps tests isolated without recreating the schema.
    Uses AsyncSession directly (not async_sessionmaker) to avoid an implicit
    session.begin() conflicting with the connection-level BEGIN we issue here.
    """
    async with test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False, autoflush=False)
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


# ── Redis mock ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_redis():
    """
    Replace the Redis client with an async mock for all tests.
    Tests that specifically test Redis behaviour can override this fixture.
    """
    import json as _json
    from app.core.security import JWKS_CACHE_KEY

    # Pre-populate an empty JWKS so _fetch_jwks is never called during tests.
    # Malformed tokens will fail jwt.decode() (JWTError → 401) without needing Logto.
    fake_store: dict[str, Any] = {
        JWKS_CACHE_KEY: _json.dumps({"keys": []}),
    }

    async def fake_get(key: str):
        return fake_store.get(key)

    async def fake_setex(key: str, _ttl: int, value: str):
        fake_store[key] = value

    async def fake_ping():
        return True

    mock = AsyncMock()
    mock.get.side_effect = fake_get
    mock.setex.side_effect = fake_setex
    mock.ping.side_effect = fake_ping
    # `exists` must return a falsy int so is_session_stale() → False.
    # Without this, the default AsyncMock() return value is truthy, which makes
    # every request hit the "Session refresh required" 401 branch in deps.py.
    mock.exists = AsyncMock(return_value=0)
    mock.delete = AsyncMock(return_value=1)

    with patch("app.core.redis.get_redis", return_value=mock), \
         patch("app.core.security.get_redis", return_value=mock), \
         patch("app.api.v1.health.get_redis", return_value=mock):
        yield mock


# ── App + HTTP client ─────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client wired to the FastAPI app.

    - DB dependency is overridden to use the test session
    - ENVIRONMENT is forced to 'development' so X-Dev-User-Id works
    """
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Shared org fixture ────────────────────────────────────────────────────────

async def get_dev_org(db: AsyncSession):
    """Async helper (not a fixture) for fetching org_dev inside test methods.

    Use this instead of ``make_organisation(db, logto_org_id="org_dev")`` when
    you need to create test data in the dev-user org from within a test method
    body (not a fixture).  The org is pre-seeded at session scope so trying to
    INSERT it again causes a UniqueViolationError.

    Example::

        org = await get_dev_org(db_session)
        prop = await make_property(db_session, org)
    """
    from sqlalchemy import select
    from app.models.organisation import Organisation

    result = await db.execute(select(Organisation).where(Organisation.logto_org_id == "org_dev"))
    return result.scalar_one()


@pytest_asyncio.fixture
async def dev_org(db_session: AsyncSession):
    """Return the pre-seeded 'org_dev' Organisation that all dev JWT users belong to.

    All dev users (manager-1, owner-1, tenant-2 …) carry org_id="org_dev" in
    their token claims.  Test data must be created in this same org so that
    org-scoped API queries can find it.  Use this fixture (or delegate your
    local ``org`` fixture to it) instead of calling make_organisation() when
    your tests authenticate via the standard auth_headers() helpers.
    """
    from sqlalchemy import select
    from app.models.organisation import Organisation

    result = await db_session.execute(
        select(Organisation).where(Organisation.logto_org_id == "org_dev")
    )
    return result.scalar_one()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def auth_headers(user_id: str = "manager-1") -> dict[str, str]:
    """Return headers that activate the dev-user bypass for the given fixture user."""
    return {"X-Dev-User-Id": user_id}
