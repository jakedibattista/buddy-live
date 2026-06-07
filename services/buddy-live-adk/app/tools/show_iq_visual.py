"""show_iq_visual tool: display a hockey IQ scenario card on the player's screen.

Called by the agent during Hockey IQ Practice to show the current question
visually on-screen. The web UI subscribes to `live_sessions/{sid}/commands`
and renders an IqVisualCard overlay with the scenario text and optional
diagram description.
"""
from __future__ import annotations

import logging
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref
from app.tools._common import get_session_id, now_iso

_logger = logging.getLogger(__name__)


def show_iq_visual(
    scenario: str,
    options: list[str],
    diagram: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Display a hockey IQ scenario card on the player's screen.

    Call this each time you ask a new Hockey IQ question so the player can
    read it on screen while discussing it with you verbally.

    Args:
        scenario: The game situation description (1-2 sentences).
        options: Two or three answer choices the player can pick from or
            discuss (e.g. ["Shoot five-hole", "Pick the top corner"]).
        diagram: A short rink/play description for the visual card. Use
            simple spatial language like "You have the puck at the left
            circle. Goalie is square. Defender closing from the blue line."
            This helps the player picture the play.

    Returns:
        Dict with status confirmation.
    """
    session_id = get_session_id(tool_context)

    if not session_id:
        return {"status": "no_session"}

    sref = session_ref(session_id)
    if sref is None:
        return {"status": "no_firestore"}

    clean_options = [str(o).strip() for o in (options or []) if o][:3]

    try:
        sref.collection("commands").add(
            {
                "type": "show_iq_visual",
                "scenario": (scenario or "").strip(),
                "options": clean_options,
                "diagram": (diagram or "").strip(),
                "created_at": now_iso(),
            }
        )
        sref.set(
            {
                "currentPhase": "iq_practice",
                "iq_scenario": (scenario or "").strip(),
                "iq_updated_at": now_iso(),
            },
            merge=True,
        )
    except Exception as exc:
        _logger.exception("show_iq_visual write failed")
        return {"status": "error", "error": str(exc)}

    return {"status": "ok", "scenario": (scenario or "").strip()}
