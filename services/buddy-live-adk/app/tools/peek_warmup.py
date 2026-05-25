"""peek_warmup tool: vision check for off-ice warm-up movements.

Unlike peek_camera (setup framing), this tool evaluates whether the player is
doing a specific warm-up move and gives plain-language coach feedback. It does
NOT change setup_framing_passed or advance session phase.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from google.adk.tools.tool_context import ToolContext
from google.genai import Client
from google.genai import types as genai_types

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)

_WARMUP_PROMPT = (
    "You analyze a webcam frame for a youth hockey coach during OFF-ICE warm-up.\n"
    "Reply in EXACTLY this format (4 lines):\n"
    "MOVING: yes, no, or unclear\n"
    "FORM: good, adjust, or unclear\n"
    "SETUP: one plain phrase (e.g. \"doing arm circles\", \"standing still\", \"stick moving side to side\")\n"
    "COACH: one short sentence the coach should say aloud\n\n"
    "Rules:\n"
    "- Warm-up is about getting loose — be encouraging, not picky.\n"
    "- MOVING=yes if the player is clearly doing the asked movement or just finished it.\n"
    "- FORM=good if they're trying the move in roughly the right way.\n"
    "- FORM=adjust if one obvious fix would help (bigger motion, bend knees, use the stick, etc.).\n"
    "- FORM=unclear if the camera angle makes it hard to tell — COACH should say "
    "\"Keep going — I'm watching\" and ask them to stay facing the camera.\n"
    "- Use plain words a kid understands. No jargon.\n"
    "- If FORM=good, COACH should briefly celebrate (\"Nice — that's it\").\n"
    "- If FORM=adjust, COACH gives ONE simple fix, then encourages them.\n"
)


def _yes(field: str) -> bool:
    return (field or "").lower().startswith("y")


def _parse_warmup_response(raw: str) -> dict[str, Any]:
    lines = [ln.strip() for ln in (raw or "").splitlines() if ln.strip()]
    fields: dict[str, str] = {}
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip().upper()] = value.strip()

    moving_raw = (fields.get("MOVING") or "").lower()
    form_raw = (fields.get("FORM") or "unclear").lower()
    moving = moving_raw.startswith("y")
    moving_unclear = moving_raw.startswith("u") or moving_raw == ""
    form = "good" if form_raw.startswith("g") else "adjust" if form_raw.startswith("a") else "unclear"
    setup = fields.get("SETUP") or "warm-up move"
    coach_line = fields.get("COACH") or raw.strip() or "Keep going — I'm watching."

    return {
        "moving": moving,
        "moving_unclear": moving_unclear and not moving,
        "form": form,
        "setup": setup,
        "observation": coach_line,
        "available": bool(coach_line),
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persist_warmup_status(
    session_id: str,
    *,
    exercise: str,
    form: str,
    moving: bool,
    setup: str,
) -> None:
    ref = session_ref(session_id)
    if ref is None:
        return
    try:
        snap = ref.get()
        prev_count = int((snap.to_dict() or {}).get("warmup_moves_checked") or 0) if snap.exists else 0
        ref.set(
            {
                "last_warmup_exercise": exercise,
                "last_warmup_form": form,
                "last_warmup_moving": moving,
                "last_warmup_setup": setup,
                "warmup_moves_checked": prev_count + 1,
                "warmup_peek_updated_at": _now_iso(),
            },
            merge=True,
        )
    except Exception:
        _logger.exception("peek_warmup status write failed")


def _warmup_unavailable(session_id: str | None, observation: str) -> dict[str, Any]:
    return {
        "observation": observation,
        "available": False,
        "moving": False,
        "form": "unclear",
    }


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def _get_peek_url(session_id: str) -> str | None:
    ref = session_ref(session_id)
    if ref is None:
        return None
    snap = ref.get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    return data.get("peek_url")


def peek_warmup(exercise: str, tool_context: ToolContext) -> dict[str, Any]:
    """Watch the player's warm-up move and return plain-language feedback.

    Call this after the player tries each warm-up move (arm circles, marching,
    stick taps, shadow shot). Does not affect setup framing.

    Args:
        exercise: Plain description of what they should be doing, e.g.
            "slow arm circles with arms out wide" or
            "slow pretend wrist shot with knees bent".

    Returns:
        Dict with `form` ("good", "adjust", or "unclear"), `moving`, and
        `observation` (one sentence for the coach to say aloud).
    """
    session_id = _get_session_id(tool_context)
    exercise_label = (exercise or "warm-up move").strip()
    if not session_id:
        return _warmup_unavailable(None, "Camera unavailable: no active session.")

    peek_url = _get_peek_url(session_id)
    if not peek_url:
        return _warmup_unavailable(session_id, "Camera unavailable: no recent frame uploaded yet.")

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(peek_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        _logger.warning("peek_warmup frame fetch failed: %s", exc)
        return _warmup_unavailable(session_id, "Camera glitched — couldn't grab a frame.")

    try:
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _warmup_unavailable(session_id, "Camera unavailable: vision API not configured.")
        genai = Client(api_key=api_key)
        model = os.getenv("PEEK_MODEL", os.getenv("GEMINI_MODEL", "gemini-flash-latest"))
        response = genai.models.generate_content(
            model=model,
            contents=[
                genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                genai_types.Part.from_text(
                    text=f"{_WARMUP_PROMPT}\n\nWarm-up move to check: {exercise_label}"
                ),
            ],
            config=genai_types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=512,
            ),
        )
        text = (response.text or "").strip()
        if not text and response.candidates:
            parts = response.candidates[0].content.parts if response.candidates[0].content else []
            text = " ".join((p.text or "").strip() for p in parts).strip()
        parsed = _parse_warmup_response(text)
        _persist_warmup_status(
            session_id,
            exercise=exercise_label,
            form=str(parsed.get("form") or "unclear"),
            moving=bool(parsed.get("moving")),
            setup=str(parsed.get("setup") or ""),
        )
        _logger.info(
            "peek_warmup session=%s exercise=%r form=%s moving=%s observation=%r",
            session_id,
            exercise_label,
            parsed.get("form"),
            parsed.get("moving"),
            parsed.get("observation"),
        )
        return {
            **parsed,
            "exercise": exercise_label,
            "source": "gemini-flash",
            "raw": text,
        }
    except Exception as exc:
        _logger.exception("peek_warmup Gemini call failed")
        return _warmup_unavailable(session_id, f"Vision error: {type(exc).__name__}")
