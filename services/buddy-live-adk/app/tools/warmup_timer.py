"""Warm-up timer tool: on-screen countdown for timed warm-up moves."""
from __future__ import annotations

import logging
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref
from app.tools._common import get_session_id, now_iso

_logger = logging.getLogger(__name__)


def start_warmup_timer(
    exercise: str,
    duration_seconds: int,
    label: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Show a countdown timer on the player's screen for one warm-up move.

    Call this when starting a timed warm-up (e.g. 30 seconds of high knees).
    When the timer ends, the client nudges you for verbal feedback — ask how
    the move felt and explain the next one (warm-up is verbal only).

    Args:
        exercise: Plain description of the move just timed, e.g.
            "high knees marching in place with knees lifted".
        duration_seconds: Countdown length (10-60 seconds).
        label: Short on-screen label, e.g. "High knees" or "Arm circles".

    Returns:
        Dict with status and the clamped duration_seconds.
    """
    session_id = get_session_id(tool_context)
    exercise_label = (exercise or "warm-up move").strip()
    ui_label = (label or exercise_label).strip()
    duration = max(10, min(60, int(duration_seconds)))

    if not session_id:
        return {"status": "no_session", "duration_seconds": duration, "label": ui_label}

    sref = session_ref(session_id)
    if sref is None:
        return {"status": "no_firestore", "duration_seconds": duration, "label": ui_label}

    try:
        snap = sref.get()
        doc = snap.to_dict() if snap.exists else {}
        in_iq = doc.get("currentPhase") == "iq_practice"

        sref.collection("commands").add(
            {
                "type": "start_warmup_timer",
                "exercise": exercise_label,
                "label": ui_label,
                "duration_seconds": duration,
                "created_at": now_iso(),
            }
        )
        update: dict[str, Any] = {
            "last_warmup_timer_label": ui_label,
            "last_warmup_timer_seconds": duration,
            "warmup_timer_started_at": now_iso(),
        }
        if not in_iq:
            update["currentPhase"] = "warmup"
        sref.set(update, merge=True)
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
