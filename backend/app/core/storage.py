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
        presign_endpoint_url: str | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        self._endpoint_url = endpoint_url
        self._public_base_url = public_base_url
        # Presigned URLs must use a browser-reachable host. When the internal
        # endpoint is a Docker-network hostname (e.g. geobox-minio:9000), set
        # presign_endpoint_url to the public-facing MinIO URL so the generated
        # presigned PUT URLs work from the browser.
        self._presign_endpoint_url = presign_endpoint_url or endpoint_url
        self._access_key = access_key_id
        self._secret_key = secret_access_key
        self._credentials = {
            "aws_access_key_id": access_key_id,
            "aws_secret_access_key": secret_access_key,
            "region_name": region,
        }
        if endpoint_url:
            self._credentials["endpoint_url"] = endpoint_url

    def _client(self, endpoint_url: str | None = None):
        from minio import Minio
        url = endpoint_url or self._endpoint_url
        secure = url.startswith("https://")
        endpoint = url.replace("https://", "").replace("http://", "").rstrip("/")
        return Minio(
            endpoint=endpoint,
            access_key=self._access_key,
            secret_key=self._secret_key,
            secure=secure,
        )

    async def presign_upload(
        self,
        key: str,
        mime_type: str,
        expires_in: int = 900,
    ) -> str:
        import asyncio
        import functools

        from datetime import timedelta

        # Use the public endpoint so the browser-facing presigned URL is reachable
        client = self._client(self._presign_endpoint_url)
        fn = functools.partial(
            client.presigned_put_object,
            self._bucket,
            key,
            expires=timedelta(seconds=expires_in),
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
        fn = functools.partial(client.remove_object, self._bucket, key)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, fn)

    async def test_connection(self) -> None:
        import asyncio
        import functools

        import io
        canary_key = f"_crib_test/{uuid.uuid4()}.txt"
        client = self._client()
        data = b"."
        put_fn = functools.partial(
            client.put_object,
            self._bucket,
            canary_key,
            io.BytesIO(data),
            len(data),
            content_type="text/plain",
        )
        del_fn = functools.partial(client.remove_object, self._bucket, canary_key)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, put_fn)
        await loop.run_in_executor(None, del_fn)


# ── Local (development only) ──────────────────────────────────────────────────

class LocalStorageProvider(StorageProvider):
    """
    Dev-mode provider — writes files to a local directory.

    Presign/public URLs point to the Next.js frontend proxy route
    ``/api/upload/local/{key}`` so the browser never makes a cross-origin
    request directly to the backend (which would be blocked by CORS).

    ``base_url`` defaults to ``""`` (empty), producing relative paths that
    the browser resolves against the current origin (the frontend).  Set
    ``STORAGE_LOCAL_BASE_URL=http://localhost:3000`` if you need absolute
    URLs (e.g. for server-side rendering or email links).

    Never use in production — there is no access control on the local endpoint.
    """

    def __init__(self, base_url: str = "") -> None:
        self._base_url = base_url.rstrip("/")
        self._upload_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(self._upload_dir, exist_ok=True)

    def _url(self, key: str) -> str:
        return f"{self._base_url}/api/upload/local/{key}"

    async def presign_upload(
        self,
        key: str,
        mime_type: str,
        expires_in: int = 900,
    ) -> str:
        # Routes through the Next.js /api/upload/local proxy — same origin, no CORS.
        return self._url(key)

    def public_url(self, key: str) -> str:
        return self._url(key)

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

def get_storage_provider(
    config: dict[str, Any],
    local_base_url: str = "",
) -> StorageProvider:
    """
    Instantiate the correct storage provider from a settings config dict.
    Config is produced by settings_service.get_storage_config().

    ``local_base_url`` is only used when provider='local'.  Leave empty (the
    default) so presign URLs are relative paths that the browser resolves
    against the frontend origin — no CORS issues.
    """
    provider = config.get("provider", "local")

    if provider == "local":
        return LocalStorageProvider(base_url=local_base_url)

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
            presign_endpoint_url=config.get("presign_endpoint_url"),
        )

    raise ValueError(
        f"Unknown storage provider: '{provider}'. "
        "Valid values: 'local', 's3', 'r2', 'minio'"
    )
