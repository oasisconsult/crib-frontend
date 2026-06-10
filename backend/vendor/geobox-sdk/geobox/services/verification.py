"""
GeoBox SDK — Address verification service.
"""

from __future__ import annotations

from typing import Any

from ..http import HttpTransport
from ..models import VerificationResponse, VerificationStatus


class VerificationService:
    """
    Real-time address verification via GPS geofencing.

    Obtain via ``client.verification`` — do not instantiate directly.
    """

    def __init__(self, http: HttpTransport) -> None:
        self._http = http

    async def verify(
        self,
        geocode: str,
        *,
        verifier_lat: float,
        verifier_lng: float,
        accuracy_m: float | None = None,
        notes: str | None = None,
    ) -> VerificationResponse:
        """
        Verify an address by GPS proximity check.

        A rider or verifier at the address location sends their GPS coordinate.
        The API compares it to the registered address coordinates and confirms
        or rejects the verification based on a geofence.

        Args:
            geocode:      Geocode of the address to verify.
            verifier_lat: Current latitude of the verifier.
            verifier_lng: Current longitude of the verifier.
            accuracy_m:   GPS accuracy in metres (improves geofence decision).
            notes:        Optional comment from the verifier.

        Returns:
            VerificationResponse with the new verification status.
        """
        body: dict = {
            "verifier_lat": verifier_lat,
            "verifier_lng": verifier_lng,
        }
        if accuracy_m is not None:
            body["accuracy_m"] = accuracy_m
        if notes:
            body["notes"] = notes

        data = await self._http.put(
            f"addresses/{geocode.strip().upper()}/verification",
            json=body,
        )
        return VerificationResponse(
            geocode=data.get("geocode", geocode),
            verification_status=VerificationStatus(
                data.get("verification_status", "pending")
            ),
            verified_at=data.get("verified_at"),
            message=data.get("message"),
        )

    async def self_verify(
        self,
        geocode: str,
        *,
        lat: float,
        lng: float,
        accuracy_m: float | None = None,
    ) -> VerificationResponse:
        """
        Allow the address owner to self-verify by submitting their GPS location.

        Args:
            geocode:    Geocode of the address.
            lat:        Current latitude of the owner.
            lng:        Current longitude of the owner.
            accuracy_m: GPS accuracy in metres.
        """
        body: dict = {"lat": lat, "lng": lng}
        if accuracy_m is not None:
            body["accuracy_m"] = accuracy_m

        data = await self._http.put(
            f"addresses/{geocode.strip().upper()}/verification/self",
            json=body,
        )
        return VerificationResponse(
            geocode=data.get("geocode", geocode),
            verification_status=VerificationStatus(
                data.get("verification_status", "pending")
            ),
            verified_at=data.get("verified_at"),
            message=data.get("message"),
        )

    async def get_status(self, geocode: str) -> dict[str, Any]:
        """
        Get the current verification status for a geocode.

        Returns:
            Dict with ``verification_status``, ``verified_at``, and related metadata.
        """
        data = await self._http.get(
            f"addresses/{geocode.strip().upper()}/details",
        )
        return {
            "geocode":             data.get("geocode", geocode),
            "verification_status": data.get("verification_status"),
            "verified_at":         data.get("verified_at"),
            "is_verified":         data.get("is_verified", False),
        }
