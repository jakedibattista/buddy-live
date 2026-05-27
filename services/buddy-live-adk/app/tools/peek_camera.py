"""peek_camera tool: one-shot Gemini Flash analysis of the player's webcam frame.

Architecture:
  - The web client periodically uploads the most recent webcam JPEG to
    `live_sessions/{sid}/peek_latest.jpg` in Firebase Storage AND mirrors the
    download URL into Firestore at `live_sessions/{sid}.peek_url`.
  - This tool reads that URL, fetches the JPEG, and asks gemini-flash-latest a
    grounding question.
  - We use single-shot generate_content (not the Live API persistent session) to
    avoid the 1-FPS / 2-minute session caps and keep cost per call near zero.

Falls back gracefully if Firestore/Storage aren't reachable so local dev works.
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
_PEEK_PROMPT_PREAMBLE = (
    "You analyze a webcam frame for a hockey coach.\n"
    "Reply in EXACTLY this format (6 lines):\n"
    "PERSON: yes or no\n"
    "FULL_BODY: yes or no\n"
    "FACING: yes or no\n"
    "STICK: yes or no\n"
    "SETUP: one phrase (e.g. \"full body with stick\", \"head and feet cut off\", \"too dark\")\n"
    "COACH: one short sentence the coach should say aloud\n\n"
    "Rules:\n"
    "- PERSON=yes if you can see a human face or body.\n"
    "- FULL_BODY=yes only if head AND both legs/feet are visible (not upper-body-only).\n"
    "- FACING=yes if the player is generally facing the camera (torso/face toward lens).\n"
    "- STICK=yes if a hockey stick is visible.\n"
    "- Do NOT say PERSON=no just because there is no stick or hockey stance.\n"
    "- If FULL_BODY=no, COACH should say they can't see the player's feet yet and ask them to step back — never say you cannot see them if PERSON=yes.\n"
    "- If PERSON=yes and FULL_BODY=yes and FACING=yes, COACH should confirm you can see them clearly."
)


def _yes(field: str) -> bool:
    return (field or "").lower().startswith("y")


def _parse_peek_response(raw: str) -> dict[str, Any]:
    """Parse the structured vision reply into tool fields."""
    lines = [ln.strip() for ln in (raw or "").splitlines() if ln.strip()]
    fields: dict[str, str] = {}
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip().upper()] = value.strip()

    person_visible = _yes(fields.get("PERSON", ""))
    full_body_in_frame = _yes(fields.get("FULL_BODY", ""))
    facing_camera = _yes(fields.get("FACING", ""))
    stick_visible = _yes(fields.get("STICK", ""))
    setup = fields.get("SETUP") or (
        "full body in frame" if full_body_in_frame else "adjust framing"
    )
    coach_line = fields.get("COACH") or raw.strip() or "Couldn't tell from this frame."
    framing_passed = person_visible and full_body_in_frame and facing_camera

    return {
        "person_visible": person_visible,
        "full_body_in_frame": full_body_in_frame,
        "facing_camera": facing_camera,
        "stick_visible": stick_visible,
        "setup_framing_passed": framing_passed,
        "setup": setup,
        "observation": coach_line,
        "available": person_visible or bool(coach_line),
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persist_peek_status(
    session_id: str,
    *,
    person_visible: bool,
    full_body_in_frame: bool,
    facing_camera: bool,
    stick_visible: bool,
    setup: str,
) -> None:
    """Mirror peek results onto the session doc for the web UI."""
    ref = session_ref(session_id)
    if ref is None:
        return
    try:
        snap = ref.get()
        framing_passed = person_visible and full_body_in_frame and facing_camera
        hint = None
        if not person_visible:
            hint = "Coach can't see you — check your camera and step into frame."
        elif not full_body_in_frame:
            hint = "Can't see your feet yet — step back so Coach Buddy can see you head to toes."
        elif not facing_camera:
            hint = "Face the camera so Coach Buddy can see your stance."
        elif not stick_visible:
            hint = "Grab your stick and stay in frame."
        current_phase = (snap.to_dict() or {}).get("currentPhase") if snap.exists else None
        if current_phase == "warmup":
            ref.set({"peek_updated_at": _now_iso()}, merge=True)
            return
        locked_phases = {"scored_reps", "recap", "ended"}
        if framing_passed and current_phase not in locked_phases:
            phase = "drill_readiness"
        elif not framing_passed and current_phase not in locked_phases:
            phase = "stance_check"
        else:
            phase = current_phase
        payload: dict[str, Any] = {
            "last_peek_person_visible": person_visible,
            "last_peek_full_body_in_frame": full_body_in_frame,
            "last_peek_facing_camera": facing_camera,
            "last_peek_stick_visible": stick_visible,
            "last_peek_setup": setup,
            "setup_framing_passed": framing_passed,
            "camera_hint": hint,
            "peek_status_updated_at": _now_iso(),
        }
        if phase:
            payload["currentPhase"] = phase
        ref.set(payload, merge=True)
    except Exception:
        _logger.exception("peek_camera status write failed")


def _peek_unavailable(session_id: str | None, observation: str) -> dict[str, Any]:
    if session_id:
        _persist_peek_status(
            session_id,
            person_visible=False,
            full_body_in_frame=False,
            facing_camera=False,
            stick_visible=False,
            setup="no frame",
        )
    return {
        "observation": observation,
        "available": False,
        "person_visible": False,
        "full_body_in_frame": False,
        "facing_camera": False,
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


def peek_camera(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look at one webcam frame and answer the coach's grounding question.

    Args:
        question: A short, concrete grounding question like
            "Is the player in their shooting stance?" or
            "Is the player holding the stick correctly?".

    Returns:
        Dict with `observation` (one-sentence answer) and `source` ("gemini-flash").
        If the camera is unavailable, returns `{"observation": "...", "available": False}`.
    """
    session_id = _get_session_id(tool_context)
    if not session_id:
        return _peek_unavailable(None, "Camera unavailable: no active session.")

    peek_url = _get_peek_url(session_id)
    if not peek_url:
        return _peek_unavailable(session_id, "Camera unavailable: no recent frame uploaded yet.")

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(peek_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        _logger.warning("peek_camera frame fetch failed: %s", exc)
        return _peek_unavailable(session_id, "Camera glitched -- couldn't grab a frame.")

    try:
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _peek_unavailable(session_id, "Camera unavailable: vision API not configured.")
        genai = Client(api_key=api_key)
        model = os.getenv("PEEK_MODEL", os.getenv("GEMINI_MODEL", "gemini-flash-latest"))
        response = genai.models.generate_content(
            model=model,
            contents=[
                genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                genai_types.Part.from_text(
                    text=f"{_PEEK_PROMPT_PREAMBLE}\n\nCoach asked: {question}"
                ),
            ],
            config=genai_types.GenerateContentConfig(
                temperature=0.1,
                # 6-line structured reply ≈ 80 tokens; 128 gives headroom
                # without paying for unused output budget.
                max_output_tokens=128,
            ),
        )
        text = (response.text or "").strip()
        if not text and response.candidates:
            parts = response.candidates[0].content.parts if response.candidates[0].content else []
            text = " ".join((p.text or "").strip() for p in parts).strip()
        parsed = _parse_peek_response(text)
        _persist_peek_status(
            session_id,
            person_visible=bool(parsed.get("person_visible")),
            full_body_in_frame=bool(parsed.get("full_body_in_frame")),
            facing_camera=bool(parsed.get("facing_camera")),
            stick_visible=bool(parsed.get("stick_visible")),
            setup=str(parsed.get("setup") or ""),
        )
        _logger.info(
            "peek_camera session=%s person=%s full_body=%s facing=%s stick=%s setup=%r observation=%r",
            session_id,
            parsed.get("person_visible"),
            parsed.get("full_body_in_frame"),
            parsed.get("facing_camera"),
            parsed.get("stick_visible"),
            parsed.get("setup"),
            parsed.get("observation"),
        )
        return {
            **parsed,
            "available": parsed.get("available", False),
            "source": "gemini-flash",
            "raw": text,
        }
    except Exception as exc:
        _logger.exception("peek_camera Gemini call failed")
        return _peek_unavailable(session_id, f"Vision error: {type(exc).__name__}")
