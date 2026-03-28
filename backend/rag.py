"""
rag.py — Retrieval-Augmented Generation pipeline (per-bot).

Architecture
------------
1. Documents are stored on disk in UPLOADS_DIR and tracked in the DB per bot.
2. Only documents where is_active=True are included in each bot's vector index.
3. A SHA-1 hash of sorted active-document IDs detects when the set changes;
   the ChromaDB collection for that bot is rebuilt only then.
4. Embeddings use sentence-transformers all-MiniLM-L6-v2 (runs locally).
5. The LLM can be: ollama | anthropic | bedrock (configured per-call).
6. If a bot has a knowledge_prompt, it is included as an extra document chunk.

Per-bot state is keyed by bot_id. Each bot gets its own ChromaDB collection
named "bot_{bot_id}". The module tracks a hash per bot_id to detect changes.

File parsing
------------
- .pdf  → pdfplumber primary, pypdf as fallback
- .md   → markdown → strip tags, keep plain text
- .txt  → read directly
- .json → json.dumps for readability
"""

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Document

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_chroma_client: Optional[chromadb.Client] = None
_embed_fn = None
_uploads_dir: Path = Path(os.getenv("UPLOADS_DIR", "./uploads"))

# Per-bot hash tracking: {bot_id: hash_string}
_bot_doc_hashes: dict[str, str] = {}


def _get_embed_fn():
    global _embed_fn
    if _embed_fn is None:
        _embed_fn = SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
    return _embed_fn


def _get_chroma() -> chromadb.Client:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.Client()  # in-memory
    return _chroma_client


def _hash_doc_ids(doc_ids: list[str], knowledge_prompt: Optional[str] = None) -> str:
    joined = ",".join(sorted(doc_ids))
    if knowledge_prompt:
        joined += f"|prompt:{hashlib.sha1(knowledge_prompt.encode()).hexdigest()}"
    return hashlib.sha1(joined.encode()).hexdigest()


# ---------------------------------------------------------------------------
# File text extraction
# ---------------------------------------------------------------------------

def _extract_text_pdf(path: Path) -> str:
    """Try pdfplumber first, fall back to pypdf."""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            parts = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    parts.append(text)
        return "\n".join(parts)
    except Exception as e:
        logger.warning("pdfplumber failed (%s), trying pypdf", e)
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
        return "\n".join(parts)
    except Exception as e:
        logger.error("pypdf also failed: %s", e)
        return ""


def _extract_text_md(path: Path) -> str:
    import re
    try:
        import markdown as md_lib
        raw = path.read_text(encoding="utf-8", errors="replace")
        html = md_lib.markdown(raw)
        plain = re.sub(r"<[^>]+>", " ", html)
        return plain
    except Exception:
        return path.read_text(encoding="utf-8", errors="replace")


def _extract_text(doc: Document) -> str:
    file_path = _uploads_dir / doc.filename
    if not file_path.exists():
        logger.warning("File not found: %s", file_path)
        return ""

    ft = doc.file_type.lower()
    try:
        if ft == "pdf":
            return _extract_text_pdf(file_path)
        elif ft == "md":
            return _extract_text_md(file_path)
        elif ft == "txt":
            return file_path.read_text(encoding="utf-8", errors="replace")
        elif ft == "json":
            data = json.loads(file_path.read_text(encoding="utf-8", errors="replace"))
            return json.dumps(data, indent=2)
        else:
            return file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.error("Text extraction failed for %s: %s", doc.filename, e)
        return ""


def extract_preview(doc: Document, max_chars: int = 500) -> str:
    """Return first max_chars characters of extracted text (for preview API)."""
    text = _extract_text(doc)
    return text[:max_chars]


# ---------------------------------------------------------------------------
# Index building
# ---------------------------------------------------------------------------

def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks for better retrieval."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i : i + chunk_size]
        chunks.append(" ".join(chunk_words))
        i += chunk_size - overlap
    return [c for c in chunks if c.strip()]


def _collection_name(bot_id: str) -> str:
    # ChromaDB collection names must be 3-63 chars, alphanumeric + hyphens/underscores
    safe = bot_id.replace("-", "_")
    return f"bot_{safe}"[:63]


async def _rebuild_index_for_bot(
    bot_id: str,
    active_docs: list[Document],
    knowledge_prompt: Optional[str] = None,
):
    """Recreate the ChromaDB collection for a specific bot."""
    client = _get_chroma()
    embed_fn = _get_embed_fn()
    coll_name = _collection_name(bot_id)

    try:
        client.delete_collection(coll_name)
    except Exception:
        pass

    collection = client.create_collection(
        name=coll_name,
        embedding_function=embed_fn,
    )

    all_texts: list[str] = []
    all_ids: list[str] = []
    all_meta: list[dict] = []

    # Add knowledge prompt as a synthetic document first
    if knowledge_prompt and knowledge_prompt.strip():
        chunks = _chunk_text(knowledge_prompt)
        for idx, chunk in enumerate(chunks):
            all_texts.append(chunk)
            all_ids.append(f"prompt_{bot_id}_{idx}")
            all_meta.append({"doc_id": "knowledge_prompt", "filename": "knowledge_prompt", "chunk": idx})

    for doc in active_docs:
        text = _extract_text(doc)
        if not text.strip():
            continue
        chunks = _chunk_text(text)
        for idx, chunk in enumerate(chunks):
            all_texts.append(chunk)
            all_ids.append(f"{doc.id}_{idx}")
            all_meta.append({"doc_id": doc.id, "filename": doc.original_name, "chunk": idx})

    if all_texts:
        batch_size = 100
        for start in range(0, len(all_texts), batch_size):
            collection.add(
                documents=all_texts[start : start + batch_size],
                ids=all_ids[start : start + batch_size],
                metadatas=all_meta[start : start + batch_size],
            )

    logger.info(
        "Rebuilt index for bot %s: %d chunks from %d docs (prompt=%s).",
        bot_id, len(all_texts), len(active_docs), bool(knowledge_prompt),
    )


