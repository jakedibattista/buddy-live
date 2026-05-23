"""peek_camera tool: one-shot Gemini Flash analysis of the player's webcam frame.

Architecture:
  - The web client periodically uploads the most recent webcam JPEG to
    `live_sessions/{sid}/peek_latest.jpg` in Firebase Storage AND mirrors the
    download URL into Firestore at `live_sessions/{sid}.peek_url`.
  - This tool reads that URL, fetches the JPEG, and asks gemini-flash-latest a
    grounding question.
  - We use single-shot generate_content (not the Live API persistent session) to
    avoid the 1-FPS / 2-minute session caps and keep cost per call near zero.

Falls back gracefully if Firestore/Storage aren't reachable so local dev works.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from google.adk.tools.tool_context import ToolContext
from google.genai import Client
from google.genai import types as genai_types

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)
_PEEK_PROMPT_PREAMBLE = (
    "You are a vision helper for a hockey coach. Look at this single webcam frame "
    "of a young hockey player and answer the coach's question in one short sentence. "
    "If the player is not visible or the angle is bad, say so."
)


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def _get_peek_url(session_id: str) -> str | None:
    ref = session_ref(session_id)
    if ref is None:
        return None
    snap = ref.get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    return data.get("peek_url") or data.get("peekUrl")


def peek_camera(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look at one webcam frame and answer the coach's grounding question.

    Args:
        question: A short, concrete grounding question like
            "Is the player in their shooting stance?" or
            "Is the player holding the stick correctly?".

    Returns:
        Dict with `observation` (one-sentence answer) and `source` ("gemini-flash").
        If the camera is unavailable, returns `{"observation": "...", "available": False}`.
    """
    session_id = _get_session_id(tool_context)
    if not session_id:
        return {
            "observation": "Camera unavailable: no active session.",
            "available": False,
        }

    peek_url = _get_peek_url(session_id)
    if not peek_url:
        return {
            "observation": "Camera unavailable: no recent frame uploaded yet.",
            "available": False,
        }

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(peek_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        _logger.warning("peek_camera frame fetch failed: %s", exc)
        return {"observation": "Camera glitched -- couldn't grab a frame.", "available": False}

    try:
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "observation": "Camera unavailable: vision API not configured.",
                "available": False,
            }
        genai = Client(api_key=api_key)
        model = os.getenv("PEEK_MODEL", os.getenv("GEMINI_MODEL", "gemini-flash-latest"))
        response = genai.models.generate_content(
            model=model,
            contents=[
                genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                genai_types.Part.from_text(text=f"{_PEEK_PROMPT_PREAMBLE}\n\nQuestion: {question}"),
            ],
            config=genai_types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=120,
            ),
        )
        text = (response.text or "").strip()
        if not text and response.candidates:
            parts = response.candidates[0].content.parts if response.candidates[0].content else []
            text = " ".join((p.text or "").strip() for p in parts).strip()
        return {
            "observation": text or "Couldn't tell from this frame.",
            "available": True,
            "source": "gemini-flash",
        }
    except Exception as exc:
        _logger.exception("peek_camera Gemini call failed")
        return {
            "observation": f"Vision error: {type(exc).__name__}",
            "available": False,
        }
