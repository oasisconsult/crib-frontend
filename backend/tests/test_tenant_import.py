"""
Tests for tenant bulk import (CSV).

Covers:
  - CSV parsing: valid rows, missing columns, bad dates, bad emails,
    duplicate emails in file, partial unit assignment
  - Preview: property/unit name resolution, email conflicts, occupied units
  - Commit: profile-only tenants, tenants with active leases, email dedup
  - RBAC: manager can import, tenant role is rejected
  - Template download
"""
from __future__ import annotations

import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import make_organisation, make_property, make_unit
from tests.conftest import auth_headers

# ── CSV helpers ────────────────────────────────────────────────────────────────

def _csv(*rows: tuple) -> bytes:
    """Build a minimal CSV bytes object from a header + data tuples."""
    header = "first_name,last_name,email,phone,national_id,date_of_birth,nationality,whatsapp_number,emergency_contact_name,emergency_contact_phone,property_name,unit_name,lease_start_date,lease_end_date,monthly_rent,currency,deposit_amount"
    lines = [header] + [",".join(str(c) for c in row) for row in rows]
    return "\n".join(lines).encode()


def _minimal_row(first="Jane", last="Doe", email="jane@example.com",
                 property_name="", unit_name="", **extra) -> tuple:
    """Return a fully populated row tuple for the default CSV header."""
    return (
        first, last, email,
        extra.get("phone", ""),
        extra.get("national_id", ""),
        extra.get("date_of_birth", ""),
        extra.get("nationality", ""),
        extra.get("whatsapp_number", ""),
        extra.get("ec_name", ""),
        extra.get("ec_phone", ""),
        property_name,
        unit_name,
        extra.get("lease_start_date", ""),
        extra.get("lease_end_date", ""),
        extra.get("monthly_rent", ""),
        extra.get("currency", "UGX"),
        extra.get("deposit_amount", ""),
    )


# ── Pure parsing tests (no DB) ─────────────────────────────────────────────────

