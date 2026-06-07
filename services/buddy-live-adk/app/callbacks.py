"""ADK 2.0 BeforeToolCallback for Buddy Live.

These callbacks enforce session phase gates in code so the model can't
break the flow even if it ignores the prompt. Each callback inspects the
session state and tool args; returning a dict short-circuits the tool
call and feeds that dict back to the model as the tool result. Returning
None lets the tool proceed normally.

Structural gates (Firestore-backed, read once per guarded call):

1. set_focus_drill — once per session; not after IQ hand-off or wrap-up.
2. show_iq_visual — only in IQ mode (no focus drill, or phase iq_practice);
   requires iq_question_goal set first.
3. start_rep_capture / analyze_rep — require focus drill + setup_framing_passed;
   start_rep_capture also blocks after one completed rep.
4. end_session_recap — requires a completed rep (IQ wrap-up exempt).
5. peek_camera / peek_warmup — blocked after session wrap-up.

Prefer structural enforcement to prompt rules. Source of truth is Firestore.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.cloud.firestore_v1.base_query import FieldFilter

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)

_VISION_TOOLS = frozenset({"peek_camera", "peek_warmup"})
_WRAP_PHASES = frozenset({"recap", "ended"})
_GUARDED_TOOLS = frozenset(
    {
        "start_rep_capture",
        "analyze_rep",
        "set_focus_drill",
        "show_iq_visual",
        "end_session_recap",
    }
    | _VISION_TOOLS
)


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


def _session_wrapped(doc: dict[str, Any]) -> bool:
    return doc.get("currentPhase") in _WRAP_PHASES or bool(doc.get("ended_at"))


def _blocked_session_over(tool_name: str) -> dict[str, str]:
    if tool_name in _VISION_TOOLS:
        reason = (
            "The session is wrapping up. Do not call vision tools; just talk "
            "the player through their results and the recap."
        )
    elif tool_name == "show_iq_visual":
        reason = (
            "The session is wrapping up. Do not show new IQ cards; finish the "
            "recap and say goodbye."
        )
    else:
        reason = (
            "The session is wrapping up. Do not start new drills or analysis; "
            "finish the recap with the player."
        )
    return {"status": "blocked_session_over", "reason": reason}


def _has_completed_rep(session_id: str) -> bool:
    try:
        completed = (
            session_ref(session_id)
            .collection("reps")
            .where(filter=FieldFilter("status", "==", "completed"))
            .limit(1)
            .get()
        )
        return bool(completed)
    except Exception as exc:
        _logger.warning("phase_guard reps lookup failed session=%s: %s", session_id, exc)
        return False


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

    if tool_name not in _GUARDED_TOOLS:
        return None

    doc = _read_session_doc(session_id)
    if not doc:
        return None

    if _session_wrapped(doc) and tool_name in (
        _VISION_TOOLS | {"show_iq_visual", "analyze_rep", "set_focus_drill", "start_rep_capture"}
    ):
        _logger.info(
            "phase_guard blocked %s after session wrap session=%s",
            tool_name,
            session_id,
        )
        return _blocked_session_over(tool_name)

    if tool_name == "set_focus_drill":
        if doc.get("currentPhase") == "iq_practice":
            _logger.info(
                "phase_guard blocked set_focus_drill: iq_practice session=%s",
                session_id,
            )
            return {
                "status": "blocked_iq_mode",
                "reason": (
                    "Cannot set a shooting drill during Hockey IQ practice. "
                    "Stay in iq_coach and continue IQ scenarios."
                ),
            }
        if doc.get("focus_drill"):
            _logger.info(
                "phase_guard blocked set_focus_drill: already set session=%s",
                session_id,
            )
            return {
                "status": "blocked_drill_already_set",
                "reason": (
                    f"focus_drill is already '{doc.get('focus_drill')}'. "
                    "Do not call set_focus_drill again — use that drill_id for rep capture."
                ),
            }
        return None

    if tool_name == "show_iq_visual":
        focus_drill = doc.get("focus_drill")
        phase = doc.get("currentPhase")
        if focus_drill and phase != "iq_practice":
            _logger.info(
                "phase_guard blocked show_iq_visual: shooting flow session=%s",
                session_id,
            )
            return {
                "status": "blocked_not_iq_mode",
                "reason": (
                    "Cannot show IQ visual cards during the shooting drill flow. "
                    "Use verbal inline questions only, or transfer_to_agent "
                    "iq_coach if the player lacks space to shoot."
                ),
            }
        if not doc.get("iq_question_goal"):
            _logger.info(
                "phase_guard blocked show_iq_visual: no iq_question_goal session=%s",
                session_id,
            )
            return {
                "status": "blocked_no_iq_goal",
                "reason": (
                    "Ask the player how many Hockey IQ questions they want "
                    "(five, eight, or ten), call set_iq_question_goal with "
                    "their choice, then show the first scenario."
                ),
            }
        return None

    if tool_name in _VISION_TOOLS:
        return None

    if tool_name in {"start_rep_capture", "analyze_rep"}:
        if not doc.get("focus_drill"):
            _logger.info(
                "phase_guard blocked %s: no focus drill session=%s",
                tool_name,
                session_id,
            )
            return {
                "status": "blocked_no_focus_drill",
                "reason": (
                    "Cannot capture or analyze a rep before the player picks a drill. "
                    "Ask them what they want to work on (wristshot, slapshot, or backhand) "
                    "and call set_focus_drill first."
                ),
            }
        if not doc.get("setup_framing_passed"):
            _logger.info(
                "phase_guard blocked %s: framing not passed session=%s",
                tool_name,
                session_id,
            )
            return {
                "status": "blocked_framing_not_passed",
                "reason": (
                    "Cannot capture or analyze a rep until camera framing passes. "
                    "Call peek_camera and walk the player through any framing fix "
                    "until setup_framing_passed=true."
                ),
            }

    if tool_name == "start_rep_capture":
        # Single-rep policy: we assume the player records ONE video. Once a rep
        # has scored, never auto-start another -- this is the structural backstop
        # against a reconnect (lost history) re-recording instead of reviewing
        # the existing scorecard.
        if _has_completed_rep(session_id):
            _logger.info(
                "phase_guard blocked start_rep_capture: rep already scored session=%s",
                session_id,
            )
            return {
                "status": "blocked_rep_already_scored",
                "reason": (
                    "A scored rep already exists for this session. Do NOT record again. "
                    "Call get_rep_result on the existing rep and review the scorecard "
                    "with the player, then move to the recap."
                ),
            }
        return None

    if tool_name == "analyze_rep":
        return None

    if tool_name == "end_session_recap":
        if doc.get("currentPhase") == "iq_practice":
            return None

        if not _has_completed_rep(session_id):
            _logger.info(
                "phase_guard blocked end_session_recap: no ready results session=%s",
                session_id,
            )
            return {
                "status": "blocked_no_ready_results",
                "reason": (
                    "Cannot recap until at least one rep result is ready. "
                    "Call get_rep_result on recent rep_ids and wait for status=ready, "
                    "or queue another bonus rep while you wait."
                ),
            }

    return None
