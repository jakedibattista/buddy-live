"""Shared helpers for the Buddy Live function tools.

These tiny utilities were previously copy-pasted across nearly every tool
module (``_now_iso``, ``_get_session_id``, ``_yes``, the structured-reply line
parser, and the ``session_summaries`` collection name). Centralizing them keeps
the per-tool files focused on their actual logic and removes the drift risk of
maintaining the same snippet in 8-9 places.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from google.adk.tools.tool_context import ToolContext

SESSION_SUMMARIES_COLLECTION = "session_summaries"


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def get_session_id(tool_context: ToolContext) -> str | None:
    """Resolve the Firestore live-session id from ADK session state."""
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def yes(field: str | None) -> bool:
    """True when a structured yes/no field starts with 'y' (case-insensitive)."""
    return (field or "").lower().startswith("y")


def parse_kv_lines(raw: str | None) -> dict[str, str]:
    """Parse ``KEY: value`` lines from a structured Gemini reply.

    Blank lines are skipped, keys are upper-cased and stripped, and only the
    first ``:`` splits key from value so values may themselves contain colons.
    """
    fields: dict[str, str] = {}
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip().upper()] = value.strip()
    return fields


__all__ = [
    "SESSION_SUMMARIES_COLLECTION",
    "now_iso",
    "get_session_id",
    "yes",
    "parse_kv_lines",
]
