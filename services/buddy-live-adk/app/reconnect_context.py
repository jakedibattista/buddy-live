"""Build authoritative voice-reconnect context from Firestore.

The browser's Firestore listener can lag behind Admin SDK writes (session
live-h27pjmlwskuq: judge reconnect notes said drill unset for 40s after
set_focus_drill). When we see a reconnect note, rebuild it from the session
doc so the agent resumes with server truth.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)

_VOICE_RECONNECT_PREFIX = "(voice reconnected"
_LEAD_IN_SECONDS = 3


def is_voice_reconnect_message(text: str) -> bool:
    return (text or "").lstrip().lower().startswith(_VOICE_RECONNECT_PREFIX)


def _warmup_timer_active(doc: dict[str, Any], now: datetime | None = None) -> tuple[bool, str | None]:
    started_raw = doc.get("warmup_timer_started_at")
    duration = doc.get("last_warmup_timer_seconds")
    label = doc.get("last_warmup_timer_label")
    if not started_raw or not isinstance(duration, (int, float)):
        return False, None
    try:
        started = datetime.fromisoformat(str(started_raw).replace("Z", "+00:00"))
    except ValueError:
        return False, None
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    total_seconds = float(duration) + _LEAD_IN_SECONDS
    if (now - started).total_seconds() < total_seconds:
        return True, str(label) if label else None
    return False, None


def _rep_stats(session_id: str, doc: dict[str, Any]) -> tuple[int, str | None, bool]:
    ref = session_ref(session_id)
    if ref is None:
        return 0, None, False
    try:
        snaps = list(ref.collection("reps").stream())
    except Exception:
        _logger.exception("reconnect_context rep list failed session=%s", session_id)
        return 0, None, False
    reps = [snap.to_dict() or {} for snap in snaps]
    reps.sort(key=lambda r: str(r.get("created_at") or ""))
    rep_count = len(reps)
    last_rep_id = None
    if reps:
        last = reps[-1]
        last_rep_id = str(last.get("rep_id") or "")
    results_ready = bool(doc.get("results_ready_at"))
    phase = doc.get("currentPhase")
    awaiting = results_ready and phase not in ("recap", "ended")
    return rep_count, last_rep_id or None, awaiting


def build_voice_reconnect_message(session_id: str) -> str | None:
    """Return a reconnect note from Firestore, or None if session unreadable."""
    ref = session_ref(session_id)
    if ref is None:
        return None
    try:
        snap = ref.get()
        doc = snap.to_dict() or {} if snap.exists else {}
    except Exception:
        _logger.exception("reconnect_context session read failed session=%s", session_id)
        return None

    player_name = doc.get("player_name")
    focus_drill = doc.get("focus_drill")
    current_phase = doc.get("currentPhase")
    setup_framing_passed = doc.get("setup_framing_passed") is True
    rep_count, last_rep_id, awaiting_review = _rep_stats(session_id, doc)
    warmup_active, warmup_label = _warmup_timer_active(doc)

    name = f"Player name: {player_name}. " if player_name else ""
    drill = focus_drill if focus_drill else "not set yet"
    phase = current_phase if current_phase else "unknown"

    review = ""
    if awaiting_review and last_rep_id:
        review = (
            f"A scored rep (id {last_rep_id}) is awaiting review — its results are ready. "
            "Call get_rep_result on it, announce the scorecard is ready and ask if they want to "
            "walk through it, then review it step by step. Do NOT record a new rep. "
        )
    elif last_rep_id:
        review = f"Last rep id: {last_rep_id}. Do NOT start a new recording. "

    warmup = ""
    if warmup_active:
        label_part = f" ({warmup_label})" if warmup_label else ""
        warmup = (
            f"A warm-up timer{label_part} is still running on screen — do NOT introduce the "
            "next move; wait for the timer-finished note. "
        )

    return (
        "(Voice reconnected — continue this existing session. Do NOT restart from name, age, "
        "or drill selection, and do NOT re-greet. "
        f"{name}"
        f"Focus drill: {drill}. Phase: {phase}. Reps completed: {rep_count}. "
        f"Setup framing passed: {'yes' if setup_framing_passed else 'no'}. "
        f"{warmup}"
        f"{review}"
        "Acknowledge the reconnect in one short sentence, then continue exactly where we left off.)"
    )


def enrich_voice_reconnect_message(session_id: str, user_text: str) -> str:
    """Replace client-built reconnect notes with Firestore-backed state."""
    if not is_voice_reconnect_message(user_text):
        return user_text
    rebuilt = build_voice_reconnect_message(session_id)
    if not rebuilt:
        return user_text
    if rebuilt != user_text:
        _logger.info(
            "reconnect_context replaced stale client note session=%s",
            session_id,
        )
    return rebuilt
