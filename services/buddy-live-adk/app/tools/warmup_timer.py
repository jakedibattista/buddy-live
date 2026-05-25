"""Warm-up timer tool: on-screen countdown for timed warm-up moves."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def start_warmup_timer(
    exercise: str,
    duration_seconds: int,
    label: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Show a countdown timer on the player's screen for one warm-up move.

    Call this when starting a timed warm-up (e.g. 30 seconds of high knees).
    When the timer ends, the client nudges you to call peek_warmup(exercise).

    Args:
        exercise: Plain description for peek_warmup after the timer, e.g.
            "high knees marching in place with knees lifted".
        duration_seconds: Countdown length (10-60 seconds).
        label: Short on-screen label, e.g. "High knees" or "Arm circles".

    Returns:
        Dict with status and the clamped duration_seconds.
    """
    session_id = _get_session_id(tool_context)
    exercise_label = (exercise or "warm-up move").strip()
    ui_label = (label or exercise_label).strip()
    duration = max(10, min(60, int(duration_seconds)))

    if not session_id:
        return {"status": "no_session", "duration_seconds": duration, "label": ui_label}

    sref = session_ref(session_id)
    if sref is None:
        return {"status": "no_firestore", "duration_seconds": duration, "label": ui_label}

    try:
        sref.collection("commands").add(
            {
                "type": "start_warmup_timer",
                "exercise": exercise_label,
                "label": ui_label,
                "duration_seconds": duration,
                "created_at": _now_iso(),
            }
        )
        sref.set(
            {
                "currentPhase": "warmup",
                "last_warmup_timer_label": ui_label,
                "last_warmup_timer_seconds": duration,
                "warmup_timer_started_at": _now_iso(),
            },
            merge=True,
        )
    except Exception as exc:
        _logger.exception("start_warmup_timer failed")
        return {
            "status": "error",
            "duration_seconds": duration,
            "label": ui_label,
            "error": str(exc),
        }

    return {
        "status": "timer_started",
        "exercise": exercise_label,
        "label": ui_label,
        "duration_seconds": duration,
    }
