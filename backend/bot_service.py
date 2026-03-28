"""
bot_service.py — Bot CRUD service.

Provides helper functions for creating, reading, updating, and deleting
Bot records. Handles slug uniqueness automatically on creation.
"""

import re
import uuid
from datetime import datetime

from sqlalchemy import select

from database import Bot, Document


def slugify(name: str) -> str:
    """Convert a display name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    slug = re.sub(r"^-+|-+$", "", slug)
    return slug or "bot"


async def create_bot(db, name: str, **kwargs) -> Bot:
    """Create a new bot with an auto-generated unique slug."""
    base_slug = slugify(name)
    slug = base_slug
    counter = 1
    while True:
        result = await db.execute(select(Bot).where(Bot.slug == slug))
        if not result.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    bot = Bot(
        id=str(uuid.uuid4()),
        name=name,
        slug=slug,
        **kwargs,
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return bot


async def get_bot(db, bot_id: str) -> Bot | None:
    """Fetch a bot by its primary key."""
    result = await db.execute(select(Bot).where(Bot.id == bot_id))
    return result.scalar_one_or_none()


async def get_bot_by_slug(db, slug: str) -> Bot | None:
    """Fetch a bot by its URL slug."""
    result = await db.execute(select(Bot).where(Bot.slug == slug))
    return result.scalar_one_or_none()


async def list_bots(db) -> list[Bot]:
    """Return all bots ordered by creation date descending."""
    result = await db.execute(select(Bot).order_by(Bot.created_at.desc()))
    return list(result.scalars().all())


async def update_bot(db, bot_id: str, **kwargs) -> Bot | None:
    """Partially update a bot's fields. Returns None if bot not found."""
    bot = await get_bot(db, bot_id)
    if not bot:
        return None
    for key, value in kwargs.items():
        if hasattr(bot, key):
            setattr(bot, key, value)
    bot.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(bot)
    return bot


async def delete_bot(db, bot_id: str) -> bool:
    """Delete a bot and cascade-delete its documents. Returns False if not found."""
    bot = await get_bot(db, bot_id)
    if not bot:
        return False
    await db.delete(bot)
    await db.commit()
    return True


async def count_bot_documents(db, bot_id: str) -> int:
    """Return the number of active documents for a bot."""
    result = await db.execute(
        select(Document).where(Document.bot_id == bot_id, Document.is_active == True)
    )
    return len(result.scalars().all())