class TestParseCSV:
    def test_valid_profile_only_row(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row())
        rows, errors = parse_csv(content)
        assert not errors
        assert len(rows) == 1
        r = rows[0]
        assert r.first_name == "Jane"
        assert r.last_name == "Doe"
        assert r.email == "jane@example.com"
        assert not r.has_unit

    def test_valid_row_with_unit(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(
            property_name="Block A", unit_name="Unit 1",
            lease_start_date="2024-01-01", monthly_rent="500000",
        ))
        rows, errors = parse_csv(content)
        assert not errors
        assert rows[0].has_unit
        assert rows[0].property_name == "Block A"
        assert rows[0].monthly_rent == 500000.0

    def test_missing_required_columns(self):
        from app.services.tenant_import_service import parse_csv
        content = b"first_name,last_name\nJane,Doe"
        rows, errors = parse_csv(content)
        assert rows == []
        assert any("email" in e.message for e in errors)

    def test_invalid_email(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(email="not-an-email"))
        rows, errors = parse_csv(content)
        assert rows == []
        assert any("Invalid email" in e.message for e in errors)

    def test_duplicate_email_in_file(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(
            _minimal_row(email="same@example.com"),
            _minimal_row(first="Other", last="Person", email="same@example.com"),
        )
        rows, errors = parse_csv(content)
        assert len(rows) == 1  # first accepted, second rejected
        assert any("Duplicate email" in e.message for e in errors)

    def test_partial_unit_assignment_property_only(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(property_name="Block A", unit_name=""))
        rows, errors = parse_csv(content)
        assert rows == []
        assert any("together" in e.message for e in errors)

    def test_partial_unit_assignment_unit_only(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(property_name="", unit_name="Unit 1"))
        rows, errors = parse_csv(content)
        assert rows == []
        assert any("together" in e.message for e in errors)

    def test_invalid_date_format(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(
            property_name="Block A", unit_name="Unit 1",
            lease_start_date="01/15/2024",  # wrong format
        ))
        rows, errors = parse_csv(content)
        assert rows == []
        assert any("YYYY-MM-DD" in e.message for e in errors)

    def test_invalid_monthly_rent(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(
            property_name="Block A", unit_name="Unit 1",
            monthly_rent="free",
        ))
        rows, errors = parse_csv(content)
        assert rows == []
        assert any("positive number" in e.message for e in errors)

    def test_empty_rows_are_skipped(self):
        from app.services.tenant_import_service import parse_csv
        content = b"first_name,last_name,email\n,,\nJane,Doe,jane@example.com"
        rows, errors = parse_csv(content)
        assert not errors
        assert len(rows) == 1

    def test_csv_injection_stripped(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(_minimal_row(first="=CMD('evil')", email="safe@example.com"))
        rows, errors = parse_csv(content)
        assert not errors
        assert not rows[0].first_name.startswith("=")

    def test_multiple_valid_rows(self):
        from app.services.tenant_import_service import parse_csv
        content = _csv(
            _minimal_row(email="a@example.com"),
            _minimal_row(first="Bob", last="Smith", email="b@example.com"),
            _minimal_row(first="Carol", last="Jones", email="c@example.com"),
        )
        rows, errors = parse_csv(content)
        assert not errors
        assert len(rows) == 3


# ── Preview tests (with DB) ────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestBuildPreview:
    async def test_profile_only_no_warnings(self, db_session: AsyncSession):
        from app.services.tenant_import_service import parse_csv, build_preview
        org = await make_organisation(db_session, logto_org_id="org_dev")
        content = _csv(_minimal_row())
        rows, _ = parse_csv(content)
        result = await build_preview(rows, [], db_session, org.id)
        assert result.is_valid
        assert result.total_tenants == 1
        assert result.profile_only == 1
        assert result.with_lease == 0
        assert not result.errors

    async def test_unit_resolved_correctly(self, db_session: AsyncSession):
        from app.services.tenant_import_service import parse_csv, build_preview
        org  = await make_organisation(db_session, logto_org_id="org_dev")
        prop = await make_property(db_session, org, name="Block A")
        unit = await make_unit(db_session, prop, name="Unit 1", monthly_rent=500000)
        content = _csv(_minimal_row(
            property_name="Block A", unit_name="Unit 1",
            lease_start_date="2024-01-01",
        ))
        rows, _ = parse_csv(content)
        result = await build_preview(rows, [], db_session, org.id)
        assert result.is_valid
        assert result.with_lease == 1
        assert result.tenants[0].mode == "with_lease"
        assert result.tenants[0].monthly_rent == 500000.0

    async def test_property_not_found_downgrades_to_profile_only(self, db_session: AsyncSession):
        from app.services.tenant_import_service import parse_csv, build_preview
        org = await make_organisation(db_session, logto_org_id="org_dev")
        content = _csv(_minimal_row(
            property_name="Nonexistent Property", unit_name="Unit 1",
        ))
        rows, _ = parse_csv(content)
        result = await build_preview(rows, [], db_session, org.id)
        assert result.is_valid  # warnings don't make it invalid
        assert result.tenants[0].mode == "profile_only"
        assert any("not found" in w.message for w in result.warnings)

    async def test_occupied_unit_downgrades_to_profile_only(self, db_session: AsyncSession):
        from app.services.tenant_import_service import parse_csv, build_preview
        from app.models.property import UnitStatus
        org  = await make_organisation(db_session, logto_org_id="org_dev")
        prop = await make_property(db_session, org, name="Block A")
        unit = await make_unit(db_session, prop, name="Unit 1",
                               status=UnitStatus.occupied, monthly_rent=500000)
        content = _csv(_minimal_row(property_name="Block A", unit_name="Unit 1"))
        rows, _ = parse_csv(content)
        result = await build_preview(rows, [], db_session, org.id)
        assert result.tenants[0].mode == "profile_only"
        assert any("occupied" in w.message for w in result.warnings)

    async def test_existing_email_generates_warning(self, db_session: AsyncSession):
        from app.services.tenant_import_service import parse_csv, build_preview
        from tests.factories import make_tenant
        org = await make_organisation(db_session, logto_org_id="org_dev")
        await make_tenant(db_session, org, email="existing@example.com")
        content = _csv(_minimal_row(email="existing@example.com"))
        rows, _ = parse_csv(content)
        result = await build_preview(rows, [], db_session, org.id)
        assert result.is_valid
        assert any("already exists" in w.message for w in result.warnings)

    async def test_parse_errors_short_circuit_preview(self, db_session: AsyncSession):
        from app.services.tenant_import_service import TenantImportError, build_preview
        org = await make_organisation(db_session, logto_org_id="org_dev")
        errors = [TenantImportError(row=2, column="email", message="bad")]
        result = await build_preview([], errors, db_session, org.id)
        assert not result.is_valid
        assert len(result.errors) == 1


# ── Commit tests (with DB) ─────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestCommitImport:
    async def _make_profile(self, db_session: AsyncSession, org_id):
        """Create a manager profile linked to the test org."""
        from app.models.profile import Profile
        profile = Profile(
            logto_sub="dev_manager1",
            organisation_id=org_id,
            role="manager",
            display_name="Test Manager",
            email="manager@test.local",
        )
        db_session.add(profile)
        await db_session.flush()
        return profile

    async def test_commit_profile_only_creates_tenant_and_invite(
        self, db_session: AsyncSession
    ):
        from sqlalchemy import select
        from app.models.tenant import Tenant, TenantInvite, OnboardingState, TenantStatus
        from app.services.tenant_import_service import parse_csv, commit_import

        org     = await make_organisation(db_session, logto_org_id="org_dev")
        profile = await self._make_profile(db_session, org.id)

        content = _csv(_minimal_row(email="new@example.com"))
        rows, _ = parse_csv(content)

        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as mock_logto:
            mock_logto.return_value = None
            result = await commit_import(rows=rows, db=db_session, profile=profile)

        assert result.imported_tenants == 1
        assert result.profile_only == 1
        assert result.with_lease == 0

        tenant = await db_session.scalar(
            select(Tenant).where(Tenant.email == "new@example.com")
        )
        assert tenant is not None
        assert tenant.status == TenantStatus.inactive
        assert tenant.onboarding_state == OnboardingState.invited

        invite = await db_session.scalar(
            select(TenantInvite).where(TenantInvite.tenant_id == tenant.id)
        )
        assert invite is not None
        assert invite.token is not None

    async def test_commit_with_unit_creates_active_lease(
        self, db_session: AsyncSession
    ):
        from sqlalchemy import select
        from app.models.tenant import Tenant, OnboardingState, TenantStatus
        from app.models.lease import Lease, LeaseStatus
        from app.models.property import UnitStatus
        from app.services.tenant_import_service import parse_csv, commit_import

        org     = await make_organisation(db_session, logto_org_id="org_logto_test")
        prop    = await make_property(db_session, org, name="Naguru View")
        unit    = await make_unit(db_session, prop, name="Unit 5", monthly_rent=600000)
        profile = await self._make_profile(db_session, org.id)

        content = _csv(_minimal_row(
            email="active@example.com",
            property_name="Naguru View", unit_name="Unit 5",
            lease_start_date="2024-01-01", monthly_rent="600000",
        ))
        rows, _ = parse_csv(content)

        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as mock_logto:
            mock_logto.return_value = "logto_abc123"
            result = await commit_import(rows=rows, db=db_session, profile=profile)

        assert result.imported_tenants == 1
        assert result.with_lease == 1

        tenant = await db_session.scalar(
            select(Tenant).where(Tenant.email == "active@example.com")
        )
        assert tenant.status == TenantStatus.active
        assert tenant.onboarding_state == OnboardingState.activated
        assert tenant.current_unit_id == unit.id
        assert tenant.logto_user_id == "logto_abc123"

        lease = await db_session.scalar(
            select(Lease).where(Lease.tenant_id == tenant.id)
        )
        assert lease is not None
        assert lease.status == LeaseStatus.active
        assert lease.monthly_rent == 600000.0

        await db_session.refresh(unit)
        assert unit.status == UnitStatus.occupied
        assert unit.current_tenant_id == tenant.id

    async def test_commit_skips_existing_email(self, db_session: AsyncSession):
        from tests.factories import make_tenant
        from app.services.tenant_import_service import parse_csv, commit_import

        org     = await make_organisation(db_session, logto_org_id="org_dev")
        await make_tenant(db_session, org, email="existing@example.com")
        profile = await self._make_profile(db_session, org.id)

        content = _csv(_minimal_row(email="existing@example.com"))
        rows, _ = parse_csv(content)

        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock):
            result = await commit_import(rows=rows, db=db_session, profile=profile)

        assert result.imported_tenants == 0
        assert result.skipped_tenants == 1
        assert any("already exists" in w.message for w in result.warnings)

    async def test_commit_prevents_double_unit_assignment_in_batch(
        self, db_session: AsyncSession
    ):
        """Two rows in the same file cannot be assigned to the same unit."""
        from sqlalchemy import select
        from app.models.lease import Lease
        from app.services.tenant_import_service import parse_csv, commit_import

        org     = await make_organisation(db_session, logto_org_id="org_dev")
        prop    = await make_property(db_session, org, name="Block C")
        unit    = await make_unit(db_session, prop, name="Unit 9", monthly_rent=400000)
        profile = await self._make_profile(db_session, org.id)

        content = _csv(
            _minimal_row(email="t1@example.com", property_name="Block C", unit_name="Unit 9"),
            _minimal_row(first="Bob", last="B", email="t2@example.com",
                         property_name="Block C", unit_name="Unit 9"),
        )
        rows, _ = parse_csv(content)

        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
            m.return_value = None
            result = await commit_import(rows=rows, db=db_session, profile=profile)

        # Both tenants imported, but second gets profile-only (unit claimed)
        assert result.imported_tenants == 2
        assert result.with_lease == 1
        assert result.profile_only == 1
        # Unit is marked occupied after the first assignment, so the second tenant
        # hits either the "occupied" or "already assigned" guard — both are correct.
        assert any(
            ("occupied" in w.message or "already assigned" in w.message)
            for w in result.warnings
        )

    async def test_commit_uses_unit_rent_when_not_provided(
        self, db_session: AsyncSession
    ):
        from sqlalchemy import select
        from app.models.lease import Lease
        from app.services.tenant_import_service import parse_csv, commit_import

        org     = await make_organisation(db_session, logto_org_id="org_dev")
        prop    = await make_property(db_session, org, name="Block D")
        unit    = await make_unit(db_session, prop, name="Unit 10", monthly_rent=750000)
        profile = await self._make_profile(db_session, org.id)

        content = _csv(_minimal_row(
            email="rent@example.com",
            property_name="Block D", unit_name="Unit 10",
            monthly_rent="",  # not provided — should use unit's rent
        ))
        rows, _ = parse_csv(content)

        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
            m.return_value = None
            result = await commit_import(rows=rows, db=db_session, profile=profile)

        assert result.with_lease == 1
        from app.models.tenant import Tenant
        tenant = await db_session.scalar(
            select(Tenant).where(Tenant.email == "rent@example.com")
        )
        lease = await db_session.scalar(
            select(Lease).where(Lease.tenant_id == tenant.id)
        )
        assert lease.monthly_rent == 750000.0


# ── API endpoint tests ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestTenantImportAPI:
    async def test_download_template(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/tenants/import/template",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert "first_name" in resp.text
        assert "property_name" in resp.text

    async def test_preview_valid_csv(self, client: AsyncClient, db_session: AsyncSession):
        org = await make_organisation(db_session, logto_org_id="org_dev")
        content = _csv(_minimal_row())
        resp = await client.post(
            "/api/v1/tenants/import/preview",
            headers=auth_headers("manager-1"),
            files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["isValid"] is True
        assert body["totalTenants"] == 1

    async def test_preview_rejects_non_csv(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/tenants/import/preview",
            headers=auth_headers("manager-1"),
            files={"file": ("tenants.xlsx", io.BytesIO(b"data"), "application/vnd.ms-excel")},
        )
        assert resp.status_code == 415

    async def test_preview_returns_errors_for_bad_csv(self, client: AsyncClient):
        content = b"first_name,last_name\nJane,Doe"  # missing email column
        resp = await client.post(
            "/api/v1/tenants/import/preview",
            headers=auth_headers("manager-1"),
            files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["isValid"] is False
        assert len(body["errors"]) > 0

    async def test_commit_valid_csv(self, client: AsyncClient, db_session: AsyncSession):
        org = await make_organisation(db_session, logto_org_id="org_dev")
        content = _csv(_minimal_row(email="commit_test@example.com"))
        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
            m.return_value = None
            resp = await client.post(
                "/api/v1/tenants/import/commit",
                headers=auth_headers("manager-1"),
                files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
            )
        assert resp.status_code == 201
        body = resp.json()
        assert body["importedTenants"] == 1

    async def test_commit_rejects_bad_csv(self, client: AsyncClient):
        content = b"first_name,last_name\nJane,Doe"
        resp = await client.post(
            "/api/v1/tenants/import/commit",
            headers=auth_headers("manager-1"),
            files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 422

    async def test_tenant_role_forbidden(self, client: AsyncClient):
        content = _csv(_minimal_row())
        for endpoint in ("/api/v1/tenants/import/preview", "/api/v1/tenants/import/commit"):
            resp = await client.post(
                endpoint,
                headers=auth_headers("tenant-1"),
                files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
            )
            assert resp.status_code == 403, f"Expected 403 on {endpoint}"

    async def test_landlord_role_forbidden(self, client: AsyncClient):
        content = _csv(_minimal_row())
        resp = await client.post(
            "/api/v1/tenants/import/preview",
            headers=auth_headers("landlord-1"),
            files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 403

    async def test_owner_can_import(self, client: AsyncClient, db_session: AsyncSession):
        org = await make_organisation(db_session, logto_org_id="org_dev")
        content = _csv(_minimal_row(email="owner_import@example.com"))
        with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
            m.return_value = None
            resp = await client.post(
                "/api/v1/tenants/import/commit",
                headers=auth_headers("owner-1"),
                files={"file": ("tenants.csv", io.BytesIO(content), "text/csv")},
            )
        assert resp.status_code == 201
