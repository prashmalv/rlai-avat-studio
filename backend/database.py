"""
database.py — SQLAlchemy async database models and session management.

Models:
  - Bot: multi-tenant bot configuration (avatar, voice, knowledge, persona)
  - Document: uploaded knowledge-base files linked to a specific bot
  - ConversationSession: one record per chat session, linked to a bot
  - Message: individual chat turns linked to a session
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class Bot(Base):
    """
    One row per bot. Each bot has its own avatar/voice config, knowledge base,
    and persona settings. Public URL is /chat/{slug}.
    """

    __tablename__ = "bots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)          # display name e.g. "Skoda Kushaq Bot"
    slug = Column(String, unique=True, nullable=False)  # URL slug e.g. "skoda-kushaq"
    description = Column(String, nullable=True)

    # Avatar
    avatar_provider = Column(String, default="heygen")  # heygen | did | simli
    avatar_id = Column(String, default="Anna_public_3_20240108")
    avatar_name = Column(String, nullable=True)
    avatar_preview_url = Column(String, nullable=True)

    # Voice
    voice_provider = Column(String, default="elevenlabs")  # default | elevenlabs | sarvam
    voice_id = Column(String, default="mfMM3ijQgz8QtMeKifko")  # ElevenLabs Ria Rao - Indian English/Hindi
    voice_name = Column(String, nullable=True)

    # Knowledge
    knowledge_prompt = Column(Text, nullable=True)  # Direct text as knowledge source
    system_prompt = Column(Text, nullable=True)

    # UI / Persona
    bot_name = Column(String, default="Priya")
    greeting_en = Column(String, default="Hello! I'm Priya, your AI assistant. How can I help you today?")
    greeting_hi = Column(String, default="Namaste! Main Priya hun, aapki AI sahayak. Aaj main aapki kaise madad kar sakti hun?")
    theme_color = Column(String, default="#f97316")  # orange default

    # Meta
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.utcnow())
    updated_at = Column(DateTime, nullable=True)


class Document(Base):
    """
    Metadata for a file uploaded to a bot's knowledge base.
    The actual file lives in UPLOADS_DIR/{filename}.
    is_active controls whether the file is included in the RAG vector index.
    """

    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)          # on-disk name (uuid prefix)
    original_name = Column(String, nullable=False)     # user-visible name
    file_type = Column(String, nullable=False)         # pdf | md | txt | json
    file_size = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    description = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.utcnow())


class ConversationSession(Base):
    """
    One row per chat session. References the bot that handled the session.
    analytics_json stores the full GPT-generated analytics blob as JSON text.
    """

    __tablename__ = "conversation_sessions"

    id = Column(String, primary_key=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="SET NULL"), nullable=True)
    bot_slug = Column(String, nullable=True)  # snapshot at session start
    customer_name = Column(String, nullable=True)
    channel = Column(String, default="web")
    started_at = Column(DateTime)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    analytics_json = Column(Text, nullable=True)


class Message(Base):
    """Individual chat turn. role is 'user' or 'assistant'."""

    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("conversation_sessions.id", ondelete="CASCADE"))
    role = Column(String, nullable=False)   # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime)


# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------

_engine = None
_AsyncSessionLocal = None


def init_db_engine(database_url: str):
    """Call once at startup with the DATABASE_URL from settings."""
    global _engine, _AsyncSessionLocal
    connect_args = {}
    if "sqlite" in database_url:
        connect_args = {"check_same_thread": False, "timeout": 30}
    _engine = create_async_engine(
        database_url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_recycle=300,
    )
    _AsyncSessionLocal = sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )


async def create_all_tables():
    """Create all tables that don't yet exist (idempotent)."""
    async with _engine.begin() as conn:
        # Use DELETE journal mode for compatibility with network file systems (Azure Files)
        from sqlalchemy import text
        if "sqlite" in str(_engine.url):
            await conn.execute(text("PRAGMA journal_mode=MEMORY"))
            await conn.execute(text("PRAGMA synchronous=OFF"))
            await conn.execute(text("PRAGMA locking_mode=EXCLUSIVE"))
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """FastAPI dependency: yields an async DB session and closes it afterwards."""
    async with _AsyncSessionLocal() as session:
        yield session
