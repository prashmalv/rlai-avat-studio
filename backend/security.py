"""
security.py — Input sanitisation and output safety checks.

Provides four functions used by the chat endpoint:
  - check_injection(text)  → raises ValueError if prompt injection is detected
  - sanitize_input(text)   → strips dangerous patterns, returns clean string
  - check_output_leak(text) → raises ValueError if output contains leaked data
  - sanitize_output(text)  → strips any leaked secrets from LLM response

Patterns cover 20+ categories of prompt injection, jailbreak attempts, and
data-exfiltration techniques observed in production deployments.
"""

import re
from typing import Optional


# ---------------------------------------------------------------------------
# Pattern banks
# ---------------------------------------------------------------------------

_INJECTION_PATTERNS = [
    # Classic "ignore previous instructions" variants
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.I),
    re.compile(r"disregard\s+(all\s+)?previous\s+(instructions?|context)", re.I),
    re.compile(r"forget\s+(everything|all|what|your)\s+(you\s+)?(were|have|know)", re.I),
    re.compile(r"you\s+are\s+now\s+(a\s+)?(?!helpful)", re.I),
    re.compile(r"pretend\s+(you\s+are|to\s+be)\s+", re.I),
    re.compile(r"act\s+as\s+(if\s+you\s+(are|were)|a\s+)", re.I),
    # Role-play / persona hijacking
    re.compile(r"from\s+now\s+on\s+(you\s+are|act\s+as|behave)", re.I),
    re.compile(r"your\s+(new\s+)?role\s+is", re.I),
    re.compile(r"your\s+(new\s+)?persona\s+is", re.I),
    re.compile(r"you\s+must\s+(never|always)\s+", re.I),
    # System prompt / context extraction
    re.compile(r"(reveal|show|print|output|repeat|display)\s+(your\s+)?(system\s+prompt|instructions?|context)", re.I),
    re.compile(r"what\s+(are|were)\s+your\s+(original\s+)?(instructions?|system\s+prompt)", re.I),
    re.compile(r"tell\s+me\s+(your\s+)?(system\s+prompt|instructions?|initial\s+prompt)", re.I),
    # Jailbreak / DAN / STAN
    re.compile(r"\bDAN\b"),
    re.compile(r"\bSTAN\b"),
    re.compile(r"jailbreak", re.I),
    re.compile(r"developer\s+mode", re.I),
    re.compile(r"god\s+mode", re.I),
    # Override / overwrite
    re.compile(r"override\s+(the\s+)?(system|safety|guidelines?|rules?)", re.I),
    re.compile(r"bypass\s+(the\s+)?(system|safety|filter|guidelines?)", re.I),
    # Indirect injection via separators
    re.compile(r"---+\s*(system|user|assistant)\s*:"),
    re.compile(r"<(system|user|assistant)>"),
    re.compile(r"\[SYSTEM\]|\[USER\]|\[INST\]|\[\/INST\]", re.I),
    # Data exfiltration probes
    re.compile(r"send\s+(this|that|the\s+above|everything)\s+to\s+(http|www)", re.I),
    re.compile(r"base64\s+(encode|decode)\s+(and\s+)?(send|return|output)", re.I),
]

_SENSITIVE_OUTPUT_PATTERNS = [
    # API keys / secrets
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"ANTHROPIC_API_KEY\s*=\s*\S+", re.I),
    re.compile(r"[A-Za-z0-9]{32,}"),   # generic long tokens — conservative
    # System prompt markers
    re.compile(r"(you\s+are\s+an\s+AI\s+assistant|you\s+are\s+Avtar)", re.I),
]

_STRIP_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.I),
    re.compile(r"<[^>]{0,100}>"),   # strip XML-like injection tags
    re.compile(r"\[SYSTEM\]|\[USER\]|\[INST\]|\[\/INST\]", re.I),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_injection(text: str) -> None:
    """
    Raise ValueError with a safe message if prompt injection is detected.
    Does NOT reveal which pattern matched (avoids giving attacker a roadmap).
    """
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            raise ValueError(
                "Your message contains content that cannot be processed. "
                "Please rephrase your question."
            )


def sanitize_input(text: str) -> str:
    """
    Strip obvious injection fragments and normalise whitespace.
    Returns a cleaned string. Does not raise even on malicious input.
    """
    result = text
    for pattern in _STRIP_PATTERNS:
        result = pattern.sub(" ", result)
    # Collapse repeated whitespace
    result = re.sub(r"\s{2,}", " ", result).strip()
    # Hard length cap
    return result[:4000]


def check_output_leak(text: str) -> None:
    """
    Raise ValueError if the LLM response appears to contain leaked secrets
    or system-prompt content. This is a last-resort safety net.
    """
    # Only check for actual API key patterns (sk- prefix), not generic tokens
    api_key_patterns = [
        re.compile(r"sk-[A-Za-z0-9]{20,}"),
        re.compile(r"ANTHROPIC_API_KEY\s*=\s*\S+", re.I),
        re.compile(r"HEYGEN_API_KEY\s*=\s*\S+", re.I),
        re.compile(r"ELEVENLABS_API_KEY\s*=\s*\S+", re.I),
    ]
    for pattern in api_key_patterns:
        if pattern.search(text):
            raise ValueError("Response filtered for security reasons.")


def sanitize_output(text: str) -> str:
    """
    Remove any API-key-like tokens that the LLM may have leaked.
    Returns a cleaned string safe to return to the user.
    """
    result = text
    # Redact anything that looks like an API key
    result = re.sub(r"sk-[A-Za-z0-9]{20,}", "[REDACTED]", result)
    result = re.sub(r"(ANTHROPIC|HEYGEN|ELEVENLABS|DID|SIMLI|SARVAM)_API_KEY\s*=\s*\S+", "[REDACTED]", result, flags=re.I)
    return result
