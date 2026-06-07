"""ADK 2.0 Agent + Runner factory for Buddy Live.

Structure (ADK 2.0 sub-agent pattern):

  buddy_live_coach (LlmAgent, root)
    ├─ drill_coach (LlmAgent, sub_agent) — rep capture, analysis, recap
    └─ iq_coach (LlmAgent, sub_agent) — Hockey IQ practice mode

The root agent runs opening, warm-up, and setup. After setup it transfers
to drill_coach for drill readiness through session recap. IQ delegation
works via transfer_to_agent.

Why this split:
- Isolates the new IQ practice feature from the mature shooting flow so
  prompt changes to one don't risk regressing the other.
- Gives each agent a smaller, focused instruction set the model can
  follow more reliably than one monolithic prompt.

All agents share the same Firestore-driven phase guard (BeforeToolCallback)
so they cannot, for example, call start_rep_capture before a drill is set.

Sessions are managed per ElevenLabs conversation via SessionService -- we
map the `arbitrary_identifier` from the ElevenLabs Custom LLM extra body
to an ADK session_id, so memory persists across turns.

When adding or renaming tools/sub-agents here, keep evals/agent_module/agent.py
in lockstep (see services/buddy-live-adk/evals/README.md).
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
from app.firestore_client import session_ref
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

_logger = logging.getLogger(__name__)

APP_NAME = "buddy-live"


_model: Gemini | None = None


def _build_model() -> Gemini:
    """Shared Gemini model (one instance reused by all three agents).

    Gemini periodically returns 503 UNAVAILABLE (and occasionally 5xx/429)
    during brief capacity blips. Without retries these surface as a failed
    turn -- the player hears "I glitched" and the ElevenLabs conversation can
    drop. The google-genai client retries these status codes in-process
    (including mid-stream), with short backoff so a live voice turn still
    resolves quickly.

    The agents share identical model config, so we build one instance and
    cache it rather than constructing one per agent.
    """
    global _model
    if _model is None:
        model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
        _model = Gemini(
            model=model_name,
            retry_options=genai_types.HttpRetryOptions(
                attempts=3,
                initial_delay=1.0,
                max_delay=4.0,
                exp_base=2.0,
                http_status_codes=[429, 500, 502, 503, 504],
            ),
        )
    return _model

_agent: Agent | None = None
_runner: Runner | None = None
_session_service: BaseSessionService | None = None


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
            start_warmup_timer,
        ],
        before_tool_callback=phase_guard,
    )


def _build_iq_coach() -> Agent:
    """IQ Coach sub-agent: handles Hockey IQ Practice mode end-to-end."""
    return Agent(
        name="iq_coach",
        description=(
            "Hockey IQ Practice coach. Takes over when the player lacks "
            "space to shoot. Player picks question count; optional movement "
            "breaks every 3 scenarios; show_iq_visual + wrap-up recap."
        ),
        model=_build_model(),
        instruction=IQ_COACH_PROMPT,
        tools=[
            set_iq_question_goal,
            show_iq_visual,
            mark_iq_answer,
            lookup_drill_knowledge,
            start_warmup_timer,
            end_session_recap,
        ],
        before_tool_callback=phase_guard,
    )


def _build_agent() -> Agent:
    """Root coach: opening, warm-up, setup. Delegates drill and IQ flows."""
    return Agent(
        name="buddy_live_coach",
        description="Real-time hockey shooting coach (voice + webcam).",
        model=_build_model(),
        instruction=COACH_SETH_LIVE_PROMPT,
        tools=[
            lookup_warmup_moves,
            start_warmup_timer,
            set_focus_drill,
            remember_player_profile,
            load_player_memory,
        ],
        sub_agents=[
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
    Firestore live_sessions document. When the Firestore doc exists, copies its
    Firebase ``user_id`` into ADK state so ``load_player_memory`` can scope
    lookups to this browser's anonymous auth (avoids first-name collisions).

    The drill choice is no longer seeded here -- Coach Buddy asks the player
    at the top of the conversation and relies on ADK session memory to carry
    the answer through the session.
    """
    svc = get_session_service()
    try:
        session = await svc.get_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id
        )
    except Exception:
        session = None

    firebase_user_id: str | None = None
    ref = session_ref(session_id)
    if ref is not None:
        try:
            snap = ref.get()
            if snap.exists:
                raw = (snap.to_dict() or {}).get("user_id")
                if raw and str(raw).strip().lower() not in {"", "anonymous"}:
                    firebase_user_id = str(raw).strip()
        except Exception:
            _logger.exception("ensure_session firestore user_id read failed")

    initial_state: dict[str, str] = {"session_id": session_id}
    if firebase_user_id:
        initial_state["user_id"] = firebase_user_id

    if session is None:
        session = await svc.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
            state=initial_state,
        )
    elif firebase_user_id and (session.state or {}).get("user_id") != firebase_user_id:
        # ADK has no update_session; merge into existing state dict in-place.
        if session.state is None:
            session.state = {}
        session.state["session_id"] = session_id
        session.state["user_id"] = firebase_user_id

    return session.id
