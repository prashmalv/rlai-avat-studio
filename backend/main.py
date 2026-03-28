"""
main.py — FastAPI application entry point for the Avataar Platform backend.

On startup:
  1. Load .env from the same directory as this file.
  2. Initialise the SQLAlchemy async engine and create all DB tables.

Route groups
------------
  /api/bots             — multi-bot CRUD + per-bot document management
  /api/avatars          — avatar provider proxy & session management
  /api/voices           — voice provider proxy & TTS
  /api/session          — conversation session lifecycle (bot-aware)
  /api/chat             — RAG-augmented chat endpoint
  /api/analytics        — per-session analytics
  /api/reports          — aggregated reports
  /health               — liveness probe
"""

import base64
import json
import logging
import os
import uuid
import httpx
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Load .env before importing modules that read env vars
load_dotenv(Path(__file__).parent / ".env")

import analytics as analytics_module
import rag
import security
from avatar_providers import PROVIDERS, get_provider
from bot_service import (
    count_bot_documents,
    create_bot,
    delete_bot,
    get_bot,
    get_bot_by_slug,
    list_bots,
    update_bot,
)
from database import (
    Bot,
    ConversationSession,
    Document,
    Message,
    create_all_tables,
    get_db,
    init_db_engine,
)
from voice_providers import VOICE_PROVIDERS, get_voice_provider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", "./uploads"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./avataar_platform.db")

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

LLM_PROVIDER_DEFAULT = os.getenv("LLM_PROVIDER", "ollama")


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialise DB. Shutdown: nothing special needed."""
    init_db_engine(DATABASE_URL)
    await create_all_tables()
    logger.info("Database initialised.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Avataar Platform API",
    version="2.0.0",
    description="Multi-bot AI Avatar Platform backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CreateBotRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateBotRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_provider: Optional[str] = None
    avatar_id: Optional[str] = None
    avatar_name: Optional[str] = None
    avatar_preview_url: Optional[str] = None
    voice_provider: Optional[str] = None
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None
    knowledge_prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    bot_name: Optional[str] = None
    greeting_en: Optional[str] = None
    greeting_hi: Optional[str] = None
    theme_color: Optional[str] = None
    is_active: Optional[bool] = None


class SessionStartRequest(BaseModel):
    bot_slug: str
    customer_name: Optional[str] = None
    channel: str = "web"


class SessionEndRequest(BaseModel):
    session_id: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    language: str = "en"


class SDPAnswerRequest(BaseModel):
    session_id: str
    answer: dict


class ICECandidateRequest(BaseModel):
    session_id: str
    candidate: dict


class SpeakRequest(BaseModel):
    session_id: str
    text: str
    voice_id: Optional[str] = None


class SimliTokenRequest(BaseModel):
    face_id: str


class DIDSessionRequest(BaseModel):
    avatar_id: str


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str
    language: Optional[str] = "en-IN"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bot_to_dict(bot: Bot, doc_count: int = 0) -> dict:
    return {
        "id": bot.id,
        "name": bot.name,
        "slug": bot.slug,
        "description": bot.description,
        "avatar_provider": bot.avatar_provider,
        "avatar_id": bot.avatar_id,
        "avatar_name": bot.avatar_name,
        "avatar_preview_url": bot.avatar_preview_url,
        "voice_provider": bot.voice_provider,
        "voice_id": bot.voice_id,
        "voice_name": bot.voice_name,
        "knowledge_prompt": bot.knowledge_prompt,
        "system_prompt": bot.system_prompt,
        "bot_name": bot.bot_name,
        "greeting_en": bot.greeting_en,
        "greeting_hi": bot.greeting_hi,
        "theme_color": bot.theme_color,
        "is_active": bot.is_active,
        "created_at": bot.created_at.isoformat() if bot.created_at else None,
        "updated_at": bot.updated_at.isoformat() if bot.updated_at else None,
        "doc_count": doc_count,
    }


def _bot_public_dict(bot: Bot) -> dict:
    """Return only non-sensitive fields for the public widget."""
    return {
        "id": bot.id,
        "name": bot.name,
        "slug": bot.slug,
        "avatar_provider": bot.avatar_provider,
        "avatar_id": bot.avatar_id,
        "avatar_name": bot.avatar_name,
        "avatar_preview_url": bot.avatar_preview_url,
        "voice_provider": bot.voice_provider,
        "voice_id": bot.voice_id,
        "voice_name": bot.voice_name,
        "bot_name": bot.bot_name,
        "greeting_en": bot.greeting_en,
        "greeting_hi": bot.greeting_hi,
        "theme_color": bot.theme_color,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "avataar-platform"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    from auth import check_credentials, create_token
    if not check_credentials(req.email, req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(req.email), "email": req.email}

@app.get("/api/auth/me")
async def me(authorization: Optional[str] = Header(default=None)):
    from auth import verify_token
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = verify_token(authorization[7:])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"email": payload.get("email")}


# ---------------------------------------------------------------------------
# Bot CRUD
# ---------------------------------------------------------------------------

@app.post("/api/bots")
async def api_create_bot(
    body: CreateBotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new bot. Slug is auto-generated from the name."""
    kwargs = {}
    if body.description:
        kwargs["description"] = body.description
    bot = await create_bot(db, body.name, **kwargs)
    return _bot_to_dict(bot)


