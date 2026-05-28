"""Environment Simulation config for Buddy Live evals.

Hermetic mocks for every tool the production agent calls so `adk eval` runs
without touching Firebase, modelforpuckbuddy, ElevenLabs, or any other live
service. The simulator intercepts each tool call via the
`before_tool_callback` hook and returns a deterministic synthetic response.

Two configs are exported:

- :func:`happy_path_config` — every tool succeeds. Use this for baseline
  scenarios (happy flow, sub-agent transfer, persona robustness).
- :func:`failure_config` — adds probabilistic injections that reproduce the
  edge cases we want Track 2 to demonstrate the agent surviving (framing
  loops, analysis timeouts). Use this for the "before / after" demo
  scenarios.

Pick the active config with the ``BUDDY_EVAL_FAILURES`` env var
(``BUDDY_EVAL_FAILURES=1`` -> failure_config, otherwise happy_path_config).
"""
from __future__ import annotations

from typing import Any

from google.adk.tools.environment_simulation.environment_simulation_config import (
    EnvironmentSimulationConfig,
    InjectedError,
    InjectionConfig,
    ToolSimulationConfig,
)


_EVAL_REP_ID = "rep-eval-0001"
_EVAL_FOLLOWUP_REP_ID = "rep-eval-0002"


def _peek_camera_success() -> dict[str, Any]:
    return {
        "person_visible": True,
        "full_body_in_frame": True,
        "facing_camera": True,
        "stick_visible": True,
        "setup_framing_passed": True,
        "setup": "full body with stick",
        "observation": "I can see you head to toes — stick in hand, ready to go.",
        "available": True,
        "source": "gemini-flash",
        "raw": "PERSON: yes\nFULL_BODY: yes\nFACING: yes\nSTICK: yes\nSETUP: full body with stick",
    }


def _peek_camera_framing_fail() -> dict[str, Any]:
    return {
        "person_visible": True,
        "full_body_in_frame": False,
        "facing_camera": True,
        "stick_visible": False,
        "setup_framing_passed": False,
        "setup": "head and torso only",
        "observation": "Can't see your feet yet — step back so I can see you head to toes.",
        "available": True,
        "source": "gemini-flash",
        "raw": "PERSON: yes\nFULL_BODY: no\nFACING: yes\nSTICK: no\nSETUP: head and torso only",
    }


def _peek_warmup_success() -> dict[str, Any]:
    return {
        "available": True,
        "observation": "Good motion — you moved through the full range on every rep.",
        "frames_analyzed": 4,
        "source": "gemini-flash",
    }


def _start_warmup_timer_success() -> dict[str, Any]:
    return {
        "status": "started",
        "duration_seconds": 30,
        "move": "alternating taps",
    }


def _set_focus_drill_success() -> dict[str, Any]:
    # ADK env sim returns the dict verbatim regardless of args; the agent only
    # needs an acknowledgment.
    return {"status": "set", "drill_id": "wristshot"}


def _start_rep_capture_success() -> dict[str, Any]:
    return {
        "rep_id": _EVAL_REP_ID,
        "drill_id": "wristshot",
        "status": "capture_requested",
    }


def _stop_rep_capture_success() -> dict[str, Any]:
    return {"status": "stop_requested", "rep_id": _EVAL_REP_ID}


def _analyze_rep_success() -> dict[str, Any]:
    return {
        "status": "queued",
        "rep_id": _EVAL_REP_ID,
        "job_id": "job-eval-0001",
    }


def _get_rep_result_ready() -> dict[str, Any]:
    return {
        "status": "ready",
        "rep_id": _EVAL_REP_ID,
        "scores": {
            "front_knee_bend": 7.0,
            "weight_transfer": 5.0,
            "back_leg_push": 6.5,
            "bottom_hand": 7.5,
            "top_hand": 8.0,
            "puck_starting_position": 7.0,
            "puck_position_at_contact": 6.5,
            "stick_bend": 7.0,
        },
        "weakest_metric": "weight transfer",
        "weakest_score": 5.0,
        "coach_summary": "Nice quiet hands. Biggest unlock is weight transfer — feel like you're pushing off the back leg.",
    }


def _get_rep_result_processing() -> dict[str, Any]:
    return {
        "status": "processing",
        "rep_id": _EVAL_REP_ID,
        "phase": "running_pose_estimation",
    }


def _recommend_drill_success() -> dict[str, Any]:
    return {
        "drill_id": "weight_transfer_t_drill",
        "name": "T-drill weight transfer",
        "why": "Targets your weakest metric (weight transfer). 3 sets of 5 reps focusing on pushing off the back leg.",
    }


def _end_session_recap_success() -> dict[str, Any]:
    return {
        "status": "ended",
        "summary": "Great work today — strong hands, work on weight transfer next time.",
        "highlights": ["quiet hands", "consistent stance"],
        "homework": "T-drill, 3 sets of 5 reps",
    }


def _show_iq_visual_success() -> dict[str, Any]:
    return {"status": "shown", "scenario_id": "two_on_one_right_lane"}


def _mark_iq_answer_success() -> dict[str, Any]:
    return {"status": "recorded", "answered_correctly": True}


