"""set_iq_question_goal tool: persist how many Hockey IQ scenarios the player wants."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)

_MIN_QUESTIONS = 3
_MAX_QUESTIONS = 15
_DEFAULT_QUESTIONS = 8


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def set_iq_question_goal(question_count: int, tool_context: ToolContext) -> dict[str, Any]:
    """Lock in how many Hockey IQ scenarios the player wants this session.

    Call once at the start of Hockey IQ practice, right after the player
    tells you how many questions they want (suggest 5, 8, or 10 if unsure).

    Args:
        question_count: Number of scenarios to run before wrap-up (3-15).

    Returns:
        Dict with status and the clamped question_count.
    """
    try:
        raw = int(question_count)
    except (TypeError, ValueError):
        raw = _DEFAULT_QUESTIONS

    count = max(_MIN_QUESTIONS, min(_MAX_QUESTIONS, raw))

    session_id = _get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "question_count": count}

    ref = session_ref(session_id)
    if ref is None:
        return {"status": "no_firestore", "question_count": count}

    try:
        ref.set(
            {
                "iq_question_goal": count,
                "currentPhase": "iq_practice",
                "iq_updated_at": _now_iso(),
            },
            merge=True,
        )
    except Exception as exc:
        _logger.exception("set_iq_question_goal failed")
        return {"status": "error", "question_count": count, "error": str(exc)}

    return {"status": "ok", "question_count": count}