@app.get("/api/bots")
async def api_list_bots(db: AsyncSession = Depends(get_db)):
    """List all bots with document counts."""
    bots = await list_bots(db)
    result = []
    for bot in bots:
        # Count active documents
        doc_result = await db.execute(
            select(Document).where(
                Document.bot_id == bot.id,
                Document.is_active == True,
            )
        )
        doc_count = len(doc_result.scalars().all())
        result.append(_bot_to_dict(bot, doc_count))
    return {"bots": result}


@app.get("/api/bots/slug/{slug}")
async def api_get_bot_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    """Get a bot by its slug (public endpoint — only returns non-sensitive fields)."""
    bot = await get_bot_by_slug(db, slug)
    if not bot:
        raise HTTPException(status_code=404, detail=f"Bot not found: {slug}")
    if not bot.is_active:
        raise HTTPException(status_code=404, detail="Bot is not active.")
    return _bot_public_dict(bot)


@app.get("/api/bots/{bot_id}")
async def api_get_bot(bot_id: str, db: AsyncSession = Depends(get_db)):
    """Get full bot configuration."""
    bot = await get_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")
    doc_result = await db.execute(
        select(Document).where(
            Document.bot_id == bot.id,
            Document.is_active == True,
        )
    )
    doc_count = len(doc_result.scalars().all())
    return _bot_to_dict(bot, doc_count)


