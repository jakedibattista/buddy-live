"""ADK Agent + Runner factory for Buddy Live.

The Agent is constructed once per process (cheap, stateless). Sessions are managed
per ElevenLabs conversation via the SessionService -- we map the
`arbitrary_identifier` from the ElevenLabs Custom LLM extra body to an ADK
session_id, so memory and tool state persist across turns.
"""
from __future__ import annotations

import logging
import os

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, InMemorySessionService

from app.prompts import COACH_SETH_LIVE_PROMPT
from app.tools import (
    analyze_rep,
    end_session_recap,
    get_rep_result,
    peek_camera,
    recommend_drill,
    set_focus_drill,
    start_rep_capture,
)

_logger = logging.getLogger(__name__)

APP_NAME = "buddy-live"

_agent: Agent | None = None
_runner: Runner | None = None
_session_service: BaseSessionService | None = None


def _build_agent() -> Agent:
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    return Agent(
        name="buddy_live_coach",
        description="Real-time hockey shooting and skating coach (voice + webcam).",
        model=model,
        instruction=COACH_SETH_LIVE_PROMPT,
        tools=[
            peek_camera,
            set_focus_drill,
            start_rep_capture,
            analyze_rep,
            get_rep_result,
            recommend_drill,
            end_session_recap,
        ],
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
