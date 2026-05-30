"""ADK 2.0 Agent + Runner factory for Buddy Live.

Structure (ADK 2.0 sub-agent pattern):

  buddy_live_coach (LlmAgent, root)
    ├─ vision_coach (LlmAgent, sub_agent) — peek_camera, peek_warmup
    ├─ drill_coach (LlmAgent, sub_agent) — rep capture, analysis, recap
    └─ iq_coach (LlmAgent, sub_agent) — Hockey IQ practice mode

The root agent runs opening, warm-up, and setup. After setup it transfers
to drill_coach for drill readiness through session recap. IQ and vision
delegation work the same as before (transfer_to_agent).

Why this split:
- Isolates the new IQ practice feature from the mature shooting flow so
  prompt changes to one don't risk regressing the other.
- Isolates vision tool loops (framing retries) from the main coaching prompt.
- Gives each agent a smaller, focused instruction set the model can
  follow more reliably than one monolithic prompt.

All agents share the same Firestore-driven phase guard (BeforeToolCallback)
so they cannot, for example, call start_rep_capture before framing passes.

Sessions are managed per ElevenLabs conversation via SessionService -- we
map the `arbitrary_identifier` from the ElevenLabs Custom LLM extra body
to an ADK session_id, so memory persists across turns.
"""
from __future__ import annotations

import logging
import os

from google.adk.agents import Agent
from google.adk.models import Gemini
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, InMemorySessionService
from google.genai import types as genai_types

from app.callbacks import phase_guard
from app.prompts import (
    COACH_SETH_LIVE_PROMPT,
    DRILL_COACH_PROMPT,
    IQ_COACH_PROMPT,
    VISION_COACH_PROMPT,
)
from app.tools import (
    analyze_rep,
    end_session_recap,
    get_rep_result,
    load_player_memory,
    lookup_drill_knowledge,
    mark_iq_answer,
    remember_player_profile,
    peek_camera,
    peek_warmup,
    recommend_drill,
    set_focus_drill,
    show_iq_visual,
    start_rep_capture,
    start_warmup_timer,
    stop_rep_capture,
)

_logger = logging.getLogger(__name__)

APP_NAME = "buddy-live"


def _build_model() -> Gemini:
    """Gemini model with transient-error retries.

    Gemini periodically returns 503 UNAVAILABLE (and occasionally 5xx/429)
    during brief capacity blips. Without retries these surface as a failed
    turn -- the player hears "I glitched" and the ElevenLabs conversation can
    drop. The google-genai client retries these status codes in-process
    (including mid-stream), with short backoff so a live voice turn still
    resolves quickly.
    """
    model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    return Gemini(
        model=model_name,
        retry_options=genai_types.HttpRetryOptions(
            attempts=3,
            initial_delay=1.0,
            max_delay=4.0,
            exp_base=2.0,
            http_status_codes=[429, 500, 502, 503, 504],
        ),
    )

_agent: Agent | None = None
_runner: Runner | None = None
_session_service: BaseSessionService | None = None


def _build_vision_coach() -> Agent:
    """Vision sub-agent: automated peek_camera / peek_warmup checks."""
    return Agent(
        name="vision_coach",
        description=(
            "Webcam vision specialist. Handles setup framing (peek_camera) "
            "and optional warm-up form checks (peek_warmup), then transfers "
            "back to the main coach."
        ),
        model=_build_model(),
        instruction=VISION_COACH_PROMPT,
        tools=[peek_camera, peek_warmup],
        before_tool_callback=phase_guard,
    )


def _build_drill_coach() -> Agent:
    """Drill sub-agent: scored rep capture, analysis, review, and recap."""
    return Agent(
        name="drill_coach",
        description=(
            "Shooting drill specialist. Handles drill readiness, the one "
            "scored rep, analysis wait + inline IQ chat, scorecard review, "
            "and session recap."
        ),
        model=_build_model(),
        instruction=DRILL_COACH_PROMPT,
        tools=[
            start_rep_capture,
            stop_rep_capture,
            analyze_rep,
            get_rep_result,
            recommend_drill,
            end_session_recap,
            lookup_drill_knowledge,
        ],
        before_tool_callback=phase_guard,
    )


def _build_iq_coach() -> Agent:
    """IQ Coach sub-agent: handles Hockey IQ Practice mode end-to-end."""
    return Agent(
        name="iq_coach",
        description=(
            "Hockey IQ Practice coach. Takes over when the player lacks "
            "space to shoot. Runs 8-10 game-situation scenarios with the "
            "show_iq_visual tool, encourages discussion, then wraps up."
        ),
        model=_build_model(),
        instruction=IQ_COACH_PROMPT,
        tools=[show_iq_visual, mark_iq_answer, lookup_drill_knowledge],
        before_tool_callback=phase_guard,
    )


def _build_agent() -> Agent:
    """Root coach: opening, warm-up, setup. Delegates drill, IQ, and vision."""
    return Agent(
        name="buddy_live_coach",
        description="Real-time hockey shooting coach (voice + webcam).",
        model=_build_model(),
        instruction=COACH_SETH_LIVE_PROMPT,
        tools=[
            start_warmup_timer,
            set_focus_drill,
            remember_player_profile,
            load_player_memory,
        ],
        sub_agents=[
            _build_vision_coach(),
            _build_drill_coach(),
            _build_iq_coach(),
        ],
        before_tool_callback=phase_guard,
    )


def get_session_service() -> BaseSessionService:
    global _session_service
    if _session_service is None:
        _session_service = InMemorySessionService()
    return _session_service


def get_agent() -> Agent:
    global _agent
    if _agent is None:
        _agent = _build_agent()
    return _agent


def get_runner() -> Runner:
    global _runner
    if _runner is None:
        _runner = Runner(
            agent=get_agent(),
            app_name=APP_NAME,
            session_service=get_session_service(),
        )
    return _runner


async def ensure_session(session_id: str, user_id: str = "player") -> str:
    """Get-or-create an ADK session and return its id.

    Seeds session state with `session_id` so tools can address the matching
    Firestore live_sessions document. The drill choice is no longer seeded
    here -- Coach Buddy asks the player at the top of the conversation and
    relies on ADK session memory to carry the answer through the session.
    """
    svc = get_session_service()
    try:
        session = await svc.get_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id
        )
    except Exception:
        session = None

    if session is None:
        session = await svc.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
            state={
                "session_id": session_id,
                "user_id": user_id,
            },
        )
    return session.id
