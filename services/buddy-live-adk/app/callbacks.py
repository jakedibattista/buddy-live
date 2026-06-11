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

Prefer structural enforcement to prompt rules. Source of truth is Firestore.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.cloud.firestore_v1.base_query import FieldFilter

from app.firestore_client import session_ref
from app.tools._common import get_session_id

_logger = logging.getLogger(__name__)

_WRAP_PHASES = frozenset({"recap", "ended"})
_GUARDED_TOOLS = frozenset(
    {
        "start_rep_capture",
        "analyze_rep",
        "set_focus_drill",
        "show_iq_visual",
        "end_session_recap",
    }
)


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
    if tool_name == "show_iq_visual":
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


def _rep_is_scoreable(rep: dict[str, Any]) -> bool:
    """A completed rep counts as scored only if the analyzer produced usable
    numeric metrics. All-null results (analyzer never locked onto the shot)
    are 'unscoreable' and should not burn the player's one scored rep."""
    results = rep.get("results") or {}
    shots = results.get("structured_shots") or []
    metrics = (shots[0].get("metrics") or {}) if shots else (results.get("scores") or {})
    return any(isinstance(v, (int, float)) for v in metrics.values())


def _completed_rep_stats(session_id: str) -> tuple[int, bool]:
    """Return (completed rep count, any rep scoreable) for the session."""
    try:
        completed = (
            session_ref(session_id)
            .collection("reps")
            .where(filter=FieldFilter("status", "==", "completed"))
            .get()
        )
        reps = [snap.to_dict() or {} for snap in completed]
        return len(reps), any(_rep_is_scoreable(r) for r in reps)
    except Exception as exc:
        _logger.warning("phase_guard reps lookup failed session=%s: %s", session_id, exc)
        return 0, False


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
    session_id = get_session_id(tool_context)

    if not session_id:
        return None

    if tool_name not in _GUARDED_TOOLS:
        return None

    doc = _read_session_doc(session_id)
    if not doc:
        return None

    if _session_wrapped(doc) and tool_name in (
        {"show_iq_visual", "analyze_rep", "set_focus_drill", "start_rep_capture"}
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
                    "Cannot capture or analyze a rep until setup is confirmed. "
                    "Confirm the player is in frame verbally and call set_focus_drill "
                    "(it marks setup_framing_passed) before recording the rep."
                ),
            }

    if tool_name == "start_rep_capture":
        # Single-rep policy: we assume the player records ONE video. Once a rep
        # has scored, never auto-start another -- this is the structural backstop
        # against a reconnect (lost history) re-recording instead of reviewing
        # the existing scorecard. Exception (session live-inibrtfoscyy): if the
        # analyzer came back UNSCOREABLE the player hasn't used their scored
        # rep -- allow exactly one retake instead of dead-ending the session.
        rep_count, any_scoreable = _completed_rep_stats(session_id)
        if any_scoreable:
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
        if rep_count >= 2:
            _logger.info(
                "phase_guard blocked start_rep_capture: retake already used session=%s",
                session_id,
            )
            return {
                "status": "blocked_retake_used",
                "reason": (
                    "The one retake was already used and the analysis still couldn't "
                    "score it. Do NOT record again. Be honest, give the clean-clip "
                    "homework cue (one big full shot, say 'shot' right after), and "
                    "move to the recap."
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
