"""
avatar_providers/did.py — D-ID Streaming provider.

Wraps the D-ID Talks Streams API for real-time WebRTC avatar streaming:
  - POST /talks/streams          → create session, get ICE servers + SDP offer
  - POST /talks/streams/{id}/sdp → submit client SDP answer
  - POST /talks/streams/{id}/ice → submit ICE candidate
  - POST /talks/streams/{id}     → send speech text (triggers avatar to speak)
  - DELETE /talks/streams/{id}   → close session
  - GET  /clips/presenters       → list available avatar presenters

Authentication uses HTTP Basic auth with the api_key as username.
"""

import base64
from typing import Optional
import httpx

_DID_BASE = "https://api.d-id.com"


def _auth_header(api_key: str) -> dict:
    """
    D-ID API key format: base64(email):secret
    For Basic auth the entire key is the username with empty password:
      Authorization: Basic base64(api_key + ":")
    """
    token = base64.b64encode(f"{api_key}:".encode()).decode()
    return {"Authorization": f"Basic {token}"}


class DIDProvider:
    name = "did"
    display_name = "D-ID"
    requires_keys = ["DID_API_KEY"]

    @staticmethod
    async def create_streaming_session(api_key: str, avatar_id: str) -> dict:
        """
        Create a new D-ID streaming session.
        POST /talks/streams
        Returns {id, session_id, ice_servers, offer (SDP)}
        """
        headers = {**_auth_header(api_key), "Content-Type": "application/json"}
        payload: dict = {}
        if avatar_id:
            # If it looks like a URL use source_url, otherwise treat as presenter_id
            if avatar_id.startswith("http"):
                payload["source_url"] = avatar_id
            else:
                payload["presenter_id"] = avatar_id

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_DID_BASE}/talks/streams",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    async def send_sdp_answer(
        api_key: str,
        session_id: str,
        stream_id: str,
        answer: dict,
    ) -> dict:
        """
        Submit the WebRTC SDP answer from the client browser.
        POST /talks/streams/{stream_id}/sdp
        """
        headers = {**_auth_header(api_key), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_DID_BASE}/talks/streams/{stream_id}/sdp",
                headers=headers,
                json={"answer": answer, "session_id": session_id},
            )
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    @staticmethod
    async def send_ice_candidate(
        api_key: str,
        session_id: str,
        stream_id: str,
        candidate: dict,
    ) -> dict:
        """
        Submit an ICE candidate gathered by the client.
        POST /talks/streams/{stream_id}/ice
        """
        headers = {**_auth_header(api_key), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_DID_BASE}/talks/streams/{stream_id}/ice",
                headers=headers,
                json={"candidate": candidate, "session_id": session_id},
            )
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    @staticmethod
    async def speak(
        api_key: str,
        session_id: str,
        stream_id: str,
        text: str,
        voice_id: Optional[str] = None,
    ) -> dict:
        """
        Make the avatar speak the given text.
        POST /talks/streams/{stream_id}
        """
        headers = {**_auth_header(api_key), "Content-Type": "application/json"}
        script: dict = {
            "type": "text",
            "input": text,
        }
        if voice_id:
            script["provider"] = {
                "type": "microsoft",
                "voice_id": voice_id,
            }

        payload = {
            "script": script,
            "session_id": session_id,
            "config": {"fluent": True, "pad_audio": 0},
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_DID_BASE}/talks/streams/{stream_id}",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    @staticmethod
    async def close_session(api_key: str, session_id: str, stream_id: str):
        """
        Terminate a D-ID streaming session.
        DELETE /talks/streams/{stream_id}
        """
        headers = {**_auth_header(api_key), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(
                f"{_DID_BASE}/talks/streams/{stream_id}",
                headers=headers,
                json={"session_id": session_id},
            )
            # 200 or 204 are both acceptable
            if resp.status_code not in (200, 204):
                resp.raise_for_status()

    # Featured avatars — shown in admin UI when API list is unavailable
    FEATURED_AVATARS = [
        {
            "id": "rian-lFJH6K3P7P",
            "name": "Rian (Male)",
            "gender": "male",
            "preview_image_url": "https://create-images-results.d-id.com/DefaultPresenters/Rian_f/image.jpeg",
        },
        {
            "id": "amber-inlhe5eM0e",
            "name": "Amber (Female)",
            "gender": "female",
            "preview_image_url": "https://create-images-results.d-id.com/DefaultPresenters/Amber_f/image.jpeg",
        },
    ]

    @staticmethod
    async def list_avatars(api_key: str) -> list[dict]:
        """
        Return featured avatars (Rian + Amber) plus any additional presenters
        from the D-ID Clips Presenters API.
        """
        result = list(DIDProvider.FEATURED_AVATARS)
        featured_ids = {a["id"] for a in result}

        try:
            headers = _auth_header(api_key)
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{_DID_BASE}/clips/presenters",
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    presenters = data if isinstance(data, list) else data.get("presenters", [])
                    for p in presenters:
                        pid = p.get("id", p.get("presenter_id", ""))
                        if pid and pid not in featured_ids:
                            result.append({
                                "id": pid,
                                "name": p.get("name", p.get("presenter_name", "Unknown")),
                                "preview_image_url": p.get("thumbnail_url", p.get("image_url")),
                            })
        except Exception:
            pass  # Return featured avatars even if API call fails

        return result
