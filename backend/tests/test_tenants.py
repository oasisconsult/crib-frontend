"""
Tests for /api/v1/tenants — Sprint 3.

Coverage:
  - List tenants (empty, filtered by search / onboarding state)
  - Invite → creates Tenant + TenantInvite
  - Onboarding token flow: GET token → state becomes started
  - Submit onboarding → state becomes submitted
  - Approve → state becomes approved, status becomes active
  - Reject → state becomes rejected with reason
  - Invalid state-machine transitions → 422
  - Update tenant (PUT)
  - Delete tenant
  - Documents: list, upload, verify toggle, delete
  - GDPR anonymise: PII wiped, row retained
  - Org isolation: cross-org access → 404
  - Tenant role cannot write
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import IdDocumentType, OnboardingState, Tenant, TenantDocument, TenantInvite
from tests.conftest import auth_headers
from tests.factories import make_organisation, make_property, make_tenant


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def professional_plan(db_session):
    """Upgrade dev org to professional so document_storage and other features are available."""
    import sqlalchemy as _sa
    await db_session.execute(_sa.text("""
        INSERT INTO organisation_subscriptions
            (organisation_id, plan_id, status, billing_cycle, currency, current_period_start, auto_renew)
        SELECT o.id, sp.id, 'active', 'none', 'UGX', now(), true
        FROM organisations o, subscription_plans sp
        WHERE o.logto_org_id = 'org_dev' AND sp.slug = 'professional'
        ON CONFLICT (organisation_id) DO UPDATE
            SET plan_id = EXCLUDED.plan_id, status = 'active'
    """))
    await db_session.flush()


@pytest.fixture
async def org(dev_org):
    """Organisation linked to the dev manager-1 user (pre-seeded org_dev)."""
    return dev_org


@pytest.fixture
async def other_org(db_session):
    """A second organisation that manager-1 does NOT belong to."""
    return await make_organisation(db_session)


@pytest.fixture
async def prop(db_session, org):
    return await make_property(db_session, org)


@pytest.fixture
async def tenant(db_session, org):
    return await make_tenant(db_session, org, first_name="Alice", last_name="Nakato",
                             email="alice@example.com")


@pytest.fixture
async def submitted_tenant(db_session, org):
    return await make_tenant(
        db_session, org,
        first_name="Bob", last_name="Ssemwanga",
        email="bob@example.com",
        onboarding_state=OnboardingState.submitted,
    )


# ── List ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_tenants_empty(client: AsyncClient, org):
    resp = await client.get("/api/v1/tenants", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_tenants_returns_own_org(client: AsyncClient, tenant, other_org, db_session):
    other = await make_tenant(db_session, other_org, email="other@example.com")
    resp = await client.get("/api/v1/tenants", headers=auth_headers("manager-1"))
    ids = [t["id"] for t in resp.json()["data"]]
    assert str(tenant.id) in ids
    assert str(other.id) not in ids


@pytest.mark.asyncio
async def test_list_tenants_search(client: AsyncClient, db_session, org):
    await make_tenant(db_session, org, first_name="Zara", email="zara@example.com")
    await make_tenant(db_session, org, first_name="Mark", email="mark@example.com")
    resp = await client.get("/api/v1/tenants?search=Zara", headers=auth_headers("manager-1"))
    names = [t["firstName"] for t in resp.json()["data"]]
    assert "Zara" in names
    assert "Mark" not in names


@pytest.mark.asyncio
async def test_list_tenants_filter_by_state(client: AsyncClient, tenant, submitted_tenant):
    resp = await client.get(
        "/api/v1/tenants?onboardingState=submitted",
        headers=auth_headers("manager-1"),
    )
    ids = [t["id"] for t in resp.json()["data"]]
    assert str(submitted_tenant.id) in ids
    assert str(tenant.id) not in ids


# ── Invite ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invite_creates_tenant_and_invite(client: AsyncClient, org, prop, db_session):
    resp = await client.post(
        "/api/v1/tenants/invite",
        headers=auth_headers("manager-1"),
        json={"email": "new@example.com", "name": "New Tenant", "propertyId": str(prop.id)},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@example.com"
    assert body["status"] == "pending"
    assert "token" in body

    # Tenant row was created
    result = await db_session.execute(
        select(Tenant).where(Tenant.email == "new@example.com")
    )
    t = result.scalar_one_or_none()
    assert t is not None
    assert t.onboarding_state == OnboardingState.invited


# ── Onboarding token flow ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_onboarding_transitions_to_started(client: AsyncClient, db_session, org):
    import secrets
    token = secrets.token_urlsafe(48)
    t = await make_tenant(db_session, org, onboarding_token=token,
                          onboarding_state=OnboardingState.invited)
    from app.models.tenant import InviteStatus, TenantInvite
    from datetime import datetime, timedelta, timezone
    invite = TenantInvite(
        tenant_id=t.id, organisation_id=org.id, email=t.email, name="Test",
        token=token, status=InviteStatus.pending,
        sent_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
    )
    db_session.add(invite)
    await db_session.flush()

    resp = await client.get(f"/api/v1/tenants/onboarding/{token}")
    assert resp.status_code == 200
    assert resp.json()["tenant"]["onboardingState"] == "started"


@pytest.mark.asyncio
async def test_submit_onboarding(client: AsyncClient, db_session, org):
    import secrets
    from datetime import datetime, timedelta, timezone
    from app.models.tenant import InviteStatus, TenantInvite
    token = secrets.token_urlsafe(48)
    t = await make_tenant(db_session, org, onboarding_token=token,
                          onboarding_state=OnboardingState.started)
    invite = TenantInvite(
        tenant_id=t.id, organisation_id=org.id, email=t.email, name="Test",
        token=token, status=InviteStatus.pending,
        sent_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
    )
    db_session.add(invite)
    await db_session.flush()

    resp = await client.post(
        f"/api/v1/tenants/onboarding/{token}/submit",
        json={
            "firstName": "Alice", "lastName": "Nakato",
            "email": "alice@example.com", "phone": "+256700111222",
            "gdprConsent": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["onboardingState"] == "submitted"
    assert body["gdprConsentAt"] is not None


# ── Approve / Reject ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approve_tenant(client: AsyncClient, submitted_tenant):
    resp = await client.patch(
        f"/api/v1/tenants/{submitted_tenant.id}/approve",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["onboardingState"] == "approved"
    assert body["status"] == "active"


@pytest.mark.asyncio
async def test_reject_tenant(client: AsyncClient, submitted_tenant):
    resp = await client.patch(
        f"/api/v1/tenants/{submitted_tenant.id}/reject",
        headers=auth_headers("manager-1"),
        json={"reason": "Insufficient income documentation"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["onboardingState"] == "rejected"
    assert body["rejectionReason"] == "Insufficient income documentation"


@pytest.mark.asyncio
async def test_invalid_state_transition_returns_422(client: AsyncClient, tenant):
    """Approving an 'invited' tenant (not yet submitted) must fail with 422."""
    resp = await client.patch(
        f"/api/v1/tenants/{tenant.id}/approve",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 422


# ── Update / Delete ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_tenant(client: AsyncClient, tenant):
    resp = await client.put(
        f"/api/v1/tenants/{tenant.id}",
        headers=auth_headers("manager-1"),
        json={"phone": "+256700999888", "tags": ["vip", "long-term"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == "+256700999888"
    assert "vip" in body["tags"]


@pytest.mark.asyncio
async def test_delete_tenant(client: AsyncClient, tenant):
    resp = await client.delete(
        f"/api/v1/tenants/{tenant.id}",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 204
    get = await client.get(
        f"/api/v1/tenants/{tenant.id}", headers=auth_headers("manager-1")
    )
    assert get.status_code == 404


# ── Documents ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_and_list_document(client: AsyncClient, tenant):
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/documents",
        headers=auth_headers("manager-1"),
        json={
            "type": "national_id",
            "name": "National ID",
            "url": "https://minio.local/bucket/id.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": 102400,
        },
    )
    assert resp.status_code == 201
    doc_id = resp.json()["id"]
    assert resp.json()["verified"] is False

    list_resp = await client.get(
        f"/api/v1/tenants/{tenant.id}/documents",
        headers=auth_headers("manager-1"),
    )
    assert list_resp.status_code == 200
    assert any(d["id"] == doc_id for d in list_resp.json())


@pytest.mark.asyncio
async def test_verify_document_toggles(client: AsyncClient, tenant, db_session):
    from datetime import datetime, timezone
    doc = TenantDocument(
        tenant_id=tenant.id, type="passport", name="Passport",
        url="https://example.com/p.pdf", mime_type="application/pdf",
        size_bytes=50000, verified=False,
        uploaded_at=datetime.now(timezone.utc),
    )
    db_session.add(doc)
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/tenants/{tenant.id}/documents/{doc.id}/verify",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["verified"] is True

    # Toggle back
    resp2 = await client.patch(
        f"/api/v1/tenants/{tenant.id}/documents/{doc.id}/verify",
        headers=auth_headers("manager-1"),
    )
    assert resp2.json()["verified"] is False


@pytest.mark.asyncio
async def test_delete_document(client: AsyncClient, tenant, db_session):
    from datetime import datetime, timezone
    doc = TenantDocument(
        tenant_id=tenant.id, type="other", name="Misc",
        url="https://example.com/misc.pdf", mime_type="application/pdf",
        size_bytes=1000, verified=False,
        uploaded_at=datetime.now(timezone.utc),
    )
    db_session.add(doc)
    await db_session.flush()

    resp = await client.delete(
        f"/api/v1/tenants/{tenant.id}/documents/{doc.id}",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 204


# ── GDPR anonymise ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_anonymise_wipes_pii(client: AsyncClient, tenant, db_session):
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/anonymise",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 204

    await db_session.refresh(tenant)
    assert tenant.first_name == "Anonymised"
    assert "deleted.invalid" in tenant.email
    assert tenant.phone is None
    assert tenant.anonymised_at is not None


@pytest.mark.asyncio
async def test_anonymise_row_still_exists(client: AsyncClient, tenant, db_session):
    """Row must be retained after anonymisation — only PII is cleared."""
    await client.post(
        f"/api/v1/tenants/{tenant.id}/anonymise",
        headers=auth_headers("manager-1"),
    )
    result = await db_session.execute(select(Tenant).where(Tenant.id == tenant.id))
    assert result.scalar_one_or_none() is not None


# ── Org isolation ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cross_org_tenant_returns_404(client: AsyncClient, org, other_org, db_session):
    other = await make_tenant(db_session, other_org, email="cross@example.com")
    resp = await client.get(
        f"/api/v1/tenants/{other.id}", headers=auth_headers("manager-1")
    )
    assert resp.status_code == 404


# ── RBAC ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_role_cannot_delete(client: AsyncClient, org, tenant):
    resp = await client.delete(
        f"/api/v1/tenants/{tenant.id}", headers=auth_headers("tenant-1")
    )
    assert resp.status_code == 403


# ── Tenant document ownership (Step 2) ───────────────────────────────────────
#
# Each test needs a Tenant whose profile.tenant_id is wired to a dev user.
# We:
#   1. Create a Tenant row in org_dev.
#   2. Hit GET /me as the dev user to trigger _upsert_profile.
#   3. Set profile.tenant_id = tenant.id directly in the DB.
#
# This mirrors how a real tenant gets their profile linked during onboarding.

from datetime import datetime, timezone as _tz

from app.models.profile import Profile
from sqlalchemy import select as _select


async def _link_tenant_to_profile(db: AsyncSession, dev_user_sub: str, tenant):
    """Bootstrap the profile row (via /me) then link tenant_id."""
    result = await db.execute(
        _select(Profile).where(Profile.logto_sub == dev_user_sub)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise RuntimeError(f"Profile for {dev_user_sub} not found — call GET /me first")
    profile.tenant_id = tenant.id
    await db.flush()
    return profile


@pytest.fixture
async def owned_tenant(client: AsyncClient, db_session: AsyncSession, org):
    """A Tenant row in org_dev whose profile is linked to the tenant-1 dev user."""
    t = await make_tenant(db_session, org, first_name="Own", last_name="Tenant",
                          email="own@test.ug")
    # Bootstrap the profile row
    await client.get("/api/v1/me", headers=auth_headers("tenant-1"))
    await _link_tenant_to_profile(db_session, "dev_tenant1", t)
    return t


@pytest.fixture
async def other_tenant(db_session: AsyncSession, org):
    """A second Tenant in the same org — not linked to tenant-1."""
    return await make_tenant(db_session, org, first_name="Other", last_name="Tenant",
                             email="other@test.ug")


async def _seed_doc(db_session: AsyncSession, tenant):
    doc = TenantDocument(
        tenant_id=tenant.id, type=IdDocumentType.passport, name="passport.pdf",
        url="https://minio.local/bucket/passport.pdf",
        mime_type="application/pdf", size_bytes=50000,
        verified=False, uploaded_at=datetime.now(_tz.utc),
    )
    db_session.add(doc)
    await db_session.flush()
    return doc


# ── Own-tenant list ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_can_list_own_documents(
    client: AsyncClient, db_session: AsyncSession, owned_tenant
):
    """A tenant can list documents for their own tenant record."""
    doc = await _seed_doc(db_session, owned_tenant)
    resp = await client.get(
        f"/api/v1/tenants/{owned_tenant.id}/documents",
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 200
    assert any(d["id"] == str(doc.id) for d in resp.json())


@pytest.mark.asyncio
async def test_tenant_cannot_list_other_tenant_documents(
    client: AsyncClient, db_session: AsyncSession, other_tenant
):
    """A tenant must not be able to read documents belonging to another tenant."""
    await _seed_doc(db_session, other_tenant)
    resp = await client.get(
        f"/api/v1/tenants/{other_tenant.id}/documents",
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 403


# ── Own-tenant upload ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_can_upload_own_document(
    client: AsyncClient, owned_tenant
):
    """A tenant can POST a document to their own tenant record."""
    resp = await client.post(
        f"/api/v1/tenants/{owned_tenant.id}/documents",
        headers=auth_headers("tenant-1"),
        json={
            "type": "national_id",
            "name": "My National ID",
            "url": "https://minio.local/bucket/nid.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": 102400,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["type"] == "national_id"
    assert resp.json()["verified"] is False


@pytest.mark.asyncio
async def test_tenant_cannot_upload_to_other_tenant(
    client: AsyncClient, other_tenant
):
    """A tenant must not be able to upload documents to another tenant's record."""
    resp = await client.post(
        f"/api/v1/tenants/{other_tenant.id}/documents",
        headers=auth_headers("tenant-1"),
        json={
            "type": "passport",
            "name": "Other Passport",
            "url": "https://minio.local/bucket/other.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": 50000,
        },
    )
    assert resp.status_code == 403


