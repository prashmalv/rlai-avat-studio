"""
voice_providers/__init__.py — Registry of all supported voice/TTS providers.

Each provider class exposes:
  - name: str
  - display_name: str
  - synthesize(api_key, voice_id, text, **kwargs) -> bytes  (audio bytes)
  - list_voices(api_key) -> list[dict]  (or list_voices() for hardcoded lists)

Usage:
    from voice_providers import get_voice_provider
    provider_cls = get_voice_provider("elevenlabs")
    audio_bytes = await provider_cls.synthesize(api_key, voice_id, text)
"""

from .elevenlabs import ElevenLabsProvider
from .sarvam import SarvamProvider

VOICE_PROVIDERS: dict = {
    "elevenlabs": ElevenLabsProvider,
    "sarvam": SarvamProvider,
}


def get_voice_provider(name: str):
    """Return the voice provider class for the given name, or None."""
    return VOICE_PROVIDERS.get(name)


__all__ = ["ElevenLabsProvider", "SarvamProvider", "VOICE_PROVIDERS", "get_voice_provider"]