@app.put("/api/bots/{bot_id}")
async def api_update_bot(
    bot_id: str,
    body: UpdateBotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update bot configuration. Only provided fields are changed."""
    kwargs = {k: v for k, v in body.model_dump().items() if v is not None}
    bot = await update_bot(db, bot_id, **kwargs)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")

    # Trigger RAG index rebuild if knowledge settings changed
    knowledge_fields = {"knowledge_prompt"}
    if any(k in kwargs for k in knowledge_fields):
        doc_result = await db.execute(
            select(Document).where(
                Document.bot_id == bot_id,
                Document.is_active == True,
            )
        )
        active_docs = list(doc_result.scalars().all())
        await rag.rebuild_index_for_bot(bot_id, active_docs, bot.knowledge_prompt)

    doc_result2 = await db.execute(
        select(Document).where(Document.bot_id == bot.id, Document.is_active == True)
    )
    doc_count = len(doc_result2.scalars().all())
    return _bot_to_dict(bot, doc_count)


@app.delete("/api/bots/{bot_id}")
async def api_delete_bot(bot_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a bot and all its documents."""
    # Delete on-disk files for this bot's documents
    doc_result = await db.execute(
        select(Document).where(Document.bot_id == bot_id)
    )
    docs = doc_result.scalars().all()
    for doc in docs:
        file_path = UPLOADS_DIR / doc.filename
        if file_path.exists():
            file_path.unlink()

    deleted = await delete_bot(db, bot_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Bot not found.")
    return {"deleted": True, "id": bot_id}


# ---------------------------------------------------------------------------
# Bot Documents
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {"pdf", "md", "txt", "json"}


@app.post("/api/bots/{bot_id}/documents/upload")
async def upload_bot_document(
    bot_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document to a bot's knowledge base."""
    bot = await get_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    doc_id = str(uuid.uuid4())
    safe_filename = f"{doc_id}_{file.filename}"
    file_path = UPLOADS_DIR / safe_filename

    content = await file.read()
    file_path.write_bytes(content)

    doc = Document(
        id=doc_id,
        bot_id=bot_id,
        filename=safe_filename,
        original_name=file.filename,
        file_type=ext,
        file_size=len(content),
        is_active=True,
        description=description,
        uploaded_at=datetime.utcnow(),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Rebuild RAG index for this bot
    doc_result = await db.execute(
        select(Document).where(
            Document.bot_id == bot_id,
            Document.is_active == True,
        )
    )
    active_docs = list(doc_result.scalars().all())
    await rag.rebuild_index_for_bot(bot_id, active_docs, bot.knowledge_prompt)

    return {
        "id": doc.id,
        "bot_id": doc.bot_id,
        "filename": doc.filename,
        "original_name": doc.original_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "is_active": doc.is_active,
        "description": doc.description,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
    }


@app.get("/api/bots/{bot_id}/documents")
async def list_bot_documents(bot_id: str, db: AsyncSession = Depends(get_db)):
    """List all documents for a bot."""
    bot = await get_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")

    result = await db.execute(
        select(Document)
        .where(Document.bot_id == bot_id)
        .order_by(Document.uploaded_at.desc())
    )
    docs = result.scalars().all()
    return {
        "documents": [
            {
                "id": d.id,
                "bot_id": d.bot_id,
                "filename": d.filename,
                "original_name": d.original_name,
                "file_type": d.file_type,
                "file_size": d.file_size,
                "is_active": d.is_active,
                "description": d.description,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            }
            for d in docs
        ]
    }


@app.post("/api/bots/{bot_id}/generate-suggestions")
async def generate_bot_suggestions(bot_id: str, db: AsyncSession = Depends(get_db)):
    """Auto-generate a system prompt and FAQ suggestions from the bot's indexed knowledge base."""
    import json as _json
    bot = await get_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")

    collection = rag._get_collection_for_bot(bot_id)
    if collection is None:
        raise HTTPException(status_code=400, detail="Knowledge base not indexed. Upload documents first.")

    try:
        results = collection.query(query_texts=["overview introduction summary purpose"], n_results=8)
        docs_list = results.get("documents", [[]])[0]
        sample = "\n\n".join(docs_list)[:4000]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Knowledge base query failed: {e}")

    gen_prompt = (
        "Based on this document content, generate:\n"
        "1. A system_prompt (3-5 sentences) for a bilingual (Hindi+English) AI assistant named Priya.\n"
        "2. Exactly 8 frequently asked questions with short answers.\n\n"
        f"Document:\n{sample}\n\n"
        'Return ONLY valid JSON (no markdown, no extra text):\n'
        '{"system_prompt":"...","faqs":[{"q":"...","a":"..."}]}'
    )
    llm_provider = LLM_PROVIDER_DEFAULT.lower()
    try:
        if llm_provider == "groq":
            result_text = await rag._call_openai_compat(
                gen_prompt, "You output only valid JSON. No markdown. No explanation.",
                base_url="https://api.groq.com/openai/v1",
                api_key=os.getenv("GROQ_API_KEY", ""),
                model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            )
        elif llm_provider == "anthropic":
            result_text = await rag._call_anthropic(gen_prompt, "Output only valid JSON.")
        else:
            raise ValueError(f"LLM provider {llm_provider} not supported for suggestions")

        result_text = result_text.strip()
        if "```" in result_text:
            parts = result_text.split("```")
            result_text = parts[1] if len(parts) > 1 else parts[0]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        return _json.loads(result_text.strip())
    except _json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {e}")
    except Exception as e:
        logger.error("generate_suggestions failed for bot %s: %s", bot_id, e)
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


@app.patch("/api/bots/{bot_id}/documents/{doc_id}/toggle")
async def toggle_bot_document(
    bot_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Toggle the is_active flag for a document."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.bot_id == bot_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc.is_active = not doc.is_active
    await db.commit()
    await db.refresh(doc)

    # Rebuild RAG index for this bot
    bot = await get_bot(db, bot_id)
    doc_result = await db.execute(
        select(Document).where(
            Document.bot_id == bot_id,
            Document.is_active == True,
        )
    )
    active_docs = list(doc_result.scalars().all())
    await rag.rebuild_index_for_bot(
        bot_id, active_docs, bot.knowledge_prompt if bot else None
    )

    return {
        "id": doc.id,
        "bot_id": doc.bot_id,
        "is_active": doc.is_active,
        "original_name": doc.original_name,
    }


@app.delete("/api/bots/{bot_id}/documents/{doc_id}")
async def delete_bot_document(
    bot_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a document from the DB and disk."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.bot_id == bot_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    file_path = UPLOADS_DIR / doc.filename
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    await db.commit()

    # Rebuild RAG index for this bot
    bot = await get_bot(db, bot_id)
    doc_result = await db.execute(
        select(Document).where(
            Document.bot_id == bot_id,
            Document.is_active == True,
        )
    )
    active_docs = list(doc_result.scalars().all())
    await rag.rebuild_index_for_bot(
        bot_id, active_docs, bot.knowledge_prompt if bot else None
    )

    return {"deleted": True, "id": doc_id}


@app.get("/api/bots/{bot_id}/documents/{doc_id}/preview")
async def preview_bot_document(
    bot_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the first 500 characters of extracted text from a document."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.bot_id == bot_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    rag._uploads_dir = UPLOADS_DIR
    preview = rag.extract_preview(doc)
    return {"id": doc_id, "preview": preview, "original_name": doc.original_name}


# ---------------------------------------------------------------------------
# Avatar Providers
# ---------------------------------------------------------------------------

@app.get("/api/avatars/providers")
async def list_avatar_providers():
    """List all supported avatar providers with their required env keys."""
    result = []
    for pid, cls in PROVIDERS.items():
        result.append({
            "id": cls.name,
            "display_name": cls.display_name,
            "requires_keys": cls.requires_keys,
            "configured": all(bool(os.getenv(k)) for k in cls.requires_keys),
        })
    return {"providers": result}


@app.get("/api/avatars/{provider}/avatars")
async def list_provider_avatars(provider: str):
    """List available avatars from the specified provider."""
    cls = get_provider(provider)
    if not cls:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")

    api_key_env = cls.requires_keys[0] if cls.requires_keys else ""
    api_key = os.getenv(api_key_env, "")

    try:
        avatars = await cls.list_avatars(api_key)
        return {"provider": provider, "avatars": avatars}
    except Exception as e:
        logger.error("list_avatars failed for %s: %s", provider, e)
        raise HTTPException(status_code=502, detail=f"Provider error: {str(e)}")


@app.get("/api/avatars/{provider}/voices")
async def list_provider_voices(provider: str):
    """List available voices from the avatar provider (HeyGen only)."""
    if provider == "heygen":
        from avatar_providers.heygen import HeyGenProvider
        api_key = os.getenv("HEYGEN_API_KEY", "")
        try:
            voices = await HeyGenProvider.list_voices(api_key)
            return {"provider": provider, "voices": voices}
        except Exception as e:
            logger.error("HeyGen list_voices failed: %s", e)
            raise HTTPException(status_code=502, detail=str(e))
    raise HTTPException(status_code=404, detail=f"No voices endpoint for provider: {provider}")


@app.post("/api/avatars/heygen/token")
async def heygen_token():
    """Get a HeyGen streaming token for the browser SDK."""
    from avatar_providers.heygen import HeyGenProvider
    api_key = os.getenv("HEYGEN_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="HEYGEN_API_KEY not configured.")
    try:
        result = await HeyGenProvider.get_token(api_key)
        return result
    except Exception as e:
        logger.error("HeyGen get_token failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))


class LiveAvatarTokenRequest(BaseModel):
    avatar_id: str
    mode: str = "LITE"


@app.post("/api/avatars/liveavatar/token")
async def liveavatar_token(body: LiveAvatarTokenRequest):
    """Get a HeyGen LiveAvatar session token for the browser SDK."""
    api_key = os.getenv("LIVEAVATAR_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="LIVEAVATAR_API_KEY not configured.")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.liveavatar.com/v1/sessions/token",
            headers={"X-API-KEY": api_key, "accept": "application/json", "Content-Type": "application/json"},
            json={"mode": body.mode, "avatar_id": body.avatar_id},
            timeout=15,
        )
    if resp.status_code != 200:
        logger.error("LiveAvatar token failed: %s", resp.text)
        raise HTTPException(status_code=502, detail=f"LiveAvatar API error: {resp.text}")
    return resp.json().get("data", {})


@app.post("/api/avatars/did/session")
async def did_create_session(body: DIDSessionRequest):
    """Create a D-ID streaming session."""
    from avatar_providers.did import DIDProvider
    api_key = os.getenv("DID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="DID_API_KEY not configured.")
    try:
        result = await DIDProvider.create_streaming_session(api_key, body.avatar_id)
        return result
    except Exception as e:
        logger.error("D-ID create session failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/avatars/did/session/{stream_id}/sdp")
async def did_send_sdp(stream_id: str, body: SDPAnswerRequest):
    """Submit a WebRTC SDP answer to D-ID."""
    from avatar_providers.did import DIDProvider
    api_key = os.getenv("DID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="DID_API_KEY not configured.")
    try:
        result = await DIDProvider.send_sdp_answer(api_key, body.session_id, stream_id, body.answer)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/avatars/did/session/{stream_id}/ice")
async def did_send_ice(stream_id: str, body: ICECandidateRequest):
    """Submit a WebRTC ICE candidate to D-ID."""
    from avatar_providers.did import DIDProvider
    api_key = os.getenv("DID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="DID_API_KEY not configured.")
    try:
        result = await DIDProvider.send_ice_candidate(api_key, body.session_id, stream_id, body.candidate)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/avatars/did/session/{stream_id}/speak")
async def did_speak(stream_id: str, body: SpeakRequest):
    """Make the D-ID avatar speak text."""
    from avatar_providers.did import DIDProvider
    api_key = os.getenv("DID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="DID_API_KEY not configured.")
    try:
        result = await DIDProvider.speak(api_key, body.session_id, stream_id, body.text, body.voice_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.delete("/api/avatars/did/session/{stream_id}")
async def did_close_session(stream_id: str, session_id: str):
    """Close a D-ID streaming session."""
    from avatar_providers.did import DIDProvider
    api_key = os.getenv("DID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="DID_API_KEY not configured.")
    try:
        await DIDProvider.close_session(api_key, session_id, stream_id)
        return {"closed": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/avatars/simli/token")
async def simli_token(body: SimliTokenRequest):
    """Get a Simli session token for the browser SDK."""
    from avatar_providers.simli import SimliProvider
    api_key = os.getenv("SIMLI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="SIMLI_API_KEY not configured.")
    try:
        result = await SimliProvider.get_session_token(api_key, body.face_id)
        return result
    except Exception as e:
        logger.error("Simli get_session_token failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# Voice Providers
# ---------------------------------------------------------------------------

@app.get("/api/voices/providers")
async def list_voice_providers():
    """List all supported voice/TTS providers."""
    result = []
    for pid, cls in VOICE_PROVIDERS.items():
        result.append({
            "id": cls.name,
            "display_name": cls.display_name,
            "requires_keys": cls.requires_keys,
            "configured": all(bool(os.getenv(k)) for k in cls.requires_keys),
        })
    return {"providers": result}


@app.get("/api/voices/{provider}/voices")
async def list_voices(provider: str):
    """List available voices for the given TTS provider."""
    cls = get_voice_provider(provider)
    if not cls:
        raise HTTPException(status_code=404, detail=f"Unknown voice provider: {provider}")

    try:
        if provider == "sarvam":
            voices = cls.list_voices()
        else:
            api_key = os.getenv(cls.requires_keys[0], "")
            voices = await cls.list_voices(api_key)
        return {"provider": provider, "voices": voices}
    except Exception as e:
        logger.error("list_voices failed for %s: %s", provider, e)
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/voices/{provider}/synthesize")
async def synthesize_voice(provider: str, body: SynthesizeRequest):
    """
    Synthesize speech and return base64-encoded audio.
    Response: {"audio_base64": "...", "content_type": "audio/mpeg"}
    """
    cls = get_voice_provider(provider)
    if not cls:
        raise HTTPException(status_code=404, detail=f"Unknown voice provider: {provider}")

    api_key = os.getenv(cls.requires_keys[0], "") if cls.requires_keys else ""

    try:
        if provider == "sarvam":
            audio_bytes = await cls.synthesize(api_key, body.voice_id, body.text, body.language or "hi-IN")
            content_type = "audio/wav"
        else:
            audio_bytes = await cls.synthesize(api_key, body.voice_id, body.text)
            content_type = "audio/mpeg"

        audio_b64 = base64.b64encode(audio_bytes).decode()
        return {"audio_base64": audio_b64, "content_type": content_type}
    except Exception as e:
        logger.error("synthesize failed for %s: %s", provider, e)
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# Session (bot-aware)
# ---------------------------------------------------------------------------

@app.post("/api/session/start")
async def start_session(body: SessionStartRequest, db: AsyncSession = Depends(get_db)):
    """
    Start a new conversation session for a specific bot identified by slug.
    Returns session_id + full bot config snapshot.
    """
    bot = await get_bot_by_slug(db, body.bot_slug)
    if not bot:
        raise HTTPException(status_code=404, detail=f"Bot not found: {body.bot_slug}")
    if not bot.is_active:
        raise HTTPException(status_code=403, detail="Bot is not active.")

    session = ConversationSession(
        id=str(uuid.uuid4()),
        bot_id=bot.id,
        bot_slug=bot.slug,
        customer_name=body.customer_name,
        channel=body.channel,
        started_at=datetime.utcnow(),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": session.id,
        "started_at": session.started_at.isoformat(),
        "bot": {
            "id": bot.id,
            "name": bot.name,
            "slug": bot.slug,
            "avatar_provider": bot.avatar_provider,
            "avatar_id": bot.avatar_id,
            "avatar_name": bot.avatar_name,
            "voice_provider": bot.voice_provider,
            "voice_id": bot.voice_id,
            "bot_name": bot.bot_name,
            "greeting_en": bot.greeting_en,
            "greeting_hi": bot.greeting_hi,
            "theme_color": bot.theme_color,
        },
        "greeting": bot.greeting_en,
    }


@app.post("/api/session/end")
async def end_session(body: SessionEndRequest, db: AsyncSession = Depends(get_db)):
    """End a session and generate analytics asynchronously."""
    result = await db.execute(
        select(ConversationSession).where(ConversationSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    if session.ended_at:
        return {"session_id": session.id, "already_ended": True}

    now = datetime.utcnow()
    session.ended_at = now
    session.duration_seconds = int((now - session.started_at).total_seconds())

    # Load messages for analytics
    msg_result = await db.execute(
        select(Message)
        .where(Message.session_id == body.session_id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()
    msgs_dicts = [{"role": m.role, "content": m.content} for m in messages]

    analytics_data = await analytics_module.generate_session_analytics(
        msgs_dicts, LLM_PROVIDER_DEFAULT
    )
    session.analytics_json = json.dumps(analytics_data)
    await db.commit()

    return {
        "session_id": session.id,
        "duration_seconds": session.duration_seconds,
        "analytics": analytics_data,
    }


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    RAG-augmented chat endpoint (bot-aware).
    1. Sanitise and check input for injection.
    2. Look up session → bot_id → bot config.
    3. Query the per-bot RAG pipeline.
    4. Sanitise and check output.
    5. Persist both user message and assistant response.
    """
    # Validate session
    result = await db.execute(
        select(ConversationSession).where(ConversationSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    # Security checks
    try:
        security.check_injection(body.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    clean_input = security.sanitize_input(body.message)

    # Get bot config
    bot = await get_bot(db, session.bot_id) if session.bot_id else None
    llm_provider = LLM_PROVIDER_DEFAULT
    system_prompt = None
    knowledge_prompt = None
    bot_id = session.bot_id or "default"

    if bot:
        system_prompt = bot.system_prompt
        knowledge_prompt = bot.knowledge_prompt

    # RAG query (per-bot)
    rag._uploads_dir = UPLOADS_DIR
    response_text = await rag.query(
        question=clean_input,
        db=db,
        bot_id=bot_id,
        llm_provider=llm_provider,
        system_prompt=system_prompt,
        knowledge_prompt=knowledge_prompt,
    )

    # Output safety
    try:
        security.check_output_leak(response_text)
    except ValueError:
        response_text = "I'm sorry, I can't provide that information."
    response_text = security.sanitize_output(response_text)

    # Persist messages
    now = datetime.utcnow()
    user_msg = Message(
        id=str(uuid.uuid4()),
        session_id=body.session_id,
        role="user",
        content=clean_input,
        created_at=now,
    )
    assistant_msg = Message(
        id=str(uuid.uuid4()),
        session_id=body.session_id,
        role="assistant",
        content=response_text,
        created_at=now,
    )
    db.add(user_msg)
    db.add(assistant_msg)
    await db.commit()

    return {
        "session_id": body.session_id,
        "response": response_text,
        "language": body.language,
    }


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@app.get("/api/analytics/{session_id}")
async def get_session_analytics(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return analytics for a specific session."""
    result = await db.execute(
        select(ConversationSession).where(ConversationSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    analytics_data = {}
    if session.analytics_json:
        try:
            analytics_data = json.loads(session.analytics_json)
        except json.JSONDecodeError:
            pass

    return {
        "session_id": session_id,
        "bot_id": session.bot_id,
        "bot_slug": session.bot_slug,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "duration_seconds": session.duration_seconds,
        "customer_name": session.customer_name,
        "channel": session.channel,
        "analytics": analytics_data,
    }


@app.get("/api/reports")
async def get_reports(
    bot_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of sessions with analytics, optionally filtered by bot_id."""
    query_stmt = select(ConversationSession).order_by(
        ConversationSession.started_at.desc()
    )
    if bot_id:
        query_stmt = query_stmt.where(ConversationSession.bot_id == bot_id)
    query_stmt = query_stmt.limit(limit).offset(offset)

    result = await db.execute(query_stmt)
    sessions = result.scalars().all()

    rows = []
    for s in sessions:
        analytics_data = {}
        if s.analytics_json:
            try:
                analytics_data = json.loads(s.analytics_json)
            except json.JSONDecodeError:
                pass
        rows.append({
            "session_id": s.id,
            "bot_id": s.bot_id,
            "bot_slug": s.bot_slug,
            "customer_name": s.customer_name,
            "channel": s.channel,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "duration_seconds": s.duration_seconds,
            "analytics": analytics_data,
        })

    return {"sessions": rows, "limit": limit, "offset": offset}


@app.get("/api/reports/summary")
async def get_summary_report(
    bot_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated analytics across all completed sessions."""
    query_stmt = select(ConversationSession).where(
        ConversationSession.analytics_json != None
    )
    if bot_id:
        query_stmt = query_stmt.where(ConversationSession.bot_id == bot_id)

    result = await db.execute(query_stmt)
    sessions = result.scalars().all()

    analytics_list = []
    for s in sessions:
        if s.analytics_json:
            try:
                analytics_list.append(json.loads(s.analytics_json))
            except json.JSONDecodeError:
                pass

    summary = analytics_module.aggregate_summary(analytics_list)
    return summary


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
