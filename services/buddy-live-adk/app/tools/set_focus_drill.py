"""set_focus_drill tool: persist the player's chosen drill to Firestore.

Called by the agent once -- right after the player confirms which shot they
want to work on (wristshot / slapshot / backhand). The web UI subscribes to
`live_sessions/{sid}.focus_drill` so the side panel and DrillChip can show
the choice before the first rep capture starts.
"""
from __future__ import annotations

import logging
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref
from app.tools._common import get_session_id, now_iso

_logger = logging.getLogger(__name__)

_VALID_FOCUS_DRILLS = {"wristshot", "slapshot", "backhand"}


def set_focus_drill(drill_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Lock in the drill the player wants to work on for the rest of the session.

    Call this ONCE, right after the player confirms their drill choice in the
    opening turns. Drives the UI's drill display and is for analytics only --
    you still need to pass the same drill_id to each start_rep_capture.

    Args:
        drill_id: "wristshot", "slapshot", or "backhand".

    Returns:
        Dict with `status` and the canonical `drill_id`.
    """
    canonical = (drill_id or "").lower().strip()
    if canonical not in _VALID_FOCUS_DRILLS:
        return {
            "status": "invalid_drill",
            "drill_id": canonical,
            "allowed": sorted(_VALID_FOCUS_DRILLS),
        }

    session_id = get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "drill_id": canonical}

    ref = session_ref(session_id)
    if ref is None:
        return {"status": "no_firestore", "drill_id": canonical}

    try:
        ref.set(
            {
                "focus_drill": canonical,
                "focus_drill_set_at": now_iso(),
                "currentPhase": "warmup",
                "setup_framing_passed": True,  # Automatically pass framing setup since we simplified it to verbal confirmation
            },
            merge=True,
        )
    except Exception as exc:
        _logger.exception("set_focus_drill write failed")
        return {"status": "error", "drill_id": canonical, "error": str(exc)}

    return {"status": "ok", "drill_id": canonical}
