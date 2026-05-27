"""peek_warmup tool: multi-frame vision check for off-ice warm-up movements.

Unlike peek_camera (setup framing), this tool evaluates whether the player is
actually performing a specific warm-up move. Motion can't be detected from a
single JPEG, so we pull up to 3 frames spaced across the timer window from the
`peek_url_history` ring buffer that the web client writes to Firestore.

Frames are sent to gemini-flash-latest in ONE generate_content call and the
model must explicitly report MOTION (yes/no/unclear) by comparing limb /
position differences across frames. `moving` is set STRICTLY from the MOTION
field — never from a guess on a single static frame.

This tool does NOT change setup_framing_passed or session phase.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from firebase_admin import firestore
from google.adk.tools.tool_context import ToolContext
from google.genai import Client
from google.genai import types as genai_types

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)

# How many frames we try to send. With an 8-slot ring buffer at ~1.5s
# spacing during a warm-up timer we have ~12s of history to choose from;
# 4 frames spaced ≥2s apart spans ~8s and gives the model a clear motion
# arc without bloating prompt tokens.
_TARGET_FRAME_COUNT = 4
# Minimum spacing between frames in the analyzed set.
_MIN_FRAME_GAP_SECONDS = 2.0

_WARMUP_PROMPT_PREAMBLE = (
    "You are a youth hockey coach analyzing webcam frames from an OFF-ICE warm-up.\n"
    "You will receive {n} frames captured in order over a short time window.\n"
    "Compare them and decide whether the player actually performed the requested move.\n\n"
    "Reply in EXACTLY this format (5 lines, nothing else):\n"
    "MOTION: yes, no, or unclear\n"
    "MOVING: yes, no, or unclear\n"
    "FORM: good, adjust, or unclear\n"
    "SETUP: one plain phrase (e.g. \"arms making large circles\", \"standing still\", \"only stick moved\")\n"
    "COACH: one short sentence the coach should say aloud\n\n"
    "Rules:\n"
    "- MOTION=yes ONLY if limbs / body / stick are CLEARLY in different positions across the frames.\n"
    "- MOTION=no if the player looks essentially still across the frames (same pose, same limbs).\n"
    "- MOTION=unclear ONLY when frames are too similar to judge AND the player is partially out of view.\n"
    "- MOVING must match MOTION exactly (yes -> yes, no -> no, unclear -> unclear). Do not soften it.\n"
    "- If MOTION=no, COACH should gently call it out (e.g. \"I didn't see you move — let's try together\").\n"
    "- If MOTION=yes and FORM=good, COACH should briefly celebrate (\"Nice — that's the move\").\n"
    "- If MOTION=yes and FORM=adjust, COACH gives ONE simple fix.\n"
    "- If MOTION=unclear, COACH asks them to face the camera and try once more.\n"
    "- Plain words a kid understands. No jargon. No markdown. No extra lines.\n"
)


def _yes(field: str) -> bool:
    return (field or "").lower().startswith("y")


def _no(field: str) -> bool:
    return (field or "").lower().startswith("n")


def _parse_warmup_response(raw: str) -> dict[str, Any]:
    lines = [ln.strip() for ln in (raw or "").splitlines() if ln.strip()]
    fields: dict[str, str] = {}
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip().upper()] = value.strip()

    motion_raw = (fields.get("MOTION") or "").lower()
    moving_raw = (fields.get("MOVING") or "").lower()
    form_raw = (fields.get("FORM") or "unclear").lower()

    motion_detected = motion_raw.startswith("y")
    motion_no = motion_raw.startswith("n")
    # `moving` is strict: must match MOTION. If MOTION wasn't returned (older
    # model, mis-formatted reply), fall back to MOVING but never upgrade
    # MOTION=no into MOVING=yes.
    if motion_detected:
        moving = True
    elif motion_no:
        moving = False
    else:
        moving = moving_raw.startswith("y")

    form = (
        "good" if form_raw.startswith("g")
        else "adjust" if form_raw.startswith("a")
        else "unclear"
    )
    setup = fields.get("SETUP") or "warm-up move"
    coach_line = fields.get("COACH") or raw.strip() or "Keep going — I'm watching."

    return {
        "motion_detected": motion_detected,
        "motion_unclear": not motion_detected and not motion_no,
        "moving": moving,
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
    motion_detected: bool,
    frames_analyzed: int,
    setup: str,
) -> None:
    ref = session_ref(session_id)
    if ref is None:
        return
    try:
        snap = ref.get()
        prev_count = (
            int((snap.to_dict() or {}).get("warmup_moves_checked") or 0)
            if snap.exists else 0
        )
        payload: dict[str, Any] = {
            "last_warmup_exercise": exercise,
            "last_warmup_form": form,
            "last_warmup_moving": moving,
            "last_warmup_motion_detected": motion_detected,
            "last_warmup_frames_analyzed": frames_analyzed,
            "last_warmup_setup": setup,
            "warmup_moves_checked": prev_count + 1,
            "warmup_peek_updated_at": _now_iso(),
        }
        if not motion_detected:
            payload["warmup_motion_miss_count"] = firestore.Increment(1)
        ref.set(payload, merge=True)
    except Exception:
        _logger.exception("peek_warmup status write failed")


def _warmup_unavailable(session_id: str | None, observation: str) -> dict[str, Any]:
    return {
        "observation": observation,
        "available": False,
        "moving": False,
        "motion_detected": False,
        "frames_analyzed": 0,
        "form": "unclear",
    }


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def _parse_ts(ts: Any) -> float | None:
    if not isinstance(ts, str):
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _pick_frame_urls(session_id: str) -> list[str]:
    """Pick up to _TARGET_FRAME_COUNT frame URLs spaced ≥_MIN_FRAME_GAP_SECONDS apart.

    Strategy: sort history newest -> oldest, walk and keep frames that are at
    least the minimum gap from the previously kept one. Fall back to the live
    peek_url if history is empty.
    """
    ref = session_ref(session_id)
    if ref is None:
        return []
    snap = ref.get()
    if not snap.exists:
        return []
    data = snap.to_dict() or {}
    history = data.get("peek_url_history") or []

    entries: list[tuple[float, str]] = []
    for entry in history:
        if not isinstance(entry, dict):
            continue
        url = entry.get("url")
        ts = _parse_ts(entry.get("ts"))
        if isinstance(url, str) and ts is not None:
            entries.append((ts, url))
    entries.sort(key=lambda x: x[0], reverse=True)  # newest first

    picked: list[tuple[float, str]] = []
    for ts, url in entries:
        if not picked or (picked[-1][0] - ts) >= _MIN_FRAME_GAP_SECONDS:
            picked.append((ts, url))
        if len(picked) >= _TARGET_FRAME_COUNT:
            break

    if picked:
        # Send oldest -> newest so the model reads frames in chronological order.
        picked.sort(key=lambda x: x[0])
        return [url for _, url in picked]

    fallback = data.get("peek_url")
    return [fallback] if isinstance(fallback, str) and fallback else []


def _fetch_jpegs(urls: list[str]) -> list[bytes]:
    out: list[bytes] = []
    with httpx.Client(timeout=8.0) as client:
        for url in urls:
            try:
                resp = client.get(url)
                resp.raise_for_status()
                out.append(resp.content)
            except Exception as exc:
                _logger.warning("peek_warmup frame fetch failed: %s", exc)
    return out


def peek_warmup(exercise: str, tool_context: ToolContext) -> dict[str, Any]:
    """Watch the player's warm-up move across multiple frames and report whether
    they actually performed it.

    Call this AFTER each warm-up timer ends (the client nudges you). The tool
    analyzes up to 3 frames spaced across the timer window so it can detect
    real motion, not just guess from a static pose.

    Args:
        exercise: Plain description of what they should be doing, e.g.
            "slow arm circles with arms out wide" or
            "march in place lifting knees high".

    Returns:
        Dict with:
          - moving (bool): STRICT — true only if motion was detected across frames.
          - motion_detected (bool): same as moving (kept for clarity).
          - motion_unclear (bool): true when frames were inconclusive.
          - form ("good" | "adjust" | "unclear")
          - frames_analyzed (int): how many frames the model actually saw.
          - observation (str): one-sentence line for the coach to say aloud.
    """
    session_id = _get_session_id(tool_context)
    exercise_label = (exercise or "warm-up move").strip()
    if not session_id:
        return _warmup_unavailable(None, "Camera unavailable: no active session.")

    frame_urls = _pick_frame_urls(session_id)
    if not frame_urls:
        return _warmup_unavailable(session_id, "Camera unavailable: no recent frames yet.")

    image_bytes_list = _fetch_jpegs(frame_urls)
    if not image_bytes_list:
        return _warmup_unavailable(session_id, "Camera glitched — couldn't grab frames.")

    try:
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _warmup_unavailable(session_id, "Camera unavailable: vision API not configured.")
        genai = Client(api_key=api_key)
        model = os.getenv("PEEK_MODEL", os.getenv("GEMINI_MODEL", "gemini-flash-latest"))

        prompt_text = (
            _WARMUP_PROMPT_PREAMBLE.format(n=len(image_bytes_list))
            + f"\nWarm-up move to verify: {exercise_label}"
        )

        contents: list[Any] = []
        for img in image_bytes_list:
            contents.append(genai_types.Part.from_bytes(data=img, mime_type="image/jpeg"))
        contents.append(genai_types.Part.from_text(text=prompt_text))

        response = genai.models.generate_content(
            model=model,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                temperature=0.1,
                # 5-line structured reply ≈ 60-80 tokens; 128 gives headroom
                # without paying for unused output budget.
                max_output_tokens=128,
            ),
        )
        text = (response.text or "").strip()
        if not text and response.candidates:
            parts = response.candidates[0].content.parts if response.candidates[0].content else []
            text = " ".join((p.text or "").strip() for p in parts).strip()

        parsed = _parse_warmup_response(text)
        frames_analyzed = len(image_bytes_list)
        _persist_warmup_status(
            session_id,
            exercise=exercise_label,
            form=str(parsed.get("form") or "unclear"),
            moving=bool(parsed.get("moving")),
            motion_detected=bool(parsed.get("motion_detected")),
            frames_analyzed=frames_analyzed,
            setup=str(parsed.get("setup") or ""),
        )
        _logger.info(
            "peek_warmup session=%s exercise=%r frames=%d motion=%s moving=%s form=%s observation=%r",
            session_id,
            exercise_label,
            frames_analyzed,
            parsed.get("motion_detected"),
            parsed.get("moving"),
            parsed.get("form"),
            parsed.get("observation"),
        )
        return {
            **parsed,
            "exercise": exercise_label,
            "frames_analyzed": frames_analyzed,
            "source": "gemini-flash",
            "raw": text,
        }
    except Exception as exc:
        _logger.exception("peek_warmup Gemini call failed")
        return _warmup_unavailable(session_id, f"Vision error: {type(exc).__name__}")
