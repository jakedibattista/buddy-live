"""OpenAI-compatible Server-Sent Events helpers.

Per the ElevenLabs Custom LLM contract, we emit `data: {chat.completion.chunk}\\n\\n`
lines and terminate with `data: [DONE]\\n\\n`. Pattern from
https://elevenlabs.io/blog/practical-guide-open-source-agent-frameworks-and-elevenagents.
"""
from __future__ import annotations

import json
from typing import Any


def sse_chunk(
    response_id: str,
    delta: dict[str, Any],
    finish_reason: str | None = None,
) -> str:
    payload = {
        "id": response_id,
        "object": "chat.completion.chunk",
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(payload)}\n\n"


def sse_done() -> str:
    return "data: [DONE]\n\n"
