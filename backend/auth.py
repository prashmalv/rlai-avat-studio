"""auth.py — Simple JWT authentication for admin panel."""
import os
import hmac
import hashlib
import time
import base64
import json

# Hardcoded credentials (single admin user)
ADMIN_EMAIL = "pm@rightleft.ai"
ADMIN_PASSWORD = "admin@rlai"

def _secret() -> bytes:
    return os.getenv("SECRET_KEY", "change-me-in-production").encode()

def create_token(email: str) -> str:
    """Create a simple signed token: base64(payload).base64(sig)"""
    payload = json.dumps({"email": email, "iat": int(time.time())}).encode()
    sig = hmac.new(_secret(), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload).decode() + "." + base64.urlsafe_b64encode(sig).decode()

def verify_token(token: str) -> dict | None:
    """Verify token signature. Returns payload dict or None."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_bytes = base64.urlsafe_b64decode(parts[0] + "==")
        expected_sig = hmac.new(_secret(), payload_bytes, hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(parts[1] + "==")
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        return json.loads(payload_bytes)
    except Exception:
        return None

def check_credentials(email: str, password: str) -> bool:
    return email == ADMIN_EMAIL and password == ADMIN_PASSWORD
