"""
Gemini helper — wraps Google Gemini API for AI Insights and property data extraction.
Uses Google's free tier (gemini-2.5-flash) — no credit card, 1500 req/day, 1M tokens/day.
Falls back gracefully if the API is unavailable or rate-limited.
"""

import os
import logging
import asyncio
from typing import Optional

logger = logging.getLogger("server")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Lazy-initialised client so import doesn't fail when key is absent (e.g. local dev).
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not GEMINI_API_KEY:
        return None
    try:
        from google import genai
        _client = genai.Client(api_key=GEMINI_API_KEY)
        return _client
    except Exception as e:
        logger.error(f"[Gemini] Failed to init client: {e}")
        return None


async def generate_text(
    prompt: str,
    system_instruction: Optional[str] = None,
    timeout_seconds: float = 25.0,
) -> Optional[str]:
    """
    Generate text using Gemini. Returns None on failure (caller decides fallback).
    Runs the blocking SDK call in a worker thread so it doesn't block the event loop.
    """
    client = _get_client()
    if client is None:
        logger.warning("[Gemini] Client unavailable (missing GEMINI_API_KEY?)")
        return None

    def _call():
        try:
            from google.genai import types as genai_types
            config = None
            if system_instruction:
                config = genai_types.GenerateContentConfig(
                    system_instruction=system_instruction,
                )
            resp = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=config,
            )
            return getattr(resp, "text", None)
        except Exception as e:
            logger.error(f"[Gemini] generate_content error: {type(e).__name__}: {e}")
            return None

    try:
        return await asyncio.wait_for(asyncio.to_thread(_call), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        logger.error("[Gemini] Request timed out")
        return None
    except Exception as e:
        logger.error(f"[Gemini] Unexpected error: {type(e).__name__}: {e}")
        return None


def is_available() -> bool:
    return bool(GEMINI_API_KEY)
