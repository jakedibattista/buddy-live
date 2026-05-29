"""FastAPI entrypoint for the Buddy Live ADK service.

Exposes:
  - GET  /health -- liveness probe
  - POST /chat/completions -- OpenAI-compatible SSE chat endpoint that ElevenLabs's
        Custom LLM hits on every turn. Internally drives the ADK Agent + Runner.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
import re
from collections import defaultdict
from datetime import datetime, timezone

import sentry_sdk
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai import types as genai_types
from opentelemetry import trace

from app.agent import APP_NAME, ensure_session, get_runner, get_session_service
from app.firestore_client import session_ref
from app.models import ChatCompletionRequest, HealthResponse
from app.sse import sse_chunk, sse_done
from app.telemetry import setup_cloud_trace

load_dotenv()


class _CloudLoggingFormatter(logging.Formatter):
    """Emit JSON lines with a `severity` field so Cloud Run's logging agent
    maps Python levels to Cloud Logging severities. Without this, app WARNING/
    ERROR logs land as INFO/DEFAULT and `severity>=WARNING` filtering misses
    them."""

    def format(self, record: logging.LogRecord) -> str:
        message = record.getMessage()
        if record.exc_info:
            message = f"{message}\n{self.formatException(record.exc_info)}"
        return json.dumps(
            {"severity": record.levelname, "message": message, "logger": record.name}
        )


def _configure_logging() -> None:
    # K_SERVICE is set by Cloud Run. Use structured logs there; keep plain
    # text locally for readability.
    if os.getenv("K_SERVICE"):
        handler = logging.StreamHandler()
        handler.setFormatter(_CloudLoggingFormatter())
        root = logging.getLogger()
        root.handlers = [handler]
        root.setLevel(logging.INFO)
    else:
        logging.basicConfig(
            level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
        )


_configure_logging()
_logger = logging.getLogger("buddy_live_adk")

# Set up Cloud Trace FIRST so ADK's global TracerProvider is installed before
# any other library tries to register one. ADK's tool / agent / LLM spans
# then flow to telemetry.googleapis.com without further wiring.
setup_cloud_trace()
_tracer = trace.get_tracer("buddy_live.main")

# Initialize Sentry BEFORE FastAPI() so the FastAPI integration auto-wires
# itself. Gated on SENTRY_DSN so local dev / unset envs are a no-op.
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        release=os.getenv("SENTRY_RELEASE"),
        send_default_pii=True,
        # Full visibility for the demo; lower to 0.1-0.2 once traffic grows.
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "1.0")),
    )
    _logger.info("sentry initialized environment=%s", os.getenv("SENTRY_ENVIRONMENT", "production"))

app = FastAPI(title="Buddy Live ADK", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_session_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

_SILENCE_FILLERS = frozenset({"...", "", ".", "..", "…"})

_TURN_TIMEOUT_SECONDS = 30

# ElevenLabs / a flaky connection can fire the same final transcript several
# times in a burst (we saw 6 identical turns in one second). Collapse exact
# repeats of the same utterance within this window so the agent doesn't run
# (and double-fire tools) on every copy.
_DEDUPE_WINDOW_SECONDS = float(os.getenv("TURN_DEDUPE_WINDOW_SECS", "4"))
_recent_turns: dict[str, tuple[str, float]] = {}


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


def _persist_turn(
    session_id: str, user_text: str, coach_text: str, outcome: str, is_reconnect: bool
) -> None:
    """Write one turn (player utterance + coach reply) to the session's `turns`
    subcollection so voice/screen mismatches are auditable after the fact.
    Best-effort: never breaks the turn."""
    sref = session_ref(session_id)
    if sref is None:
        return
    sref.collection("turns").add(
        {
            "user_text": user_text,
            "coach_text": coach_text,
            "outcome": outcome,
            "is_reconnect": is_reconnect,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )


async def _persist_turn_async(
    session_id: str, user_text: str, coach_text: str, outcome: str, is_reconnect: bool
) -> None:
    if not session_id or (not user_text and not coach_text):
        return
    try:
        await asyncio.to_thread(
            _persist_turn, session_id, user_text, coach_text, outcome, is_reconnect
        )
    except Exception:
        _logger.exception("persist_turn failed session=%s", session_id)


def _clean_speaker_labels(text: str) -> str:
    if not text:
        return text
    # Strip common speaker diarization prefixes like "Stafford:" or "Coach Buddy:"
    cleaned = re.sub(r'(?i)\b(stafford|coach\s*buddy|coach|player|user):\s*', '', text)
    return cleaned.strip()


def _is_silence(text: str) -> bool:
    return text.strip() in _SILENCE_FILLERS


@app.post("/chat/completions")
async def chat_completions(payload: ChatCompletionRequest, request: Request) -> StreamingResponse:
    session_id = payload.session_identifier()
    raw_user_text = payload.latest_user_text()
    user_text = _clean_speaker_labels(raw_user_text)
    _logger.info("turn session=%s raw_user_text=%r user_text=%r", session_id, raw_user_text[:200], user_text[:200])

    if _is_silence(user_text):
        _logger.info("skipping silence filler session=%s", session_id)

        async def empty_stream():
            response_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
            yield sse_chunk(response_id, {"role": "assistant"})
            yield sse_chunk(response_id, {"content": ""})
            yield sse_chunk(response_id, {}, finish_reason="stop")
            yield sse_done()

        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    runner = get_runner()

    session_exists = False
    if not user_text:
        svc = get_session_service()
        try:
            session = await svc.get_session(
                app_name=APP_NAME, user_id="player", session_id=session_id
            )
            if session is not None:
                session_exists = True
        except Exception:
            pass

    await ensure_session(session_id, user_id="player")

    if user_text:
        new_message = genai_types.Content(
            role="user", parts=[genai_types.Part.from_text(text=user_text)]
        )
    elif session_exists:
        _logger.info("reconnect detected for session=%s, suppressing intro greeting", session_id)
        new_message = genai_types.Content(
            role="user", parts=[genai_types.Part.from_text(text="(voice connection restored - wait for user to speak)")]
        )
    else:
        new_message = genai_types.Content(
            role="user", parts=[genai_types.Part.from_text(text="(session start)")]
        )

    run_config = RunConfig(streaming_mode=StreamingMode.SSE, max_llm_calls=10)

    is_reconnect = session_exists and not user_text

    async def event_stream():
        response_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        sent_role = False
        sent_any_text = False
        full_text_parts: list[str] = []
        # Top-level span for the whole turn. ADK's agent / tool / LLM spans
        # become children of this one so Cloud Trace shows the full
        # session_id -> reasoning -> tool calls hierarchy in a single trace.
        with _tracer.start_as_current_span("buddy_live.turn") as span:
            span.set_attribute("buddy_live.session_id", session_id)
            span.set_attribute("buddy_live.user_text_len", len(user_text))
            span.set_attribute("buddy_live.is_reconnect", is_reconnect)
            span.set_attribute("buddy_live.session_existed", session_exists)
            try:
                async with _session_locks[session_id]:
                    # Collapse duplicate utterances fired in a tight burst.
                    now = time.monotonic()
                    prev = _recent_turns.get(session_id)
                    if (
                        user_text
                        and prev is not None
                        and prev[0] == user_text
                        and (now - prev[1]) < _DEDUPE_WINDOW_SECONDS
                    ):
                        _logger.info(
                            "deduped duplicate utterance session=%s text=%r",
                            session_id,
                            user_text[:80],
                        )
                        span.set_attribute("buddy_live.turn_outcome", "deduped")
                        yield sse_chunk(response_id, {"role": "assistant"})
                        yield sse_chunk(response_id, {"content": ""})
                        yield sse_chunk(response_id, {}, finish_reason="stop")
                        yield sse_done()
                        return
                    if user_text:
                        _recent_turns[session_id] = (user_text, now)

                    async with asyncio.timeout(_TURN_TIMEOUT_SECONDS):
                        async for event in runner.run_async(
                            user_id="player",
                            session_id=session_id,
                            new_message=new_message,
                            run_config=run_config,
                        ):
                            if not event.content or not event.content.parts:
                                continue
                            text_pieces: list[str] = []
                            for part in event.content.parts:
                                piece = getattr(part, "text", None) or ""
                                if piece:
                                    text_pieces.append(piece)
                            text = "".join(text_pieces)
                            if not text:
                                continue

                            is_partial = getattr(event, "partial", False)
                            if is_partial:
                                if not sent_role:
                                    yield sse_chunk(response_id, {"role": "assistant"})
                                    sent_role = True
                                yield sse_chunk(response_id, {"content": text})
                                full_text_parts.append(text)
                                sent_any_text = True
                            else:
                                if not sent_any_text:
                                    yield sse_chunk(response_id, {"role": "assistant"})
                                    sent_role = True
                                    yield sse_chunk(response_id, {"content": text})
                                    full_text_parts.append(text)
                                    sent_any_text = True

                span.set_attribute(
                    "buddy_live.response_text_len",
                    sum(len(p) for p in full_text_parts),
                )
                span.set_attribute("buddy_live.turn_outcome", "ok")

                if not sent_role:
                    yield sse_chunk(response_id, {"role": "assistant"})
                    yield sse_chunk(response_id, {"content": ""})
                yield sse_chunk(response_id, {}, finish_reason="stop")
                yield sse_done()
                await _persist_turn_async(
                    session_id, user_text, "".join(full_text_parts), "ok", is_reconnect
                )
            except TimeoutError:
                _logger.warning("turn timed out session=%s after %ds", session_id, _TURN_TIMEOUT_SECONDS)
                span.set_attribute("buddy_live.turn_outcome", "timeout")
                fallback = "Hold on one sec — let me catch up. What were you saying?"
                if not sent_role:
                    yield sse_chunk(response_id, {"role": "assistant"})
                yield sse_chunk(response_id, {"content": fallback})
                yield sse_chunk(response_id, {}, finish_reason="stop")
                yield sse_done()
                await _persist_turn_async(
                    session_id, user_text, "".join(full_text_parts) or fallback, "timeout", is_reconnect
                )
            except Exception as exc:
                _logger.exception("chat_completions stream failed")
                span.set_attribute("buddy_live.turn_outcome", "error")
                span.record_exception(exc)
                fallback = "Sorry, I glitched. Let's try that again."
                if not sent_role:
                    yield sse_chunk(response_id, {"role": "assistant"})
                yield sse_chunk(response_id, {"content": fallback})
                yield sse_chunk(response_id, {}, finish_reason="stop")
                yield sse_done()
                await _persist_turn_async(
                    session_id, user_text, "".join(full_text_parts) or fallback, "error", is_reconnect
                )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
