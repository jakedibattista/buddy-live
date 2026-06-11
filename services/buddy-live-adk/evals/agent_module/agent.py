"""Build a copy of the production Buddy Live agent for evaluation.

This file is intentionally a thin re-build of ``app.agent`` so we don't have
to mutate the production wiring to evaluate it. Two differences from the
production agent:

1. ``before_tool_callback`` is the Environment Simulation callback instead of
   the Firestore-backed ``phase_guard``. The phase guard relies on live
   Firestore state which doesn't exist in a hermetic eval; the env sim
   replaces every tool's return value with a deterministic synthetic
   response, which is the whole point of Track 2's Agent Simulation tooling.
2. The agent is constructed at import time (no lazy factory) because the ADK
   eval CLI expects a module-level ``root_agent`` symbol.

Choose between happy-path mocks and failure-injecting mocks with the
``BUDDY_EVAL_FAILURES`` env var (set to ``1`` for failures).
"""
from __future__ import annotations

import logging
import os

from google.adk.agents import Agent
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.environment_simulation import EnvironmentSimulationFactory
from google.adk.tools.tool_context import ToolContext

from evals.adk_patches import apply_vertex_safety_adc_fix

# No-op unless BUDDY_SAFETY_VERTEX_ADC=1 — lets safety_v1 reach Vertex via ADC.
apply_vertex_safety_adc_fix()

from app.prompts import (
    COACH_SETH_LIVE_PROMPT,
    DRILL_COACH_PROMPT,
    IQ_COACH_PROMPT,
)
from app.tools import (
    analyze_rep,
    end_session_recap,
    get_rep_result,
    load_player_memory,
    lookup_drill_knowledge,
    lookup_warmup_moves,
    mark_iq_answer,
    remember_player_profile,
    recommend_drill,
    set_focus_drill,
    set_iq_question_goal,
    show_iq_visual,
    start_rep_capture,
    start_warmup_timer,
    stop_rep_capture,
)
from evals.environment_simulation import (
    failure_config,
    happy_path_config,
    marcus_returning_memory_response,
)

_logger = logging.getLogger(__name__)


def _build_callback():
    use_failures = os.getenv("BUDDY_EVAL_FAILURES", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    config = failure_config() if use_failures else happy_path_config()
    mode = "failures" if use_failures else "happy_path"
    _logger.info("env_simulation_mode=%s", mode)
    base = EnvironmentSimulationFactory.create_callback(config)

    def callback(
        tool: BaseTool,
        args: dict,
        tool_context: ToolContext,
    ):
        if tool.name == "load_player_memory":
            name = str((args or {}).get("player_name") or "").strip().lower()
            if name == "marcus":
                return marcus_returning_memory_response()
        return base(tool, args, tool_context)

    return callback


_env_sim_callback = _build_callback()
_model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")


_drill_coach = Agent(
    name="drill_coach",
    description=(
        "Shooting drill specialist. Handles drill readiness, the one "
        "scored rep, analysis wait + inline IQ chat, scorecard review, "
        "and session recap."
    ),
    model=_model,
    instruction=DRILL_COACH_PROMPT,
    tools=[
        start_rep_capture,
        stop_rep_capture,
        analyze_rep,
        get_rep_result,
        recommend_drill,
        end_session_recap,
        lookup_drill_knowledge,
        start_warmup_timer,
    ],
    before_tool_callback=_env_sim_callback,
)


_iq_coach = Agent(
    name="iq_coach",
    description=(
        "Hockey IQ Practice coach. Takes over when the player lacks space to "
        "shoot. Player-chosen question count; optional movement breaks."
    ),
    model=_model,
    instruction=IQ_COACH_PROMPT,
    tools=[
        set_iq_question_goal,
        show_iq_visual,
        mark_iq_answer,
        lookup_drill_knowledge,
        start_warmup_timer,
        end_session_recap,
    ],
    before_tool_callback=_env_sim_callback,
)


root_agent = Agent(
    name="buddy_live_coach",
    description="Real-time hockey shooting coach (voice + webcam).",
    model=_model,
    instruction=COACH_SETH_LIVE_PROMPT,
    tools=[
        lookup_warmup_moves,
        start_warmup_timer,
        set_focus_drill,
        remember_player_profile,
        load_player_memory,
    ],
    sub_agents=[_drill_coach, _iq_coach],
    before_tool_callback=_env_sim_callback,
)


__all__ = ["root_agent"]
