"""Environment Simulation config for Buddy Live evals.

Hermetic mocks for every tool the production agent calls so `adk eval` runs
without touching Firebase, modelforpuckbuddy, ElevenLabs, or any other live
service. The simulator intercepts each tool call via the
`before_tool_callback` hook and returns a deterministic synthetic response.

Two configs are exported:

- :func:`happy_path_config` — every tool succeeds. Use this for baseline
  scenarios (happy flow, sub-agent transfer, persona robustness).
- :func:`failure_config` — adds probabilistic injections that reproduce the
  edge cases we want Track 2 to demonstrate the agent surviving (analysis
  still processing on first poll). Use this for the "before / after" demo
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


def _lookup_warmup_moves_success() -> dict[str, Any]:
    return {
        "available": True,
        "category": "general",
        "focus_drill": None,
        "moves": [
            {
                "label": "Arm circles",
                "exercise": "slow arm circles with arms out wide",
                "spoken_demo_under_10": "Spread your arms like airplane wings.",
                "duration_seconds": 30,
            }
        ],
        "source": "static_catalog",
        "grounded": False,
        "hint": "Run each move for 30 seconds.",
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


def _set_iq_question_goal_success() -> dict[str, Any]:
    return {"status": "ok", "question_count": 8}


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


def _remember_player_profile_success() -> dict[str, Any]:
    return {"status": "saved", "player_name": "Marcus", "age": 11}


def _load_player_memory_returning() -> dict[str, Any]:
    return {
        "available": True,
        "has_prior_session": True,
        "player_name": "Marcus",
        "sessions_found": 1,
        "drill": "wristshot",
        "rep_count": 2,
        "weakest_metric": "weight_transfer",
        "weakest_metric_label": "weight transfer",
        "summary_hint": (
            "Last time you worked on wristshot — 2 reps. "
            "Biggest unlock was your weight transfer."
        ),
        "session_date": "2026-05-27T18:00:00+00:00",
        "prior_session_id": "eval-session-prior-001",
        "user_id": "eval_player",
    }


def _load_player_memory_new_player() -> dict[str, Any]:
    return {
        "available": True,
        "has_prior_session": False,
        "player_name": "Marcus",
        "sessions_found": 0,
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
        _tool("lookup_warmup_moves", _lookup_warmup_moves_success()),
        _tool("start_warmup_timer", _start_warmup_timer_success()),
        _tool("set_focus_drill", _set_focus_drill_success()),
        _tool("set_iq_question_goal", _set_iq_question_goal_success()),
        _tool("start_rep_capture", _start_rep_capture_success()),
        _tool("stop_rep_capture", _stop_rep_capture_success()),
        _tool("analyze_rep", _analyze_rep_success()),
        _tool("get_rep_result", _get_rep_result_ready()),
        _tool("recommend_drill", _recommend_drill_success()),
        _tool("end_session_recap", _end_session_recap_success()),
        _tool("show_iq_visual", _show_iq_visual_success()),
        _tool("mark_iq_answer", _mark_iq_answer_success()),
        _tool("lookup_drill_knowledge", _lookup_drill_knowledge_success()),
        _tool("remember_player_profile", _remember_player_profile_success()),
        _tool("load_player_memory", _load_player_memory_new_player()),
    ]


def _failure_tool_configs() -> list[ToolSimulationConfig]:
    """Happy mocks plus targeted edge-case injections.

    The ordering inside each ToolSimulationConfig matters: the first
    InjectionConfig whose probability/match passes wins, so we put the
    failure injection BEFORE the happy fallback.
    """
    result_processing = InjectionConfig(
        injection_probability=0.7,
        random_seed=_RESULT_PROCESSING_SEED,
        injected_response=_get_rep_result_processing(),
    )
    return [
        _tool("lookup_warmup_moves", _lookup_warmup_moves_success()),
        _tool("start_warmup_timer", _start_warmup_timer_success()),
        _tool("set_focus_drill", _set_focus_drill_success()),
        _tool("set_iq_question_goal", _set_iq_question_goal_success()),
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
        _tool("remember_player_profile", _remember_player_profile_success()),
        _tool("load_player_memory", _load_player_memory_new_player()),
    ]


def marcus_returning_memory_response() -> dict[str, Any]:
    """Eval mock: Marcus returning player with ``eval_player`` user_id."""
    return _load_player_memory_returning()


def happy_path_config() -> EnvironmentSimulationConfig:
    """Every tool succeeds. Use for baseline / persona scenarios."""
    return EnvironmentSimulationConfig(tool_simulation_configs=_happy_tool_configs())


def failure_config() -> EnvironmentSimulationConfig:
    """Adds probabilistic failures to analyze_rep / get_rep_result.

    Seeds are pinned so a given eval run is reproducible.
    """
    return EnvironmentSimulationConfig(tool_simulation_configs=_failure_tool_configs())


__all__ = ["happy_path_config", "failure_config", "marcus_returning_memory_response"]
