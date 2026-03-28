"""
avatar_providers/simli.py — Simli AI avatar provider.

Wraps the Simli API for audio-to-video real-time avatar streaming:
  - POST /startAudioToVideoSession → obtain a session token for the browser SDK
  - list_avatars()                 → returns a curated hardcoded list of Simli
                                     face IDs (the API endpoint is not publicly
                                     documented; the list is updated manually)

The simli-client npm package on the frontend consumes the session token and
handles the actual WebRTC connection.
"""

from typing import Optional
import httpx

_SIMLI_BASE = "https://api.simli.ai"


# Hardcoded list of known Simli face IDs as of late 2024.
# Update these when Simli publishes new avatars.
_HARDCODED_AVATARS = [
    {"id": "tmp9i8bbq7c", "name": "Anna", "preview_image_url": None},
    {"id": "8Gl5MvYHj", "name": "Marcus", "preview_image_url": None},
    {"id": "ClCHFjJQ4d", "name": "Eva", "preview_image_url": None},
    {"id": "5514e24d-6086-46a3-ace4-6a7264e5cb7c", "name": "Oliver", "preview_image_url": None},
    {"id": "b5b846a2-fae8-4827-bc82-f3a29b85bba8", "name": "Sophia", "preview_image_url": None},
]


class SimliProvider:
    name = "simli"
    display_name = "Simli"
    requires_keys = ["SIMLI_API_KEY"]

    @staticmethod
    async def get_session_token(api_key: str, face_id: str) -> dict:
        """
        Start a Simli audio-to-video session.
        POST /startAudioToVideoSession
        Returns the session token dict used by simli-client on the frontend.
        """
        payload = {
            "apiKey": api_key,
            "faceId": face_id,
            "handleSilence": True,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_SIMLI_BASE}/startAudioToVideoSession",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    async def list_avatars(api_key: str) -> list[dict]:
        """
        Attempt to fetch the avatar list from the Simli API.
        Falls back to the hardcoded list if the endpoint is unavailable.
        Returns list of {id, name, preview_image_url}
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{_SIMLI_BASE}/faces",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    faces = data if isinstance(data, list) else data.get("faces", [])
                    result = []
                    for f in faces:
                        result.append({
                            "id": f.get("id", f.get("face_id", "")),
                            "name": f.get("name", "Avatar"),
                            "preview_image_url": f.get("preview_url", f.get("thumbnail_url", None)),
                        })
                    if result:
                        return result
        except Exception:
            pass  # Fall through to hardcoded list

        return list(_HARDCODED_AVATARS)
