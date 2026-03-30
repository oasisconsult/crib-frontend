"""
Storage provider adapter — S3-compatible file upload backend.

Supports four providers via a single S3-compatible interface (boto3):
  local   — stores files on the local filesystem, returns relative URLs (dev only)
  s3      — AWS S3
  r2      — Cloudflare R2 (S3-compatible, zero egress fees)
  minio   — MinIO self-hosted (S3-compatible)

R2, MinIO, and S3 all use the same boto3 code path — the only difference is
the endpoint_url. This avoids duplicating logic across providers.

Usage:
    config = await settings_service.get_storage_config(db)
    provider = get_storage_provider(config)

    url = await provider.presign_upload(
        key="orgs/abc/documents/passport.pdf",
        mime_type="application/pdf",
        expires_in=900,
    )
    public_url = provider.public_url(key)
    await provider.delete(key)
    await provider.test_connection()
"""

from __future__ import annotations

import io
import os
import uuid
from abc import ABC, abstractmethod
from typing import Any


class StorageProvider(ABC):
    """Shared interface — all providers must implement these three methods."""

    @abstractmethod
    async def presign_upload(
        self,
        key: str,
        mime_type: str,
        expires_in: int = 900,
    ) -> str:
        """Return a pre-signed PUT URL the client can upload to directly."""

    @abstractmethod
    def public_url(self, key: str) -> str:
        """Return the public read URL for an object key."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete an object by key."""

    @abstractmethod
    async def test_connection(self) -> None:
        """Upload and delete a 1-byte canary. Raises on failure."""


# ── S3-compatible (AWS S3 / Cloudflare R2 / MinIO) ───────────────────────────

class S3CompatibleProvider(StorageProvider):
    """
    Handles AWS S3, Cloudflare R2, and MinIO via boto3.

    For R2: set endpoint_url = "https://<account>.r2.cloudflarestorage.com"
    For MinIO: set endpoint_url = "http://localhost:9000"
    For AWS S3: leave endpoint_url as None
    """

    def __init__(
        self,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
        region: str = "us-east-1",
        endpoint_url: str | None = None,
        public_base_url: str | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        self._endpoint_url = endpoint_url
        self._public_base_url = public_base_url
        self._credentials = {
            "aws_access_key_id": access_key_id,
            "aws_secret_access_key": secret_access_key,
            "region_name": region,
        }
        if endpoint_url:
            self._credentials["endpoint_url"] = endpoint_url

    def _client(self):  # type: ignore[return]
        import boto3  # local import — only needed when S3 provider is active
        return boto3.client("s3", **self._credentials)

    async def presign_upload(
        self,
        key: str,
        mime_type: str,
        expires_in: int = 900,
    ) -> str:
        import asyncio
        import functools

        client = self._client()
        fn = functools.partial(
            client.generate_presigned_url,
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": mime_type},
            ExpiresIn=expires_in,
        )
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, fn)

    def public_url(self, key: str) -> str:
        if self._public_base_url:
            return f"{self._public_base_url.rstrip('/')}/{key}"
        if self._endpoint_url:
            return f"{self._endpoint_url.rstrip('/')}/{self._bucket}/{key}"
        return f"https://{self._bucket}.s3.{self._region}.amazonaws.com/{key}"

    async def delete(self, key: str) -> None:
        import asyncio
        import functools

        client = self._client()
        fn = functools.partial(
            client.delete_object,
            Bucket=self._bucket,
            Key=key,
        )
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, fn)

    async def test_connection(self) -> None:
        import asyncio
        import functools

        canary_key = f"_crib_test/{uuid.uuid4()}.txt"
        client = self._client()

        put_fn = functools.partial(
            client.put_object,
            Bucket=self._bucket,
            Key=canary_key,
            Body=b".",
            ContentType="text/plain",
        )
        del_fn = functools.partial(
            client.delete_object,
            Bucket=self._bucket,
            Key=canary_key,
        )
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, put_fn)
        await loop.run_in_executor(None, del_fn)


# ── Local (development only) ──────────────────────────────────────────────────

class LocalStorageProvider(StorageProvider):
    """
    Dev-mode provider — writes files to a local directory.
    Presign returns a signed URL to the Next.js `/api/upload` route
    (or a direct FastAPI endpoint in dev).

    Never use in production — there is no access control.
    """

    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self._base_url = base_url.rstrip("/")
        self._upload_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(self._upload_dir, exist_ok=True)

    async def presign_upload(
        self,
        key: str,
        mime_type: str,
        expires_in: int = 900,
    ) -> str:
        # In local mode, the client PUTs directly to our own upload endpoint
        return f"{self._base_url}/api/v1/upload/local/{key}"

    def public_url(self, key: str) -> str:
        return f"{self._base_url}/api/v1/upload/local/{key}"

    async def delete(self, key: str) -> None:
        path = os.path.join(self._upload_dir, key.replace("/", os.sep))
        if os.path.exists(path):
            os.remove(path)

    async def test_connection(self) -> None:
        os.makedirs(self._upload_dir, exist_ok=True)
        # Write and delete a canary file
        test_path = os.path.join(self._upload_dir, "_crib_test.txt")
        with open(test_path, "w") as f:
            f.write(".")
        os.remove(test_path)


# ── Factory ───────────────────────────────────────────────────────────────────

def get_storage_provider(config: dict[str, Any]) -> StorageProvider:
    """
    Instantiate the correct storage provider from a settings config dict.
    Config is produced by settings_service.get_storage_config().
    """
    provider = config.get("provider", "local")

    if provider == "local":
        return LocalStorageProvider()

    if provider in ("s3", "r2", "minio"):
        bucket = config.get("bucket", "")
        access_key = config.get("access_key_id", "")
        secret_key = config.get("secret_access_key", "")

        if not bucket:
            raise ValueError(f"storage.s3.bucket must be set when provider='{provider}'")
        if not access_key or not secret_key:
            raise ValueError(f"storage.s3.access_key_id and secret_access_key must be set when provider='{provider}'")

        return S3CompatibleProvider(
            bucket=bucket,
            access_key_id=access_key,
            secret_access_key=secret_key,
            region=config.get("region", "us-east-1"),
            endpoint_url=config.get("endpoint_url"),
            public_base_url=config.get("public_base_url"),
        )

    raise ValueError(
        f"Unknown storage provider: '{provider}'. "
        "Valid values: 'local', 's3', 'r2', 'minio'"
    )