async def rebuild_index_for_bot(
    bot_id: str,
    active_docs: list[Document],
    knowledge_prompt: Optional[str] = None,
):
    """
    Public API: force rebuild the RAG index for a specific bot.
    Call this after uploading/toggling/deleting documents or updating knowledge_prompt.
    """
    await _rebuild_index_for_bot(bot_id, active_docs, knowledge_prompt)
    doc_ids = [d.id for d in active_docs]
    _bot_doc_hashes[bot_id] = _hash_doc_ids(doc_ids, knowledge_prompt)


async def ensure_index_for_bot(
    bot_id: str,
    db: AsyncSession,
    knowledge_prompt: Optional[str] = None,
):
    """
    Ensure the bot's index is up to date. Rebuilds only when the active
    document set or knowledge_prompt has changed.
    """
    result = await db.execute(
        select(Document).where(
            Document.bot_id == bot_id,
            Document.is_active == True,
        )
    )
    active_docs = list(result.scalars().all())
    doc_ids = [d.id for d in active_docs]
    new_hash = _hash_doc_ids(doc_ids, knowledge_prompt)

    if _bot_doc_hashes.get(bot_id) != new_hash:
        logger.info("Bot %s: documents changed — rebuilding RAG index.", bot_id)
        await _rebuild_index_for_bot(bot_id, active_docs, knowledge_prompt)
        _bot_doc_hashes[bot_id] = new_hash


def _get_collection_for_bot(bot_id: str):
    """Return the ChromaDB collection for a bot, or None if it doesn't exist."""
    client = _get_chroma()
    coll_name = _collection_name(bot_id)
    try:
        return client.get_collection(coll_name, embedding_function=_get_embed_fn())
    except Exception:
        return None


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------

async def _call_ollama(prompt: str, system: str) -> str:
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


async def _call_anthropic(prompt: str, system: str) -> str:
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


async def _call_openai_compat(prompt: str, system: str, base_url: str, api_key: str, model: str) -> str:
    """Shared handler for OpenAI-compatible APIs (OpenAI, Groq, Together, etc.)."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    resp = await client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content or ""


async def _call_bedrock(prompt: str, system: str) -> str:
    import boto3
    import json as _json
    model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
    region = os.getenv("AWS_REGION", "us-east-1")
    bedrock = boto3.client("bedrock-runtime", region_name=region)
    body = _json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
    })
    response = bedrock.invoke_model(modelId=model_id, body=body)
    result = _json.loads(response["body"].read())
    return result["content"][0]["text"]


# ---------------------------------------------------------------------------
# Public query interface
# ---------------------------------------------------------------------------

async def query(
    question: str,
    db: AsyncSession,
    bot_id: str,
    llm_provider: str = "ollama",
    system_prompt: Optional[str] = None,
    knowledge_prompt: Optional[str] = None,
    top_k: int = 5,
) -> str:
    """
    Main RAG entry point for a specific bot. Ensures the bot's index is
    current, retrieves relevant chunks, and calls the configured LLM.
    """
    await ensure_index_for_bot(bot_id, db, knowledge_prompt)

    context_text = ""
    collection = _get_collection_for_bot(bot_id)
    if collection is not None:
        try:
            results = collection.query(query_texts=[question], n_results=min(top_k, 10))
            docs_list = results.get("documents", [[]])[0]
            if docs_list:
                context_text = "\n\n---\n\n".join(docs_list)
        except Exception as e:
            logger.warning("ChromaDB query failed for bot %s: %s", bot_id, e)

    default_system = (
        "You are a warm and helpful AI assistant who speaks both Hindi and English fluently. "
        "Respond in the same language the user writes in — Hindi for Hindi queries, English for English queries. "
        "Be conversational, friendly, and natural — like a knowledgeable person having a real conversation. "
        "Answer questions accurately based on the provided context. "
        "If the context does not contain enough information, say so naturally and help from your general knowledge. "
        "Never ask the user to follow a specific format or restrict questions to a topic."
    )
    system = system_prompt if system_prompt else default_system

    if context_text:
        prompt = (
            f"Context from knowledge base:\n{context_text}\n\n"
            f"Question: {question}\n\n"
            "Please answer the question based on the context above."
        )
    else:
        prompt = question

    try:
        provider = llm_provider.lower()
        if provider == "anthropic":
            return await _call_anthropic(prompt, system)
        elif provider == "bedrock":
            return await _call_bedrock(prompt, system)
        elif provider == "groq":
            return await _call_openai_compat(
                prompt, system,
                base_url="https://api.groq.com/openai/v1",
                api_key=os.getenv("GROQ_API_KEY", ""),
                model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            )
        elif provider == "openai":
            return await _call_openai_compat(
                prompt, system,
                base_url="https://api.openai.com/v1",
                api_key=os.getenv("OPENAI_API_KEY", ""),
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            )
        elif provider == "together":
            return await _call_openai_compat(
                prompt, system,
                base_url="https://api.together.xyz/v1",
                api_key=os.getenv("TOGETHER_API_KEY", ""),
                model=os.getenv("TOGETHER_MODEL", "mistralai/Mixtral-8x7B-Instruct-v0.1"),
            )
        else:
            return await _call_ollama(prompt, system)
    except Exception as e:
        logger.error("LLM call failed (%s) for bot %s: %s", llm_provider, bot_id, e)
        return (
            "I'm sorry, I encountered an issue processing your request. "
            "Please try again in a moment."
        )
