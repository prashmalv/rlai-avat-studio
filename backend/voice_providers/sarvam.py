"""
voice_providers/sarvam.py — Sarvam AI TTS provider.

Sarvam AI specialises in Indian-language speech synthesis.
  - POST /text-to-speech → synthesize speech (returns base64-encoded WAV in JSON)

The voice list is hardcoded because Sarvam does not publish a REST endpoint
for listing voices. Update this list as Sarvam releases new speakers.
"""

import base64
from typing import Optional
import httpx

_SARVAM_BASE = "https://api.sarvam.ai"

_SARVAM_VOICES = [
    {"voice_id": "meera", "name": "Meera", "language": "hi-IN", "gender": "female"},
    {"voice_id": "pavithra", "name": "Pavithra", "language": "hi-IN", "gender": "female"},
    {"voice_id": "maitreyi", "name": "Maitreyi", "language": "hi-IN", "gender": "female"},
    {"voice_id": "arvind", "name": "Arvind", "language": "hi-IN", "gender": "male"},
    {"voice_id": "amol", "name": "Amol", "language": "hi-IN", "gender": "male"},
    {"voice_id": "amartya", "name": "Amartya", "language": "hi-IN", "gender": "male"},
    {"voice_id": "diya", "name": "Diya", "language": "en-IN", "gender": "female"},
    {"voice_id": "neel", "name": "Neel", "language": "en-IN", "gender": "male"},
    {"voice_id": "misha", "name": "Misha", "language": "en-IN", "gender": "female"},
    {"voice_id": "vian", "name": "Vian", "language": "en-IN", "gender": "male"},
    {"voice_id": "arjun", "name": "Arjun", "language": "bn-IN", "gender": "male"},
    {"voice_id": "maya", "name": "Maya", "language": "ta-IN", "gender": "female"},
]


class SarvamProvider:
    name = "sarvam"
    display_name = "Sarvam AI"
    requires_keys = ["SARVAM_API_KEY"]

    @staticmethod
    async def synthesize(
        api_key: str,
        voice_id: str,
        text: str,
        language: str = "hi-IN",
    ) -> bytes:
        """
        Convert text to speech using Sarvam AI.
        Returns raw WAV audio bytes decoded from the base64 response.
        """
        headers = {
            "api-subscription-key": api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": [text],
            "target_language_code": language,
            "speaker": voice_id,
            "pitch": 0,
            "pace": 1.0,
            "loudness": 1.5,
            "speech_sample_rate": 22050,
            "enable_preprocessing": True,
            "model": "bulbul:v1",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{_SARVAM_BASE}/text-to-speech",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # Sarvam returns {"audios": ["<base64_wav>"]}
        audios = data.get("audios", [])
        if audios:
            audio_b64 = audios[0]
            return base64.b64decode(audio_b64)
        raise ValueError("Sarvam API returned no audio data.")

    @staticmethod
    def list_voices() -> list[dict]:
        """Return the hardcoded list of Sarvam voices."""
        return list(_SARVAM_VOICES)
