"""ADK 2.0 Agent + Runner factory for Buddy Live.

Structure (ADK 2.0 sub-agent pattern):

  buddy_live_coach (LlmAgent, root)
    └─ iq_coach (LlmAgent, sub_agent)

The root agent runs the full shooting flow (opening → warm-up → setup →
scored reps → recap). When the player doesn't have space to shoot, the
root calls transfer_to_agent("iq_coach") and the IQ sub-agent takes over
the rest of the session with its own focused prompt and a single tool
(show_iq_visual).

Why this split:
- Isolates the new IQ practice feature from the mature shooting flow so
  prompt changes to one don't risk regressing the other.
- Gives each agent a smaller, focused instruction set the model can
  follow more reliably than one monolithic prompt.

Both agents share the same Firestore-driven phase guard
(BeforeToolCallback) so they cannot, for example, call start_rep_capture
before framing passes.

Sessions are managed per ElevenLabs conversation via SessionService -- we
map the `arbitrary_identifier` from the ElevenLabs Custom LLM extra body
to an ADK session_id, so memory persists across turns.
"""
from __future__ import annotations

import logging
import os

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, InMemorySessionService

from app.callbacks import phase_guard
from app.prompts import COACH_SETH_LIVE_PROMPT, IQ_COACH_PROMPT
from app.tools import (
    analyze_rep,
    end_session_recap,
    get_rep_result,
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

_logger = logging.getLogger(__name__)

APP_NAME = "buddy-live"

_agent: Agent | None = None
_runner: Runner | None = None
_session_service: BaseSessionService | None = None


def _build_iq_coach() -> Agent:
    """IQ Coach sub-agent: handles Hockey IQ Practice mode end-to-end."""
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    return Agent(
        name="iq_coach",
        description=(
            "Hockey IQ Practice coach. Takes over when the player lacks "
            "space to shoot. Runs 8-10 game-situation scenarios with the "
            "show_iq_visual tool, encourages discussion, then wraps up."
        ),
        model=model,
        instruction=IQ_COACH_PROMPT,
        tools=[show_iq_visual, mark_iq_answer],
        before_tool_callback=phase_guard,
    )


def _build_agent() -> Agent:
    """Root coach agent: opening, shooting flow, recap. Delegates IQ mode."""
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    return Agent(
        name="buddy_live_coach",
        description="Real-time hockey shooting coach (voice + webcam).",
        model=model,
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
        ],
        sub_agents=[_build_iq_coach()],
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
