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
from google.adk.tools.environment_simulation import EnvironmentSimulationFactory

from app.prompts import COACH_SETH_LIVE_PROMPT, IQ_COACH_PROMPT
from app.tools import (
    analyze_rep,
    end_session_recap,
    get_rep_result,
    lookup_drill_knowledge,
    mark_iq_answer,
    peek_camera,
    peek_warmup,
    recommend_drill,
    set_focus_drill,
    show_iq_visual,
    start_rep_capture,
    start_warmup_timer,
    stop_rep_capture,
)
from evals.environment_simulation import failure_config, happy_path_config

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
    return EnvironmentSimulationFactory.create_callback(config)


_env_sim_callback = _build_callback()
_model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")


_iq_coach = Agent(
    name="iq_coach",
    description=(
        "Hockey IQ Practice coach. Takes over when the player lacks space to "
        "shoot. Runs 8-10 game-situation scenarios with the show_iq_visual "
        "tool, encourages discussion, then wraps up."
    ),
    model=_model,
    instruction=IQ_COACH_PROMPT,
    tools=[show_iq_visual, mark_iq_answer, lookup_drill_knowledge],
    before_tool_callback=_env_sim_callback,
)


root_agent = Agent(
    name="buddy_live_coach",
    description="Real-time hockey shooting coach (voice + webcam).",
    model=_model,
    instruction=COACH_SETH_LIVE_PROMPT,
    tools=[
        peek_camera,
        peek_warmup,
        start_warmup_timer,
        set_focus_drill,
        start_rep_capture,
        stop_rep_capture,
        analyze_rep,
        get_rep_result,
        recommend_drill,
        end_session_recap,
        lookup_drill_knowledge,
    ],
    sub_agents=[_iq_coach],
    before_tool_callback=_env_sim_callback,
)


__all__ = ["root_agent"]
