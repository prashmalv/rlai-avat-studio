"""
analytics.py — Session analytics generation.

After a conversation session ends, generate_session_analytics() asks the
configured LLM to analyse the full conversation transcript and produce a
structured JSON blob covering:
  - sentiment (positive / neutral / negative)
  - lead_score (0–100)
  - intent (enquiry / complaint / purchase_intent / support / other)
  - topics (list of keywords)
  - concerns (list of expressed concerns)
  - recommended_actions (list of follow-up suggestions)

aggregate_summary() computes aggregated statistics across multiple sessions
for the reports dashboard.
"""

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _llm_call(prompt: str, system: str, llm_provider: str) -> str:
    """Minimal LLM call reusing the same provider logic as rag.py."""
    provider = llm_provider.lower()

    if provider == "anthropic":
        import anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        client = anthropic.AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text

    elif provider == "bedrock":
        import boto3
        model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
        region = os.getenv("AWS_REGION", "us-east-1")
        bedrock = boto3.client("bedrock-runtime", region_name=region)
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        })
        response = bedrock.invoke_model(modelId=model_id, body=body)
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    else:  # ollama
        import httpx
        host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        model = os.getenv("OLLAMA_MODEL", "llama3.1")
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{host}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"]


def _extract_json(text: str) -> dict:
    """Extract JSON object from LLM response, handling markdown fences."""
    import re
    # Try to find JSON block
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Try to parse the whole response
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
    except json.JSONDecodeError:
        pass
    return {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_session_analytics(
    messages: list[dict],  # list of {"role": ..., "content": ...}
    llm_provider: str = "ollama",
) -> dict[str, Any]:
    """
    Analyse a conversation transcript with the LLM.
    Returns a dict with keys: sentiment, lead_score, intent, topics,
    concerns, recommended_actions, summary.
    """
    if not messages:
        return _empty_analytics()

    transcript = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )

    system = (
        "You are a conversation analytics expert. Analyse the provided customer "
        "service conversation transcript and return ONLY a valid JSON object. "
        "Do not include any explanation outside the JSON."
    )

    prompt = f"""Analyse this conversation and return a JSON object with exactly these keys:
- sentiment: "positive", "neutral", or "negative"
- lead_score: integer 0-100 (likelihood of conversion/engagement)
- intent: one of "enquiry", "complaint", "purchase_intent", "support", "other"
- topics: list of up to 5 keyword strings representing main topics discussed
- concerns: list of up to 3 strings describing customer concerns raised
- recommended_actions: list of up to 3 actionable follow-up suggestions
- summary: one sentence summary of the conversation

Conversation transcript:
{transcript}

Return ONLY the JSON object, no other text."""

    try:
        raw = await _llm_call(prompt, system, llm_provider)
        result = _extract_json(raw)
        return _validate_analytics(result)
    except Exception as e:
        logger.error("Analytics generation failed: %s", e)
        return _empty_analytics()


def _empty_analytics() -> dict:
    return {
        "sentiment": "neutral",
        "lead_score": 0,
        "intent": "other",
        "topics": [],
        "concerns": [],
        "recommended_actions": [],
        "summary": "No conversation data available.",
    }


def _validate_analytics(data: dict) -> dict:
    """Ensure all expected keys exist with valid types."""
    valid_sentiments = {"positive", "neutral", "negative"}
    valid_intents = {"enquiry", "complaint", "purchase_intent", "support", "other"}

    return {
        "sentiment": data.get("sentiment", "neutral") if data.get("sentiment") in valid_sentiments else "neutral",
        "lead_score": max(0, min(100, int(data.get("lead_score", 0) or 0))),
        "intent": data.get("intent", "other") if data.get("intent") in valid_intents else "other",
        "topics": list(data.get("topics", []))[:5],
        "concerns": list(data.get("concerns", []))[:3],
        "recommended_actions": list(data.get("recommended_actions", []))[:3],
        "summary": str(data.get("summary", ""))[:500],
    }


def aggregate_summary(sessions_analytics: list[dict]) -> dict:
    """
    Compute platform-wide aggregated statistics from a list of analytics dicts.
    Used by the GET /api/reports/summary endpoint.
    """
    if not sessions_analytics:
        return {
            "total_sessions": 0,
            "sentiment_breakdown": {"positive": 0, "neutral": 0, "negative": 0},
            "avg_lead_score": 0.0,
            "intent_breakdown": {},
            "top_topics": [],
            "common_concerns": [],
        }

    total = len(sessions_analytics)
    sentiment_counts: dict[str, int] = {"positive": 0, "neutral": 0, "negative": 0}
    intent_counts: dict[str, int] = {}
    all_topics: list[str] = []
    all_concerns: list[str] = []
    lead_scores: list[int] = []

    for a in sessions_analytics:
        s = a.get("sentiment", "neutral")
        sentiment_counts[s] = sentiment_counts.get(s, 0) + 1

        intent = a.get("intent", "other")
        intent_counts[intent] = intent_counts.get(intent, 0) + 1

        all_topics.extend(a.get("topics", []))
        all_concerns.extend(a.get("concerns", []))

        score = a.get("lead_score", 0)
        if isinstance(score, (int, float)):
            lead_scores.append(int(score))

    # Top topics by frequency
    from collections import Counter
    topic_counter = Counter(all_topics)
    concern_counter = Counter(all_concerns)

    return {
        "total_sessions": total,
        "sentiment_breakdown": sentiment_counts,
        "avg_lead_score": round(sum(lead_scores) / len(lead_scores), 1) if lead_scores else 0.0,
        "intent_breakdown": intent_counts,
        "top_topics": [t for t, _ in topic_counter.most_common(10)],
        "common_concerns": [c for c, _ in concern_counter.most_common(5)],
    }
