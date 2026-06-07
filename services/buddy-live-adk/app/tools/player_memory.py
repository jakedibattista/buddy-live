"""Cross-session player memory for Coach Buddy.

Phase 4 (Track 2): surfaces prior session summaries from Firestore
``session_summaries/`` so returning players get a personalized opening.
This works without Vertex AI Memory Bank provisioning; optional ADK
``VertexAiMemoryBankService`` is documented in ``docs/TRACK2-PLAN.md`` as
the production upgrade path.

See ``remember_player_profile`` (persist name/age for this session) and
``load_player_memory`` (fetch the most recent prior session for a player).
"""
from __future__ import annotations

import logging
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import db, session_ref
from app.tools._common import SESSION_SUMMARIES_COLLECTION

_logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    return (name or "").strip().lower()


_PLACEHOLDER_USER_IDS = frozenset({"", "player", "anonymous"})


def _is_valid_user_id(user_id: str | None) -> bool:
    """True when ``user_id`` is a real Firebase anonymous uid (not a placeholder)."""
    uid = (user_id or "").strip()
    return bool(uid) and uid.lower() not in _PLACEHOLDER_USER_IDS


def _resolve_user_id(state: dict[str, Any]) -> str | None:
    """Firebase ``user_id`` for this session — Firestore doc is source of truth."""
    session_id = state.get("session_id") or state.get("sessionId")
    if session_id:
        ref = session_ref(str(session_id))
        if ref is not None:
            try:
                snap = ref.get()
                if snap.exists:
                    doc_uid = (snap.to_dict() or {}).get("user_id")
                    if _is_valid_user_id(str(doc_uid) if doc_uid else None):
                        return str(doc_uid).strip()
            except Exception:
                _logger.exception(
                    "load_player_memory firestore user_id read failed session=%s",
                    session_id,
                )

    state_uid = state.get("user_id")
    if _is_valid_user_id(str(state_uid) if state_uid else None):
        return str(state_uid).strip()
    return None


def remember_player_profile(
    player_name: str,
    age: int,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Save the player's name and age for this session and future lookups.

    Call once in the opening flow, right after the player shares their name
    and age. Writes to the live session doc and ADK session state so
    ``end_session_recap`` can include them in ``session_summaries``.

    Args:
        player_name: First name the player gave (e.g. "Marcus").
        age: Player age in years (e.g. 11).

    Returns:
        Dict with ``status`` and echoed ``player_name`` / ``age``.
    """
    name = (player_name or "").strip()
    if not name:
        return {"status": "error", "reason": "player_name is required"}

    state = tool_context.state or {}
    session_id = state.get("session_id") or state.get("sessionId")
    if session_id:
        ref = session_ref(session_id)
        if ref is not None:
            try:
                ref.set(
                    {
                        "player_name": name,
                        "player_age": int(age),
                        "player_name_normalized": _normalize_name(name),
                    },
                    merge=True,
                )
            except Exception:
                _logger.exception("remember_player_profile firestore write failed")

    state["player_name"] = name
    state["player_age"] = int(age)
    state["player_name_normalized"] = _normalize_name(name)

    _logger.info("remember_player_profile name=%s age=%s session=%s", name, age, session_id)
    return {
        "status": "saved",
        "player_name": name,
        "age": int(age),
    }


def load_player_memory(
    player_name: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Load the player's most recent prior session summary for a returning-player greeting.

    Queries ``session_summaries`` for rows matching this player's **Firebase
    ``user_id``** (same browser / anonymous auth) and spoken name, excluding the
    current session. Two different kids named "Alex" on different devices never
    collide. Use in the opening after you learn their name — if
    ``has_prior_session`` is true, greet them warmly and reference
    ``weakest_metric`` / ``drill`` / ``rep_count`` in one short sentence before
    continuing the normal flow.

    Args:
        player_name: First name to look up (same spelling the player just gave).

    Returns:
        Dict with ``available``, ``has_prior_session``, and when found:
        ``drill``, ``rep_count``, ``weakest_metric``, ``summary_hint`` (spoken
        one-liner), ``session_date`` (ISO), ``sessions_found``.
    """
    name = (player_name or "").strip()
    if not name:
        return {
            "available": False,
            "has_prior_session": False,
            "reason": "player_name is required",
        }

    client = db()
    if client is None:
        return {
            "available": False,
            "has_prior_session": False,
            "reason": "memory store unavailable",
        }

    state = tool_context.state or {}
    current_session_id = state.get("session_id") or state.get("sessionId")
    normalized = _normalize_name(name)
    current_user_id = _resolve_user_id(state)

    if not _is_valid_user_id(current_user_id):
        return {
            "available": True,
            "has_prior_session": False,
            "player_name": name,
            "sessions_found": 0,
            "reason": "no stable user_id for this session",
        }

    try:
        # Scan recent summaries and sort in-process (avoids composite indexes).
        raw_snaps = list(
            client.collection(SESSION_SUMMARIES_COLLECTION).limit(100).stream()
        )
        raw_snaps.sort(
            key=lambda s: (s.to_dict() or {}).get("created_at") or "",
            reverse=True,
        )
    except Exception as exc:
        _logger.warning("load_player_memory query failed: %s", exc)
        return {
            "available": False,
            "has_prior_session": False,
            "reason": f"query error: {type(exc).__name__}",
        }

    matches: list[dict[str, Any]] = []
    for snap in raw_snaps:
        if snap.id == current_session_id:
            continue
        doc = snap.to_dict() or {}
        doc_name = _normalize_name(str(doc.get("player_name") or ""))
        if doc_name != normalized:
            continue
        prior_uid = str(doc.get("user_id") or "").strip()
        if prior_uid != current_user_id:
            continue
        matches.append({"id": snap.id, **doc})

    if not matches:
        return {
            "available": True,
            "has_prior_session": False,
            "player_name": name,
            "sessions_found": 0,
        }

    prior = matches[0]
    drill = prior.get("drill")
    rep_count = int(prior.get("rep_count") or 0)
    weakest = prior.get("weakest_metric")
    weakest_label = (
        str(weakest).replace("_", " ").lower() if weakest else None
    )

    if weakest_label and drill:
        summary_hint = (
            f"Last time you worked on {drill} — {rep_count} rep"
            f"{'s' if rep_count != 1 else ''}. "
            f"Biggest unlock was your {weakest_label}."
        )
    elif drill:
        summary_hint = (
            f"Last time you worked on {drill} — nice to see you back, {name}."
        )
    else:
        summary_hint = f"Good to see you again, {name}."

    return {
        "available": True,
        "has_prior_session": True,
        "player_name": name,
        "sessions_found": len(matches),
        "drill": drill,
        "rep_count": rep_count,
        "weakest_metric": weakest,
        "weakest_metric_label": weakest_label,
        "summary_hint": summary_hint,
        "session_date": prior.get("created_at"),
        "prior_session_id": prior.get("session_id") or matches[0].get("id"),
    }


__all__ = ["remember_player_profile", "load_player_memory"]
