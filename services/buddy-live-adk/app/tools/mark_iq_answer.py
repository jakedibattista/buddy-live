"""mark_iq_answer tool: light up the current Hockey IQ scenario card with
the player's pick and the correct answer.

Called by the IQ Coach right after the player answers a scenario, before
the next `show_iq_visual` call. The web UI subscribes to
`live_sessions/{sid}/commands` and updates the latest IqVisualCard with
green/red highlights so the player gets clear visual confirmation of
right vs. wrong.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)

_VALID_LETTERS = {"A", "B", "C"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def _normalize_letter(value: str | None) -> str | None:
    if not value:
        return None
    letter = value.strip().upper()[:1]
    return letter if letter in _VALID_LETTERS else None


def mark_iq_answer(
    player_choice: str,
    correct_choice: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Mark the player's pick on the current Hockey IQ scenario card.

    Call once per scenario, right after the player answers, BEFORE the
    next show_iq_visual call. The card animates green on the correct
    option and red on the player's pick if it was wrong.

    Args:
        player_choice: The letter the player picked ("A", "B", or "C").
        correct_choice: The letter you (the coach) consider correct
            ("A", "B", or "C").

    Returns:
        Dict with status confirmation.
    """
    session_id = _get_session_id(tool_context)

    if not session_id:
        return {"status": "no_session"}

    sref = session_ref(session_id)
    if sref is None:
        return {"status": "no_firestore"}

    pc = _normalize_letter(player_choice)
    cc = _normalize_letter(correct_choice)
    if not pc or not cc:
        return {
            "status": "invalid_letter",
            "reason": "player_choice and correct_choice must each be 'A', 'B', or 'C'.",
        }

    was_correct = pc == cc

    try:
        sref.collection("commands").add(
            {
                "type": "mark_iq_answer",
                "player_choice": pc,
                "correct_choice": cc,
                "was_correct": was_correct,
                "created_at": _now_iso(),
            }
        )
        sref.set(
            {
                "iq_last_player_choice": pc,
                "iq_last_correct_choice": cc,
                "iq_last_was_correct": was_correct,
                "iq_updated_at": _now_iso(),
            },
            merge=True,
        )
    except Exception as exc:
        _logger.exception("mark_iq_answer write failed")
        return {"status": "error", "error": str(exc)}

    return {
        "status": "ok",
        "player_choice": pc,
        "correct_choice": cc,
        "was_correct": was_correct,
    }
