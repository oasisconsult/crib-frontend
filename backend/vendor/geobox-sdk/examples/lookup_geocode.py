"""
Example: Look up a customer address by geocode (rider / business flow).

Run:
    python examples/lookup_geocode.py UGKAN-JF5
"""

import asyncio
import sys
from geobox import GeoBoxClient, GeoBoxNotFoundError

CLIENT_ID     = "app_YOUR_CLIENT_ID"
CLIENT_SECRET = "cs_live_YOUR_CLIENT_SECRET"


async def main(geocode: str) -> None:
    async with GeoBoxClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    ) as client:
        try:
            result = await client.geocoding.lookup(geocode)
        except GeoBoxNotFoundError:
            print(f"❌ Geocode '{geocode}' not found")
            return

        print(f"📍 Location found for {result.geocode}")
        if result.full_address:
            print(f"   Address:      {result.full_address}")
        if result.landmark:
            print(f"   Landmark:     {result.landmark}")
        if result.access_instructions:
            print(f"   Access:       {result.access_instructions}")
        if result.delivery_notes:
            print(f"   Rider notes:  {result.delivery_notes}")
        if result.nav_url:
            print(f"   Navigate:     {result.nav_url}")
        if result.contact_phone:
            print(f"   Contact:      {result.contact_phone}")


if __name__ == "__main__":
    code = sys.argv[1] if len(sys.argv) > 1 else "UGKAN-JF5"
    asyncio.run(main(code))
