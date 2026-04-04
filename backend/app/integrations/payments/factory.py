"""
Payment provider factory.

Returns the correct PaymentProvider instance for a given payment method.
Provider instances are module-level singletons (one per process) to allow
token caching via instance variables.
"""

from __future__ import annotations

from app.integrations.payments.base import PaymentProvider
from app.integrations.payments.providers.airtel import AirtelMoneyProvider
from app.integrations.payments.providers.manual import ManualProvider
from app.integrations.payments.providers.mtn import MTNMoMoProvider

_mtn = MTNMoMoProvider()
_airtel = AirtelMoneyProvider()
_manual = ManualProvider()

_REGISTRY: dict[str, PaymentProvider] = {
    "mobile_money_mtn": _mtn,
    "mobile_money_airtel": _airtel,
    "cash": _manual,
    "bank_transfer": _manual,
    "other": _manual,
}


def get_provider(method: str) -> PaymentProvider:
    """
    Return the PaymentProvider for the given payment method string.

    Raises ValueError for unknown methods so callers fail fast rather than
    silently falling through.
    """
    provider = _REGISTRY.get(method)
    if provider is None:
        raise ValueError(
            f"Unknown payment method: {method!r}. "
            f"Valid methods: {list(_REGISTRY)}"
        )
    return provider
