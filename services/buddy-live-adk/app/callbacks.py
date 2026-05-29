"""ADK 2.0 BeforeToolCallback for Buddy Live.

These callbacks enforce session phase gates in code so the model can't
break the flow even if it ignores the prompt. Each callback inspects the
session state and tool args; returning a dict short-circuits the tool
call and feeds that dict back to the model as the tool result. Returning
None lets the tool proceed normally.

Today we enforce three gates:

1. start_rep_capture requires setup_framing_passed=true AND a focus drill.
2. end_session_recap requires at least one ready rep result.
3. show_iq_visual is allowed any time but ensures phase is iq_practice.

Add more guards here over time -- prefer structural enforcement to prompt
rules. Source of truth for phase/state is Firestore (read once per call).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)


def _get_session_id(tool_context: ToolContext) -> Optional[str]:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def _read_session_doc(session_id: str) -> dict[str, Any]:
    """Single Firestore read of the live session doc. Returns {} on miss."""
    ref = session_ref(session_id)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if snap.exists:
            return snap.to_dict() or {}
    except Exception as exc:
        _logger.warning("phase_guard read failed session=%s: %s", session_id, exc)
    return {}


def phase_guard(
    tool: BaseTool,
    args: dict[str, Any],
    tool_context: ToolContext,
) -> Optional[dict]:
    """Block tool calls that violate session phase rules.

    Returning a dict here means the tool is NEVER called; the dict becomes
    the tool result and the agent sees a structured "no, you can't do that
    right now" reply that includes the reason. The agent then self-corrects
    on the next turn.
    """
    tool_name = tool.name
    session_id = _get_session_id(tool_context)

    if not session_id:
        return None

    _vision_tools = {"peek_camera", "peek_warmup"}
    if tool_name not in {"start_rep_capture", "end_session_recap"} | _vision_tools:
        return None

    doc = _read_session_doc(session_id)
    if not doc:
        return None

    # Once the session is wrapping up, no more vision calls. A stray peek loop
    # after recap/ended just burns Gemini vision quota and writes dead peek
    # frames (we saw 8 fire ~8 min after a session ended).
    if tool_name in _vision_tools:
        if doc.get("currentPhase") in {"recap", "ended"} or doc.get("ended_at"):
            _logger.info(
                "phase_guard blocked %s after session wrap session=%s",
                tool_name,
                session_id,
            )
            return {
                "status": "blocked_session_over",
                "reason": "The session is wrapping up. Do not call vision tools; just talk the player through their results and the recap.",
            }
        return None

    if tool_name == "start_rep_capture":
        if not doc.get("focus_drill"):
            _logger.info("phase_guard blocked start_rep_capture: no focus drill session=%s", session_id)
            return {
                "status": "blocked_no_focus_drill",
                "reason": "Cannot start a scored rep before the player picks a drill. Ask them what they want to work on (wristshot, slapshot, or backhand) and call set_focus_drill first.",
            }
        if not doc.get("setup_framing_passed"):
            _logger.info(
                "phase_guard blocked start_rep_capture: framing not passed session=%s",
                session_id,
            )
            return {
                "status": "blocked_framing_not_passed",
                "reason": "Cannot start a scored rep until camera framing passes. Call peek_camera and walk the player through any framing fix until setup_framing_passed=true.",
            }
        # Single-rep policy: we assume the player records ONE video. Once a rep
        # has scored, never auto-start another -- this is the structural backstop
        # against a reconnect (lost history) re-recording instead of reviewing
        # the existing scorecard.
        try:
            completed = (
                session_ref(session_id)
                .collection("reps")
                .where("status", "==", "completed")
                .limit(1)
                .get()
            )
        except Exception as exc:
            _logger.warning(
                "phase_guard reps lookup failed session=%s: %s", session_id, exc
            )
            completed = []
        if completed:
            _logger.info(
                "phase_guard blocked start_rep_capture: rep already scored session=%s",
                session_id,
            )
            return {
                "status": "blocked_rep_already_scored",
                "reason": "A scored rep already exists for this session. Do NOT record again. Call get_rep_result on the existing rep and review the scorecard with the player, then move to the recap.",
            }

    if tool_name == "end_session_recap":
        if doc.get("currentPhase") == "iq_practice":
            return None

        try:
            reps = (
                session_ref(session_id)
                .collection("reps")
                .where("status", "==", "completed")
                .limit(1)
                .get()
            )
        except Exception as exc:
            _logger.warning(
                "phase_guard reps lookup failed session=%s: %s", session_id, exc
            )
            return None

        if not reps:
            _logger.info(
                "phase_guard blocked end_session_recap: no ready results session=%s",
                session_id,
            )
            return {
                "status": "blocked_no_ready_results",
                "reason": "Cannot recap until at least one rep result is ready. Call get_rep_result on recent rep_ids and wait for status=ready, or queue another bonus rep while you wait.",
            }

    return None
