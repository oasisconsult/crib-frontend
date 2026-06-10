"""
GeoBox SDK — Address service.

Wraps all address CRUD, search, batch-validation, and consent endpoints.
"""

from __future__ import annotations

import hashlib
from typing import Any, Optional

from ..http import HttpTransport
from ..models import (
    Address,
    AddressCreateResponse,
    AddressList,
    BatchValidationResponse,
)

# Mapping from friendly SDK values to API enum values
_ADDRESS_TYPE_MAP = {
    "home":        "RESIDENTIAL",
    "residential": "RESIDENTIAL",
    "office":      "COMMERCIAL",
    "commercial":  "COMMERCIAL",
    "other":       "RESIDENTIAL",  # fallback
}


def _resolve_address_type(value: str) -> str:
    return _ADDRESS_TYPE_MAP.get(value.lower(), value.upper())


class AddressService:
    """
    Manage smart addresses on the GeoBox platform.

    Obtain via ``client.addresses`` — do not instantiate directly.
    """

    def __init__(self, http: HttpTransport) -> None:
        self._http = http

    # ------------------------------------------------------------------
    # Create  POST /addresses
    # ------------------------------------------------------------------

    async def create(
        self,
        *,
        full_address: str,
        admin_hierarchy: list[str],
        latitude: float,
        longitude: float,
        share_delivery: bool,
        share_contact: bool,
        address_type: str = "RESIDENTIAL",
        contact_phone: Optional[str] = None,
        contact_name: Optional[str] = None,
        landmark_description: Optional[str] = None,
        access_instructions: Optional[str] = None,
        delivery_notes: Optional[str] = None,
        building_name: Optional[str] = None,
        building_details: Optional[str] = None,
        apartment_unit: Optional[str] = None,
        floor_number: Optional[str] = None,
        label: Optional[str] = None,
        country_code: str = "UG",
        registration_channel: str = "api",
        existing_user_id: Optional[str] = None,
    ) -> AddressCreateResponse:
        """
        Create a new address and generate a unique geocode.

        Args:
            full_address:        Complete address text (e.g. "Plot 15 Mawanda Road, Kireka").
            admin_hierarchy:     List of admin area names from country level to village,
                                 e.g. ["Kampala", "Nakawa", "Nakawa", "Kireka"].
            latitude:            GPS latitude.
            longitude:           GPS longitude.
            share_delivery:      GDPR consent — share delivery details with riders.
            share_contact:       GDPR consent — share contact number with riders.
            address_type:        "RESIDENTIAL" or "COMMERCIAL" (also accepts "home"/"office").
            contact_phone:       E.164 phone number of the owner (optional).
            contact_name:        Name of the address owner (optional).
            landmark_description: Well-known nearby landmark (optional).
            access_instructions: How to reach the gate, colour, etc. (optional).
            delivery_notes:      Instructions for the rider (optional).

        Returns:
            AddressCreateResponse with ``geocode`` and ``address_id``.

        Example::

            nearby = await client.geocoding.find_nearby(latitude=0.3476, longitude=32.6311)
            village = nearby.areas[0]

            resp = await client.addresses.create(
                full_address="Plot 15 Mawanda Road, Kireka",
                admin_hierarchy=village.hierarchy,
                latitude=0.3476,
                longitude=32.6311,
                share_delivery=True,
                share_contact=False,
                contact_phone="+256701234567",
                access_instructions="Red gate, first house after the roundabout",
            )
            print(resp.geocode)   # UGKAN-JF5
        """
        body: dict[str, Any] = {
            "country_code":           country_code,
            "admin_hierarchy":        admin_hierarchy,
            "full_address":           full_address,
            "location":               {"latitude": latitude, "longitude": longitude},
            "address_type":           _resolve_address_type(address_type),
            "share_delivery_details": share_delivery,
            "share_contact_info":     share_contact,
            "registration_channel":   registration_channel,
        }
        if contact_phone:       body["contact_phone"]        = contact_phone
        if contact_name:        body["contact_name"]         = contact_name
        if landmark_description: body["landmark_description"] = landmark_description
        if access_instructions:  body["access_instructions"]  = access_instructions
        if delivery_notes:       body["delivery_notes"]       = delivery_notes
        if building_name:        body["building_name"]        = building_name
        if building_details:     body["building_details"]     = building_details
        if apartment_unit:       body["apartment_unit"]       = apartment_unit
        if floor_number:         body["floor_number"]         = floor_number
        if label:                body["label"]                = label
        if existing_user_id:     body["existing_user_id"]     = existing_user_id

        data = await self._http.post("addresses", json=body)
        return AddressCreateResponse(**data)

    # ------------------------------------------------------------------
    # Read  GET /addresses/{geocode}
    # ------------------------------------------------------------------

    async def get(self, geocode: str) -> Address:
        """
        Retrieve a full address record by geocode.

        Args:
            geocode: 9-character code, e.g. ``UGKAN-JF5``.
        """
        data = await self._http.get(f"addresses/{geocode.strip().upper()}")
        return Address(**data)

    # ------------------------------------------------------------------
    # Update  PATCH /addresses/{geocode}
    # ------------------------------------------------------------------

    async def update(
        self,
        geocode: str,
        *,
        access_instructions: Optional[str] = None,
        delivery_notes: Optional[str] = None,
        landmark_description: Optional[str] = None,
        building_name: Optional[str] = None,
        building_details: Optional[str] = None,
        apartment_unit: Optional[str] = None,
        floor_number: Optional[str] = None,
        contact_name: Optional[str] = None,
        contact_phone: Optional[str] = None,
        label: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Update one or more fields on an existing address.

        Args:
            geocode: The geocode of the address to update (e.g. ``UGKAN-JF5``).
            access_instructions: How to reach the address.
            delivery_notes:      Instructions for the rider.
            landmark_description: Nearby landmark.
            building_name:       Building / complex name.

        Returns:
            API response dict.
        """
        body = {k: v for k, v in {
            "access_instructions":  access_instructions,
            "delivery_notes":       delivery_notes,
            "landmark_description": landmark_description,
            "building_name":        building_name,
            "building_details":     building_details,
            "apartment_unit":       apartment_unit,
            "floor_number":         floor_number,
            "contact_name":         contact_name,
            "contact_phone":        contact_phone,
            "label":                label,
        }.items() if v is not None}
        return await self._http.patch(f"addresses/{geocode.strip().upper()}", json=body)

    # ------------------------------------------------------------------
    # Delete  DELETE /addresses/{geocode}
    # ------------------------------------------------------------------

    async def delete(self, geocode: str) -> dict[str, Any]:
        """Soft-delete an address."""
        return await self._http.delete(f"addresses/{geocode.strip().upper()}")

    # ------------------------------------------------------------------
    # Search  GET /addresses/search
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> AddressList:
        """
        Full-text search for addresses.

        Args:
            query:  Search string (geocode, village name, or address text).
            limit:  Max results (1–100).
            offset: Pagination offset.
        """
        data = await self._http.get(
            "addresses/search",
            params={"q": query, "limit": limit, "offset": offset},
        )
        return AddressList(
            addresses=[Address(**a) for a in data.get("addresses", data.get("results", []))],
            total=data.get("total", 0),
        )

    # ------------------------------------------------------------------
    # Batch validate  POST /addresses/batch/validate
    # ------------------------------------------------------------------

    async def batch_validate(self, geocodes: list[str]) -> BatchValidationResponse:
        """
        Validate up to 100 geocodes in a single request.

        Args:
            geocodes: List of geocode strings to validate.

        Returns:
            BatchValidationResponse with per-geocode results.
        """
        data = await self._http.post(
            "addresses/batch/validate",
            json={"geocodes": geocodes},
        )
        return BatchValidationResponse(**data)

    # ------------------------------------------------------------------
    # GDPR consent  POST /addresses/consent
    # ------------------------------------------------------------------

    async def record_consent(
        self,
        phone: str,
        share_delivery: bool,
        share_contact: bool,
        channel: str = "api_sdk",
    ) -> dict[str, Any]:
        """
        Record GDPR consent in the durable audit log.

        The raw phone number is hashed (SHA-256) before transmission —
        the backend stores only the hash, never the plaintext.

        Args:
            phone:          E.164 phone number.
            share_delivery: Consent to share delivery details with riders.
            share_contact:  Consent to share contact number with riders.
            channel:        Source channel identifier.
        """
        clean = phone.replace("+", "").replace(" ", "").replace("-", "").strip()
        phone_hash = hashlib.sha256(clean.encode()).hexdigest()
        return await self._http.post(
            "addresses/consent",
            json={
                "phone_hash":     phone_hash,
                "share_delivery": share_delivery,
                "share_contact":  share_contact,
                "channel":        channel,
            },
        )
