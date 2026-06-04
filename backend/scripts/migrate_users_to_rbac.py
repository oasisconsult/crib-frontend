"""
Crib — User role migration to RBAC DB.

Reads all users from the Logto Management API, extracts their current Crib
roles (superadmin, owner, caretaker, landlord, tenant, etc.), and seeds
corresponding rows in rbac_platform_users and rbac_user_roles in the shared
RBAC database.

Safe to run multiple times — all inserts use ON CONFLICT DO NOTHING.

Usage:
    source .env.staging
    python scripts/migrate_users_to_rbac.py

    # Dry run (no DB writes):
    DRY_RUN=true python scripts/migrate_users_to_rbac.py

Required env vars:
    RBAC_DATABASE_URL              — postgresql+asyncpg://user:pass@host/rbac
    LOGTO_ADMIN_CLIENT_ID          — M2M client with Management API access
    LOGTO_ADMIN_CLIENT_SECRET
    LOGTO_ENDPOINT                 — http://logto:3001 (internal) or https://auth.crib...
    LOGTO_ADMIN_API_RESOURCE       — https://default.logto.app/api
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("crib.migrate_users_to_rbac")

# ── Configuration ──────────────────────────────────────────────────────────────

RBAC_DATABASE_URL     = os.environ["RBAC_DATABASE_URL"]
LOGTO_CLIENT_ID       = os.environ["LOGTO_ADMIN_CLIENT_ID"]
LOGTO_CLIENT_SECRET   = os.environ["LOGTO_ADMIN_CLIENT_SECRET"]

LOGTO_ENDPOINT        = os.environ.get("LOGTO_ENDPOINT", "http://logto:3001").rstrip("/")
LOGTO_API_RESOURCE    = os.environ.get("LOGTO_ADMIN_API_RESOURCE", "https://default.logto.app/api")

TOKEN_ENDPOINT        = f"{LOGTO_ENDPOINT}/oidc/token"
LOGTO_API_URL         = f"{LOGTO_ENDPOINT}/api"

APP_SLUG              = "crib"
DRY_RUN               = os.environ.get("DRY_RUN", "false").lower() == "true"

# Map Logto role names → RBAC role names (if they differ)
ROLE_NAME_MAP: dict[str, str] = {
    # Crib Logto roles match RBAC names exactly — no mapping needed
    # Add overrides here if Logto uses different names, e.g.:
    # "crib_owner": "owner",
}


# ── Logto Management API helpers ───────────────────────────────────────────────

async def get_admin_token(client: httpx.AsyncClient) -> str:
    logger.info("Getting Logto admin token...")
    resp = await client.post(
        TOKEN_ENDPOINT,
        data={
            "grant_type":    "client_credentials",
            "client_id":     LOGTO_CLIENT_ID,
            "client_secret": LOGTO_CLIENT_SECRET,
            "resource":      LOGTO_API_RESOURCE,
            "scope":         "all",
        },
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    logger.info("Token acquired.")
    return token


async def fetch_all_users(token: str, client: httpx.AsyncClient) -> list[dict]:
    logger.info("Fetching all users from Logto...")
    users: list[dict] = []
    page = 1
    while True:
        resp = await client.get(
            f"{LOGTO_API_URL}/users",
            params={"page": page, "pageSize": 100},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        users.extend(batch)
        logger.info("  Fetched page %d — %d users so far", page, len(users))
        if len(batch) < 100:
            break
        page += 1
    logger.info("Total users: %d", len(users))
    return users


async def get_user_roles(token: str, logto_user_id: str, client: httpx.AsyncClient) -> list[str]:
    resp = await client.get(
        f"{LOGTO_API_URL}/users/{logto_user_id}/roles",
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return [r["name"] for r in resp.json()]


# ── RBAC DB helpers ────────────────────────────────────────────────────────────

async def get_app_id(session: AsyncSession) -> str:
    row = await session.execute(
        text("SELECT id FROM rbac_apps WHERE slug = :slug"),
        {"slug": APP_SLUG},
    )
    app_id = row.scalar()
    if not app_id:
        raise RuntimeError(
            f"App '{APP_SLUG}' not found in rbac_apps. "
            "Run bootstrap first: set RBAC_DATABASE_URL and start the Crib API."
        )
    return str(app_id)


async def upsert_platform_user(session: AsyncSession, logto_sub: str, email: Optional[str]) -> str:
    await session.execute(text("""
        INSERT INTO rbac_platform_users (logto_sub, email)
        VALUES (:sub, :email)
        ON CONFLICT (logto_sub) DO UPDATE SET email = EXCLUDED.email
    """), {"sub": logto_sub, "email": email})
    row = await session.execute(
        text("SELECT id FROM rbac_platform_users WHERE logto_sub = :sub"),
        {"sub": logto_sub},
    )
    return str(row.scalar())


async def assign_role(
    session: AsyncSession,
    user_id: str,
    role_id: str,
    app_id: str,
) -> bool:
    already = await session.scalar(text("""
        SELECT 1 FROM rbac_user_roles
        WHERE user_id = :user_id AND role_id = :role_id AND app_id = :app_id
    """), {"user_id": user_id, "role_id": role_id, "app_id": app_id})
    if already:
        return False
    await session.execute(text("""
        INSERT INTO rbac_user_roles (user_id, role_id, app_id, org_id, is_active)
        VALUES (:user_id, :role_id, :app_id, NULL, TRUE)
    """), {"user_id": user_id, "role_id": role_id, "app_id": app_id})
    return True


# ── Main ───────────────────────────────────────────────────────────────────────

async def run() -> None:
    logger.info("=" * 60)
    logger.info("Crib RBAC User Migration")
    logger.info("App slug : %s", APP_SLUG)
    logger.info("Dry run  : %s", DRY_RUN)
    logger.info("=" * 60)

    engine  = create_async_engine(RBAC_DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with httpx.AsyncClient(timeout=30) as http:
        token = await get_admin_token(http)
        users = await fetch_all_users(token, http)

        async with factory() as session:
            app_id = await get_app_id(session)
            logger.info("App ID: %s", app_id)

            stats = {"processed": 0, "assigned": 0, "no_roles": 0, "skipped": 0}

            for user in users:
                logto_sub  = user["id"]
                email      = user.get("primaryEmail") or user.get("username")
                short_id   = logto_sub[:8]

                logto_roles = await get_user_roles(token, logto_sub, http)
                stats["processed"] += 1

                if not logto_roles:
                    logger.info("  ⏭  %s (%s) — no roles", short_id, email)
                    stats["no_roles"] += 1
                    continue

                if DRY_RUN:
                    logger.info("  [DRY] %s (%s) → %s", short_id, email, logto_roles)
                    continue

                user_id = await upsert_platform_user(session, logto_sub, email)

                for role_name in logto_roles:
                    # Apply name mapping
                    mapped = ROLE_NAME_MAP.get(role_name, role_name).lower()

                    role_row = await session.execute(
                        text("SELECT id FROM rbac_roles WHERE app_id = :app_id AND name = :name"),
                        {"app_id": app_id, "name": mapped},
                    )
                    role_id = role_row.scalar()

                    if not role_id:
                        logger.warning("  Role '%s' not found in rbac_roles for app '%s' — skipping", role_name, APP_SLUG)
                        stats["skipped"] += 1
                        continue

                    inserted = await assign_role(session, user_id, str(role_id), app_id)
                    if inserted:
                        logger.info("  ✅ %s (%s) → %s", short_id, email, mapped)
                        stats["assigned"] += 1
                    else:
                        logger.info("  ✓  %s (%s) → %s (already exists)", short_id, email, mapped)

            if not DRY_RUN:
                await session.commit()

    await engine.dispose()

    logger.info("")
    logger.info("=" * 60)
    logger.info("Migration complete")
    logger.info("  Users processed : %d", stats["processed"])
    logger.info("  Roles assigned  : %d", stats["assigned"])
    logger.info("  No roles        : %d", stats["no_roles"])
    logger.info("  Skipped         : %d", stats["skipped"])
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(run())
