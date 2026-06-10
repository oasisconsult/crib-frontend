# GeoBox Python SDK

Official Python SDK for the [GeoBox Smart Addressing Platform](https://geoboxafrica.com).

## Install

```bash
pip install geobox-sdk
```

Requires Python 3.9+.

## Quick Start

```python
import asyncio
from geobox import GeoBoxClient

async def main():
    async with GeoBoxClient(
        client_id="app_01HXYZ...",
        client_secret="cs_live_XXXXXXXX",
    ) as client:

        # Step 1 — find villages near a GPS pin
        nearby = await client.geocoding.find_nearby(latitude=0.3476, longitude=32.6311)
        village = nearby.areas[0]
        print(f"Selected: {village.name}")

        # Step 2 — record GDPR consent
        await client.addresses.record_consent(
            phone="+256701234567",
            share_delivery=True,
            share_contact=False,
        )

        # Step 3 — create address
        resp = await client.addresses.create(
            full_address=f"Plot 15 Mawanda Road, {village.name}",
            admin_hierarchy=village.hierarchy,
            latitude=0.3476,
            longitude=32.6311,
            share_delivery=True,
            share_contact=False,
            contact_phone="+256701234567",
            access_instructions="Red gate, first house after the roundabout",
            landmark_description="Next to Shell Ntinda",
        )
        print(resp.geocode)   # e.g. UGKAN-JF5

        # Look up a geocode (rider/business flow)
        address = await client.geocoding.lookup("UGKAN-JF5")
        print(address.full_address)
        print(address.nav_url)

asyncio.run(main())
```

## Authentication

Credentials are resolved in this order: explicit arguments → environment variables.

```python
from geobox import GeoBoxClient
from geobox.auth import ClientCredentialsAuth, BearerTokenAuth, ApiKeyAuth

# Option 1 — client credentials (recommended)
client = GeoBoxClient(
    client_id="app_01HXYZ...",
    client_secret="cs_live_XXXXXXXX",
)

# Option 2 — from environment variables (no arguments needed)
#   export GEOBOX_CLIENT_ID="app_01HXYZ..."
#   export GEOBOX_CLIENT_SECRET="cs_live_XXXXXXXX"
client = GeoBoxClient()

# Option 3 — sandbox environment
client = GeoBoxClient(
    client_id="app_01HXYZ...",
    client_secret="cs_test_XXXXXXXX",
    sandbox=True,
)

# Option 4 — pre-issued bearer token (advanced)
client = GeoBoxClient(auth=BearerTokenAuth(token="eyJ..."))

# Option 5 — API key (legacy)
client = GeoBoxClient(auth=ApiKeyAuth(api_key="geobox_key_XXXXXXXX"))
```

## Services

| Service | Description |
|---------|-------------|
| `client.addresses` | Create, read, update, delete addresses; GDPR consent |
| `client.geocoding` | Lookup geocodes, find nearby villages, search areas |
| `client.verification` | GPS-based address verification |
| `client.webhooks` | Validate and parse inbound webhook events |

## Local Development

```bash
cd sdk/python
pip install -e .                    # install from local source
python examples/create_address.py
python examples/lookup_geocode.py
```

## Error Handling

```python
from geobox.exceptions import (
    GeoBoxNotFoundError,
    GeoBoxAuthError,
    GeoBoxRateLimitError,
    GeoBoxValidationError,
)

try:
    address = await client.addresses.get("UGXXX-XXX")
except GeoBoxNotFoundError:
    print("Geocode not found")
except GeoBoxAuthError:
    print("Invalid credentials")
except GeoBoxRateLimitError as e:
    print(f"Rate limited — retry after {e.retry_after}s")
except GeoBoxValidationError as e:
    print(f"Validation failed: {e.errors}")
```

## Webhooks

```python
from geobox.services.webhooks import WebhookHandler

handler = WebhookHandler(secret="whsec_...")

# In your webhook endpoint:
event = handler.verify_and_parse(body_bytes, signature, timestamp)
print(event.event_type)   # "address.created"
print(event.payload)
```

## Retry & Resilience

The SDK automatically retries failed requests with exponential backoff:

- Transient network errors (connection reset, timeout)
- HTTP 5xx server errors
- HTTP 429 with `Retry-After` header

Configure via `max_retries` (default 3) and `timeout` (default 30s).

## Privacy & GDPR

- Phone numbers are hashed (SHA-256) before transmission — never sent in plaintext
- GPS coordinates are not logged in request/response logs
- PII fields are masked in all SDK log output
- GDPR consent is recorded as a durable audit record via `record_consent()`
