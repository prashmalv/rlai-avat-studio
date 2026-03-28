"""
voice_providers/elevenlabs.py — ElevenLabs TTS provider.

Wraps the ElevenLabs v1 REST API:
  - POST /v1/text-to-speech/{voice_id} → synthesize speech, returns MP3 bytes
  - GET  /v1/voices                     → list available voices

Voice stability and similarity_boost are set to production-quality defaults.
The model defaults to eleven_multilingual_v2 for broad language coverage.
"""

from typing import Optional
import httpx

_ELEVENLABS_BASE = "https://api.elevenlabs.io"
_DEFAULT_MODEL = "eleven_multilingual_v2"


class ElevenLabsProvider:
    name = "elevenlabs"
    display_name = "ElevenLabs"
    requires_keys = ["ELEVENLABS_API_KEY"]

    @staticmethod
    async def synthesize(
        api_key: str,
        voice_id: str,
        text: str,
        model_id: str = _DEFAULT_MODEL,
        stability: float = 0.5,
        similarity_boost: float = 0.75,
    ) -> bytes:
        """
        Convert text to speech using ElevenLabs.
        Returns raw MP3 audio bytes.
        """
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }
        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
            },
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{_ELEVENLABS_BASE}/v1/text-to-speech/{voice_id}",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.content

    @staticmethod
    async def list_voices(api_key: str) -> list[dict]:
        """
        List all voices available on the account.
        Returns list of {voice_id, name, labels, preview_url}
        """
        headers = {"xi-api-key": api_key}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{_ELEVENLABS_BASE}/v1/voices",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        voices_raw = data.get("voices", [])
        result = []
        for v in voices_raw:
            result.append({
                "voice_id": v.get("voice_id", ""),
                "name": v.get("name", "Unknown"),
                "labels": v.get("labels", {}),
                "preview_url": v.get("preview_url", None),
                "language": v.get("labels", {}).get("language", None),
                "gender": v.get("labels", {}).get("gender", None),
            })
        return result
