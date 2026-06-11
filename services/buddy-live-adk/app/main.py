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

# The app's hidden results-ready push can be re-delivered well outside the
# normal dedupe window (seen 6s apart in session live-inibrtfoscyy after voice
# churn -- the coach wrapped up twice). It only ever needs to be acted on once
# per rep, so remember handled pushes per session for much longer.
_RESULTS_PUSH_PREFIX = "(Scored rep results are ready"
_RESULTS_PUSH_WINDOW_SECONDS = 600.0
_handled_results_pushes: dict[str, tuple[str, float]] = {}


def _is_duplicate_results_push(session_id: str, text: str) -> bool:
    """True when this exact results-ready push was already handled recently."""
    if not text.startswith(_RESULTS_PUSH_PREFIX):
        return False
    now = time.monotonic()
    prev = _handled_results_pushes.get(session_id)
    if prev is not None and prev[0] == text and (now - prev[1]) < _RESULTS_PUSH_WINDOW_SECONDS:
        return True
    _handled_results_pushes[session_id] = (text, now)
    return False

# An open mic (e.g. the player chatting to someone in the room) makes
# ElevenLabs send an ever-growing transcript. Feed the agent only the tail so
# turn latency doesn't balloon and the coach reacts to the most recent words.
_MAX_USER_TEXT_CHARS = int(os.getenv("MAX_USER_TEXT_CHARS", "240"))

# Sessions whose Firestore phase we've already flipped to iq_practice on the
# iq_coach hand-off, so we write it at most once per session.
_iq_phase_marked: set[str] = set()


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


def _trim_user_text(text: str) -> str:
    """Keep only the tail of a long transcript so a rambling open mic can't
    balloon agent latency. We start the tail at a sentence boundary when one
    exists so the coach gets a clean, recent fragment to react to."""
    if not text or len(text) <= _MAX_USER_TEXT_CHARS:
        return text
    # Never trim hidden/system context messages (wrapped in parentheses, e.g.
    # the voice-reconnect note). Keeping only the tail would amputate the
    # leading "(Voice reconnected …" cue the agent keys off of, so the reconnect
    # rule never fires and the coach cold-restarts.
    if text.lstrip().startswith("("):
        return text
    tail = text[-_MAX_USER_TEXT_CHARS:]
    boundary = re.search(r'[.!?]\s+(\S)', tail)
    if boundary:
        tail = tail[boundary.start(1):]
    return tail.strip() or text[-_MAX_USER_TEXT_CHARS:].strip()


def _is_duplicate_utterance(new_text: str, prev_text: str) -> bool:
    """Decide whether an in-window utterance is a resend we should drop.

    Identical resends and shrinking prefixes collapse. A transcript that
    EXTENDS the previous one with real new content is NOT a dupe -- the player
    kept talking after we already answered the partial. Dropping it eats their
    words (session live-3gh4vmj133s5: the player's explanation after "Um..."
    was discarded and they called it out).
    """
    a, b = new_text, prev_text
    if a == b or b.startswith(a):
        return True
    if a.startswith(b):
        return len(a) - len(b) < 15
    return False


_THOUGHT_MARKER = re.compile(
    r'(?im)(?:^|\n)\s*(?:_+\s*thought\b|<\s*thought\s*>|thought\s*:|thinking\s*:)'
)


def _strip_thought_block(text: str) -> str:
    """Backstop for chain-of-thought that leaks as plain text (not a Gemini
    thought part), e.g. a turn that begins:

        _thought
        Aww, he's 5 and doesn't know ... keep it super simple.
        "No worries, Jake! ... while we wait." (21 words)
        Let's call `get_rep_result` again to check.

    When such a planning preamble is detected we keep ONLY the first quoted
    reply (the model wraps its intended spoken line in quotes); if there's no
    quoted reply we drop everything up to the marker so the reasoning never
    reaches TTS."""
    if not text or not _THOUGHT_MARKER.search(text):
        return text
    quoted = re.search(r'"([^"]{8,})"', text)
    if quoted:
        return quoted.group(1).strip()
    # No quoted reply: drop the marker line and any reasoning before it.
    return _THOUGHT_MARKER.sub('\n', text).strip()


