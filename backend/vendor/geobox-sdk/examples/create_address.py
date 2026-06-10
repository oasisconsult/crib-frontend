"""
Example: Create a new address and print the geocode.

Run:
    pip install geobox-sdk
    python examples/create_address.py

Or set env vars:
    export GEOBOX_CLIENT_ID="app_01HXYZ..."
    export GEOBOX_CLIENT_SECRET="cs_live_XXXXXXXX"
"""

import asyncio
from geobox import GeoBoxClient

CLIENT_ID     = "app_YOUR_CLIENT_ID"
CLIENT_SECRET = "cs_live_YOUR_CLIENT_SECRET"


async def main() -> None:
    async with GeoBoxClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    ) as client:

        # Step 1 — find nearby villages from a GPS pin
        nearby = await client.geocoding.find_nearby(latitude=0.3476, longitude=32.6311)
        print("Nearby villages:")
        for i, area in enumerate(nearby.areas, 1):
            print(f"  {i}. {area.name} ({area.distance_meters:.0f}m)")

        if not nearby.areas:
            print("No villages found — check GPS coordinates")
            return

        village = nearby.areas[0]
        print(f"\nSelected: {village.name}")

        # Step 2 — record GDPR consent
        consent = await client.addresses.record_consent(
            phone="+256701234567",
            share_delivery=True,
            share_contact=False,
        )
        print(f"Consent recorded: {consent}")

        # Step 3 — create address
        resp = await client.addresses.create(
            full_address=f"Plot 15 Mawanda Road, {village.name}",
            admin_hierarchy=village.hierarchy,
            latitude=0.3476,
            longitude=32.6311,
            share_delivery=True,
            share_contact=False,
            address_type="RESIDENTIAL",
            contact_phone="+256701234567",
            access_instructions="Red gate, first house after the roundabout",
            landmark_description="Next to Shell Ntinda",
            delivery_notes="Call before arriving",
        )

        print(f"\n✅ Address created!")
        print(f"   Geocode:    {resp.geocode}")
        print(f"   Address ID: {resp.address_id}")


if __name__ == "__main__":
    asyncio.run(main())
