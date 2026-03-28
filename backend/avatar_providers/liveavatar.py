"""
avatar_providers/liveavatar.py — HeyGen LiveAvatar provider stub.

The actual session token is issued via /api/avatars/liveavatar/token in main.py.
This class only provides the registry metadata (name, display_name, requires_keys).
"""

import os


class LiveAvatarProvider:
    name = "liveavatar"
    display_name = "LiveAvatar (HeyGen)"
    requires_keys = ["LIVEAVATAR_API_KEY"]

    @classmethod
    async def list_avatars(cls, api_key: str) -> list:
        """Return the two confirmed LiveAvatar avatar UUIDs."""
        return [
            {
                "avatar_id": "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb",
                "avatar_name": "Priya",
                "preview_image_url": None,
                "gender": "F",
            },
            {
                "avatar_id": "7a517e8e-b41f-49e7-b6b3-2cdfb4bbff1e",
                "avatar_name": "Arjun",
                "preview_image_url": None,
                "gender": "M",
            },
        ]
