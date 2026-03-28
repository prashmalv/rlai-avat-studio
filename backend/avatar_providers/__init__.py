"""
avatar_providers/__init__.py — Registry of all supported avatar providers.

Each provider class exposes a consistent interface:
  - name: str (machine identifier)
  - display_name: str (human-readable label)
  - get_token / create_streaming_session / get_session_token (provider-specific)
  - list_avatars(api_key) -> list[dict]

Usage:
    provider_cls = get_provider("heygen")
    avatars = await provider_cls.list_avatars(api_key)
"""

from .heygen import HeyGenProvider
from .did import DIDProvider
from .simli import SimliProvider
from .liveavatar import LiveAvatarProvider

PROVIDERS: dict = {
    "liveavatar": LiveAvatarProvider,
    "heygen": HeyGenProvider,
    "did": DIDProvider,
    "simli": SimliProvider,
}


def get_provider(name: str):
    """Return the provider class for the given provider name, or None."""
    return PROVIDERS.get(name)


__all__ = ["HeyGenProvider", "DIDProvider", "SimliProvider", "LiveAvatarProvider", "PROVIDERS", "get_provider"]