def _lookup_drill_knowledge_success() -> dict[str, Any]:
    """Synthetic grounded retrieval hit.

    Mirrors the shape returned by :func:`app.tools.grounding.lookup_drill_knowledge`
    when the real Vertex AI Search data store has matching documents. The
    snippet quotes the corpus's "Fix cue:" line so the coach can speak it
    verbatim during the recap, which is the demo path Phase 3 unlocks.
    """
    return {
        "available": True,
        "query": "weight transfer wristshot drill",
        "results": [
            {
                "title": "metrics-wristshot.md",
                "snippet": (
                    "weight transfer -- Drives power into the shot via the legs, "
                    "not just the arms. Fix cue: \"Drive your weight from back "
                    "foot to front foot through the puck.\" Recommended drill: "
                    "wall-shoot weight-transfer drill."
                ),
                "uri": "gs://puck-buddy-drill-knowledge/metrics-wristshot.md",
            }
        ],
        "summary": (
            "Weight transfer drills focus on shifting body weight from the back "
            "foot to the front foot through the puck to add lower-body power."
        ),
    }


def _lookup_drill_knowledge_miss() -> dict[str, Any]:
    """Synthetic grounded retrieval miss.

    Use for the negative-path eval: prove the agent falls back gracefully
    (uses prompt knowledge / `recommend_drill`) when the data store has
    nothing on the query.
    """
    return {
        "available": False,
        "query": "reverse triple axel windshot drill",
        "results": [],
        "summary": "",
        "reason": "no matching documents",
    }


_ALWAYS = 1.0
_FRAMING_FAILURE_SEED = 42
_RESULT_PROCESSING_SEED = 137


def _tool(tool_name: str, response: dict[str, Any], *, extras: list[InjectionConfig] | None = None) -> ToolSimulationConfig:
    """Build a ToolSimulationConfig that always returns ``response`` unless an
    earlier injection in ``extras`` matches first."""
    configs: list[InjectionConfig] = list(extras or [])
    configs.append(
        InjectionConfig(
            injection_probability=_ALWAYS,
            injected_response=response,
        )
    )
    return ToolSimulationConfig(
        tool_name=tool_name,
        injection_configs=configs,
    )


def _happy_tool_configs() -> list[ToolSimulationConfig]:
    return [
        _tool("peek_camera", _peek_camera_success()),
        _tool("peek_warmup", _peek_warmup_success()),
        _tool("start_warmup_timer", _start_warmup_timer_success()),
        _tool("set_focus_drill", _set_focus_drill_success()),
        _tool("start_rep_capture", _start_rep_capture_success()),
        _tool("stop_rep_capture", _stop_rep_capture_success()),
        _tool("analyze_rep", _analyze_rep_success()),
        _tool("get_rep_result", _get_rep_result_ready()),
        _tool("recommend_drill", _recommend_drill_success()),
        _tool("end_session_recap", _end_session_recap_success()),
        _tool("show_iq_visual", _show_iq_visual_success()),
        _tool("mark_iq_answer", _mark_iq_answer_success()),
        _tool("lookup_drill_knowledge", _lookup_drill_knowledge_success()),
    ]


def _failure_tool_configs() -> list[ToolSimulationConfig]:
    """Happy mocks plus targeted edge-case injections.

    The ordering inside each ToolSimulationConfig matters: the first
    InjectionConfig whose probability/match passes wins, so we put the
    failure injection BEFORE the happy fallback.
    """
    framing_fail = InjectionConfig(
        injection_probability=0.6,
        random_seed=_FRAMING_FAILURE_SEED,
        injected_response=_peek_camera_framing_fail(),
    )
    result_processing = InjectionConfig(
        injection_probability=0.7,
        random_seed=_RESULT_PROCESSING_SEED,
        injected_response=_get_rep_result_processing(),
    )
    return [
        _tool("peek_camera", _peek_camera_success(), extras=[framing_fail]),
        _tool("peek_warmup", _peek_warmup_success()),
        _tool("start_warmup_timer", _start_warmup_timer_success()),
        _tool("set_focus_drill", _set_focus_drill_success()),
        _tool("start_rep_capture", _start_rep_capture_success()),
        _tool("stop_rep_capture", _stop_rep_capture_success()),
        _tool(
            "analyze_rep",
            _analyze_rep_success(),
            extras=[
                InjectionConfig(
                    injection_probability=0.2,
                    random_seed=_RESULT_PROCESSING_SEED,
                    injected_error=InjectedError(
                        injected_http_error_code=504,
                        error_message="Analysis pipeline slow — try again.",
                    ),
                )
            ],
        ),
        _tool("get_rep_result", _get_rep_result_ready(), extras=[result_processing]),
        _tool("recommend_drill", _recommend_drill_success()),
        _tool("end_session_recap", _end_session_recap_success()),
        _tool("show_iq_visual", _show_iq_visual_success()),
        _tool("mark_iq_answer", _mark_iq_answer_success()),
        _tool(
            "lookup_drill_knowledge",
            _lookup_drill_knowledge_success(),
            extras=[
                InjectionConfig(
                    injection_probability=0.3,
                    random_seed=_RESULT_PROCESSING_SEED,
                    injected_response=_lookup_drill_knowledge_miss(),
                )
            ],
        ),
    ]


def happy_path_config() -> EnvironmentSimulationConfig:
    """Every tool succeeds. Use for baseline / persona scenarios."""
    return EnvironmentSimulationConfig(tool_simulation_configs=_happy_tool_configs())


def failure_config() -> EnvironmentSimulationConfig:
    """Adds probabilistic failures to peek_camera, analyze_rep, get_rep_result.

    Seeds are pinned so a given eval run is reproducible.
    """
    return EnvironmentSimulationConfig(tool_simulation_configs=_failure_tool_configs())


__all__ = ["happy_path_config", "failure_config"]