def _clean_coach_text(text: str) -> str:
    """Strip artifacts that leak into spoken output before they reach TTS:
    speaker-label prefixes ("Stafford:", "Coach Buddy:"), chain-of-thought
    parentheticals ("(thought) I must never ..."), and leaked planning blocks
    ("_thought ... (21 words)"). The model occasionally narrates its own
    reasoning aloud despite the prompt forbidding it, so this backend guard is
    the reliable fix."""
    if not text:
        return text
    # Explicit <thought>...</thought> blocks can appear mid-sentence (seen in
    # session live-3gh4vmj133s5: "...skate around? <thought>The player needs
    # to answer...</thought>"). Remove them anywhere -- including an unclosed
    # trailing tag -- before the line-start heuristics below.
    cleaned = re.sub(r'(?is)<\s*thought\s*>.*?(?:<\s*/\s*thought\s*>|$)', ' ', text)
    cleaned = _strip_thought_block(cleaned)
    cleaned = re.sub(
        r'(?im)\b(?:stafford|coach\s*buddy|coach|buddy|player|user|assistant)\s*:\s*',
        '',
        cleaned,
    )
    cleaned = re.sub(
        r'\((?:thought|thinking|internal|aside|note)\b[^)]*\)',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    # Drop stray self-annotations like "(21 words)" the planner leaves behind.
    cleaned = re.sub(r'\(\s*\d+\s+words?\s*\)', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r'(?i)\b(?:can we help you|how can i help you|do you have any questions)\??\s*',
        '',
        cleaned,
    )
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
    return cleaned.strip()


def _set_iq_phase(session_id: str) -> None:
    sref = session_ref(session_id)
    if sref is None:
        return
    sref.set(
        {"currentPhase": "iq_practice", "iq_updated_at": datetime.now(timezone.utc).isoformat()},
        merge=True,
    )


async def _mark_iq_phase_async(session_id: str) -> None:
    """Flip the session phase to iq_practice the moment the iq_coach sub-agent
    takes over (the hand-off bridge turn), so the UI doesn't sit on a stale
    "Warm-up" label until the first show_iq_visual fires. Once per session."""
    if not session_id or session_id in _iq_phase_marked:
        return
    _iq_phase_marked.add(session_id)
    try:
        await asyncio.to_thread(_set_iq_phase, session_id)
    except Exception:
        _logger.exception("set iq phase failed session=%s", session_id)


def _is_silence(text: str) -> bool:
    return text.strip() in _SILENCE_FILLERS


@app.post("/chat/completions")
async def chat_completions(payload: ChatCompletionRequest, request: Request) -> StreamingResponse:
    session_id = payload.session_identifier()
    raw_user_text = payload.latest_user_text()
    cleaned_user_text = _clean_speaker_labels(raw_user_text)
    user_text = _trim_user_text(cleaned_user_text)
    _logger.info(
        "turn session=%s raw_user_text=%r user_text=%r",
        session_id,
        raw_user_text[:200],
        user_text[:200],
    )

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
        full_text_parts: list[str] = []
        # Top-level span for the whole turn. ADK's agent / tool / LLM spans
        # become children of this one so Cloud Trace shows the full
        # session_id -> reasoning -> tool calls hierarchy in a single trace.
        with _tracer.start_as_current_span("buddy_live.turn") as span:
            span.set_attribute("buddy_live.session_id", session_id)
            span.set_attribute("buddy_live.user_text_len", len(user_text))
            span.set_attribute("buddy_live.is_reconnect", is_reconnect)
            span.set_attribute("buddy_live.session_existed", session_exists)
            iq_active = False
            try:
                async with _session_locks[session_id]:
                    # Collapse duplicate / accumulating utterances. An open mic
                    # makes ElevenLabs resend an ever-growing transcript, so a
                    # new utterance that is a prefix/superset of the last one
                    # within the debounce window is treated as a duplicate --
                    # we don't run the agent on every incremental copy. The
                    # window slides on each copy, so the storm collapses until
                    # the player actually pauses.
                    now = time.monotonic()
                    prev = _recent_turns.get(session_id)
                    is_dupe = False
                    if (
                        cleaned_user_text
                        and prev is not None
                        and (now - prev[1]) < _DEDUPE_WINDOW_SECONDS
                    ):
                        is_dupe = _is_duplicate_utterance(cleaned_user_text, prev[0])
                    if not is_dupe and user_text:
                        is_dupe = _is_duplicate_results_push(session_id, user_text)
                    if cleaned_user_text:
                        _recent_turns[session_id] = (cleaned_user_text, now)
                    if is_dupe:
                        _logger.info(
                            "deduped duplicate/accumulating utterance session=%s text=%r",
                            session_id,
                            cleaned_user_text[:80],
                        )
                        span.set_attribute("buddy_live.turn_outcome", "deduped")
                        yield sse_chunk(response_id, {"role": "assistant"})
                        yield sse_chunk(response_id, {"content": ""})
                        yield sse_chunk(response_id, {}, finish_reason="stop")
                        yield sse_done()
                        return

                    async with asyncio.timeout(_TURN_TIMEOUT_SECONDS):
                        async for event in runner.run_async(
                            user_id="player",
                            session_id=session_id,
                            new_message=new_message,
                            run_config=run_config,
                        ):
                            if getattr(event, "author", None) == "iq_coach":
                                iq_active = True
                            if not event.content or not event.content.parts:
                                continue
                            # Skip Gemini "thought" parts -- when the model
                            # thinks, those parts carry its reasoning and must
                            # never reach TTS (we saw a "_thought ..." block get
                            # spoken to a 5yo). Only join real reply text.
                            text = "".join(
                                getattr(part, "text", None) or ""
                                for part in event.content.parts
                                if not getattr(part, "thought", False)
                            )
                            if not text:
                                continue
                            # Buffer the whole reply, then sanitize once before
                            # sending. Streaming partials straight to TTS would
                            # let leaked speaker labels / chain-of-thought
                            # ("Stafford: (thought) ...") slip out un-strippable
                            # mid-stream. Replies are short so the latency cost
                            # is small.
                            is_partial = getattr(event, "partial", False)
                            if is_partial or not full_text_parts:
                                full_text_parts.append(text)

                # Restart the dedupe window now that the run is done. The
                # check above stamps the window at turn START, so an identical
                # copy that queued behind the session lock for longer than the
                # window got re-answered (session live-3gh4vmj133s5 said
                # goodbye twice). Stamping at completion collapses it.
                if cleaned_user_text:
                    _recent_turns[session_id] = (cleaned_user_text, time.monotonic())

                coach_text = _clean_coach_text("".join(full_text_parts))
                span.set_attribute("buddy_live.response_text_len", len(coach_text))
                span.set_attribute("buddy_live.turn_outcome", "ok")

                yield sse_chunk(response_id, {"role": "assistant"})
                yield sse_chunk(response_id, {"content": coach_text})
                yield sse_chunk(response_id, {}, finish_reason="stop")
                yield sse_done()
                if iq_active:
                    await _mark_iq_phase_async(session_id)
                await _persist_turn_async(
                    session_id, user_text, coach_text, "ok", is_reconnect
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
                    session_id, user_text, _clean_coach_text("".join(full_text_parts)) or fallback, "timeout", is_reconnect
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
                    session_id, user_text, _clean_coach_text("".join(full_text_parts)) or fallback, "error", is_reconnect
                )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
