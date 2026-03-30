"""
Fernet symmetric encryption for DB-stored secrets.

Usage:
    from app.core.encryption import encrypt, decrypt, is_encrypted

    ciphertext = encrypt("my-api-key")          # "gAAAAAB..."
    plaintext  = decrypt("gAAAAAB...")           # "my-api-key"
    is_encrypted("gAAAAAB...")                   # True

The encryption key is read from the SETTINGS_ENCRYPTION_KEY environment variable.
This must be a 32-byte URL-safe base64-encoded string — generate with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

NEVER store this key in the database. It must live only in environment variables
or a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).
"""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken


def _get_fernet() -> Fernet:
    # Read directly from os.environ — never from the lru_cache'd Settings object.
    # The encryption key must be available even before the DB is reachable.
    key = os.environ.get("SETTINGS_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY environment variable is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(key.encode())
    except Exception as exc:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is not a valid Fernet key. "
            "It must be a 32-byte URL-safe base64-encoded string."
        ) from exc


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns a Fernet token string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet token. Raises ValueError on invalid/tampered token."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt setting — token is invalid or key has changed.") from exc


def is_encrypted(value: str) -> bool:
    """Heuristic check: Fernet tokens always start with 'gAAAAA'."""
    return value.startswith("gAAAAA")


MASKED = "••••••"