# ── Own-tenant delete ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_can_delete_own_document(
    client: AsyncClient, db_session: AsyncSession, owned_tenant
):
    """A tenant can delete a document from their own record."""
    doc = await _seed_doc(db_session, owned_tenant)
    resp = await client.delete(
        f"/api/v1/tenants/{owned_tenant.id}/documents/{doc.id}",
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_tenant_cannot_delete_other_tenant_document(
    client: AsyncClient, db_session: AsyncSession, other_tenant
):
    """A tenant must not be able to delete another tenant's document."""
    doc = await _seed_doc(db_session, other_tenant)
    resp = await client.delete(
        f"/api/v1/tenants/{other_tenant.id}/documents/{doc.id}",
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 403


# ── Verify stays manager-only ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_cannot_verify_document(
    client: AsyncClient, db_session: AsyncSession, owned_tenant
):
    """PATCH /verify must remain manager-only even for the tenant's own record."""
    doc = await _seed_doc(db_session, owned_tenant)
    resp = await client.patch(
        f"/api/v1/tenants/{owned_tenant.id}/documents/{doc.id}/verify",
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 403


# ── Presign tenant-document endpoint ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_presign_tenant_document_accessible_to_tenant(client: AsyncClient):
    """POST /upload/presign/tenant-document should succeed for a tenant-role user."""
    resp = await client.post(
        "/api/v1/upload/presign/tenant-document",
        headers=auth_headers("tenant-1"),
        json={"filename": "id_scan.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "uploadUrl" in body
    assert "publicUrl" in body
    # Category is forced to 'document' by the endpoint — key path must reflect this
    assert "document" in body["publicUrl"].lower() or "document" in body["key"].lower()


@pytest.mark.asyncio
async def test_main_presign_blocks_tenant(client: AsyncClient):
    """POST /upload/presign (staff endpoint) must reject tenant-role users."""
    resp = await client.post(
        "/api/v1/upload/presign",
        headers=auth_headers("tenant-1"),
        json={"filename": "id.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    assert resp.status_code == 403
