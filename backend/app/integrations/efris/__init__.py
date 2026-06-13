"""
URA EFRIS (Electronic Fiscal Receipting and Invoicing System) integration.

Public API:
  get_efris_client(org_id, db)  — async context manager, yields EfrisClient or raises
  EfrisNotConfiguredError       — raised when org has no active EFRIS config
  EfrisApiError                 — raised on non-2xx responses from URA
"""

from app.integrations.efris.client import EfrisClient, EfrisApiError, EfrisNotConfiguredError, get_efris_client

__all__ = [
    "EfrisClient",
    "EfrisApiError",
    "EfrisNotConfiguredError",
    "get_efris_client",
]
