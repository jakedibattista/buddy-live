"""FastAPI entrypoint for the Buddy Live ADK service.

Exposes:
  - GET  /health -- liveness probe
  - POST /chat/completions -- OpenAI-compatible SSE chat endpoint that ElevenLabs's
        Custom LLM hits on every turn. Internally drives the ADK Agent + Runner.
"""
from __future__ import annotations

import logging
import os
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai import types as genai_types

from app.agent import APP_NAME, ensure_session, get_runner
from app.models import ChatCompletionRequest, HealthResponse
from app.sse import sse_chunk, sse_done

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
_logger = logging.getLogger("buddy_live_adk")

app = FastAPI(title="Buddy Live ADK", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.post("/chat/completions")
async def chat_completions(payload: ChatCompletionRequest, request: Request) -> StreamingResponse:
    session_id = payload.session_identifier()
    user_text = payload.latest_user_text()
    _logger.info("turn session=%s user_text=%r", session_id, user_text[:200])

    runner = get_runner()
    await ensure_session(session_id, user_id="player")

    if user_text:
        new_message = genai_types.Content(
            role="user", parts=[genai_types.Part.from_text(text=user_text)]
        )
    else:
        new_message = genai_types.Content(
            role="user", parts=[genai_types.Part.from_text(text="(session start)")]
        )

    run_config = RunConfig(streaming_mode=StreamingMode.SSE)

    async def event_stream():
        response_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        sent_role = False
        sent_any_text = False
        full_text_parts: list[str] = []
        try:
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
                    # Final aggregated event -- only forward if we never streamed
                    # any partials (some model backends skip partials).
                    if not sent_any_text:
                        yield sse_chunk(response_id, {"role": "assistant"})
                        sent_role = True
                        yield sse_chunk(response_id, {"content": text})
                        sent_any_text = True

            if not sent_role:
                # No content at all -- emit empty assistant turn so ElevenLabs doesn't hang.
                yield sse_chunk(response_id, {"role": "assistant"})
                yield sse_chunk(response_id, {"content": ""})
            yield sse_chunk(response_id, {}, finish_reason="stop")
            yield sse_done()
        except Exception:
            _logger.exception("chat_completions stream failed")
            if not sent_role:
                yield sse_chunk(response_id, {"role": "assistant"})
            yield sse_chunk(response_id, {"content": "Sorry, I glitched. Let's try that again."})
            yield sse_chunk(response_id, {}, finish_reason="stop")
            yield sse_done()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
