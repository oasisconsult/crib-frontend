"""
Alembic migration environment.

Supports both offline (SQL script) and online (direct async connection) modes.
DATABASE_URL is read from the environment / .env file via the app's Settings.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings

# This is the Alembic Config object
config = context.config
settings = get_settings()

# Parse via make_url so special characters (e.g. !) in the password are handled
# correctly without going through configparser's % interpolation.
_db_url = make_url(settings.database_url)

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so Alembic can detect them
from app.models.base import Base  # noqa: E402  (must be after Base imports)
from app.models.organisation import Organisation  # noqa: F401
from app.models.profile import Profile  # noqa: F401
from app.models.property import Property, Unit  # noqa: F401
from app.models.tenant import Tenant, TenantDocument, TenantInvite  # noqa: F401

target_metadata = Base.metadata


# ── Offline mode ──────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    context.configure(
        url=_db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode ───────────────────────────────────────────────────────────────

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(_db_url, poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
