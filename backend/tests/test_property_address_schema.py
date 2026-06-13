"""
Unit tests for PropertyAddressSchema — verifying that the GeoBox admin
hierarchy fields (village/parish/sub_county/county/district) round-trip
correctly through Pydantic validation and alias serialisation.

No database or HTTP client required — pure schema tests.
"""

from __future__ import annotations

import pytest

from app.schemas.property import PropertyAddressSchema


FULL_ADDRESS_PAYLOAD = {
    "line1": "Plot 5, Kampala Road",
    "city": "Kampala",
    "state": "Central Region",
    "postcode": "00256",
    "country": "UG",
    "village": "Nakawa",
    "parish": "Nakawa Parish",
    "subCounty": "Nakawa Division",
    "county": "Kampala County",
    "district": "Kampala District",
}


class TestPropertyAddressSchemaHierarchyFields:
    def test_parses_hierarchy_fields_from_camel_payload(self):
        schema = PropertyAddressSchema.model_validate(FULL_ADDRESS_PAYLOAD)
        assert schema.village == "Nakawa"
        assert schema.parish == "Nakawa Parish"
        assert schema.sub_county == "Nakawa Division"
        assert schema.county == "Kampala County"
        assert schema.district == "Kampala District"

    def test_serialises_sub_county_as_camel_case(self):
        schema = PropertyAddressSchema.model_validate(FULL_ADDRESS_PAYLOAD)
        dumped = schema.model_dump(by_alias=True)
        assert "subCounty" in dumped
        assert dumped["subCounty"] == "Nakawa Division"
        assert "sub_county" not in dumped

    def test_all_hierarchy_fields_in_dump(self):
        schema = PropertyAddressSchema.model_validate(FULL_ADDRESS_PAYLOAD)
        dumped = schema.model_dump(by_alias=True, exclude_none=True)
        for key in ("village", "parish", "subCounty", "county", "district"):
            assert key in dumped, f"Missing key: {key}"

    def test_hierarchy_fields_are_optional(self):
        minimal = {
            "line1": "Plot 1",
            "city": "Kampala",
            "state": "Central",
            "postcode": "00256",
            "country": "UG",
        }
        schema = PropertyAddressSchema.model_validate(minimal)
        assert schema.village is None
        assert schema.parish is None
        assert schema.sub_county is None
        assert schema.county is None
        assert schema.district is None

    def test_none_hierarchy_fields_excluded_with_exclude_none(self):
        minimal = {
            "line1": "Plot 1",
            "city": "Kampala",
            "state": "Central",
            "postcode": "00256",
            "country": "UG",
        }
        schema = PropertyAddressSchema.model_validate(minimal)
        dumped = schema.model_dump(by_alias=True, exclude_none=True)
        for key in ("village", "parish", "subCounty", "county", "district"):
            assert key not in dumped, f"Unexpected key in dump: {key}"
