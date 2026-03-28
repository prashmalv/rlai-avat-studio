"""
avatar_providers/heygen.py — HeyGen Streaming Avatar provider.

Wraps the HeyGen v1/v2 REST APIs:
  - /v1/streaming.create_token  → short-lived SDK token for the browser SDK
  - /v2/avatars                  → list available streaming avatars
  - /v2/voices                   → list available voices

All methods are static and accept an api_key argument so the class can be
used without instantiation. The API key is expected to be loaded from the
HEYGEN_API_KEY environment variable by the caller (main.py).
"""

from typing import Optional
import httpx

_HEYGEN_BASE = "https://api.heygen.com"


class HeyGenProvider:
    name = "heygen"
    display_name = "HeyGen"
    requires_keys = ["HEYGEN_API_KEY"]

    @staticmethod
    async def get_token(api_key: str) -> dict:
        """
        Obtain a short-lived streaming token from HeyGen.
        POST /v1/streaming.create_token
        Returns {"token": "..."}
        """
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_HEYGEN_BASE}/v1/streaming.create_token",
                headers={
                    "X-Api-Key": api_key,
                    "Content-Type": "application/json",
                },
                json={},
            )
            resp.raise_for_status()
            data = resp.json()
            # HeyGen wraps response in {"data": {"token": "..."}}
            if "data" in data and "token" in data["data"]:
                return {"token": data["data"]["token"]}
            return data

    @staticmethod
    async def list_avatars(api_key: str) -> list[dict]:
        """
        List available streaming avatars.
        GET /v2/avatars
        Returns list of {id, name, preview_image_url}
        """
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{_HEYGEN_BASE}/v2/avatars",
                headers={"X-Api-Key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()

        avatars_raw = data.get("data", {}).get("avatars", [])
        result = []
        for a in avatars_raw:
            result.append({
                "id": a.get("avatar_id", a.get("id", "")),
                "name": a.get("avatar_name", a.get("name", "Unknown")),
                "preview_image_url": a.get("preview_image_url", a.get("thumbnail_url", None)),
            })
        return result

    @staticmethod
    async def list_voices(api_key: str) -> list[dict]:
        """
        List available voices.
        GET /v2/voices
        Returns list of {voice_id, name, language, gender}
        """
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{_HEYGEN_BASE}/v2/voices",
                headers={"X-Api-Key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()

        voices_raw = data.get("data", {}).get("voices", [])
        result = []
        for v in voices_raw:
            result.append({
                "voice_id": v.get("voice_id", v.get("id", "")),
                "name": v.get("name", "Unknown"),
                "language": v.get("language", None),
                "gender": v.get("gender", None),
            })
        return result
