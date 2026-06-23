"""Unit tests for Firestore-backed voice reconnect notes."""
from __future__ import annotations

from unittest.mock import MagicMock

from app.reconnect_context import (
    build_voice_reconnect_message,
    enrich_voice_reconnect_message,
    is_voice_reconnect_message,
)


def test_is_voice_reconnect_message():
    assert is_voice_reconnect_message("(Voice reconnected — continue")
    assert not is_voice_reconnect_message("Hello Coach")


def test_enrich_leaves_normal_text_unchanged():
    assert enrich_voice_reconnect_message("live-x", "I'm ready") == "I'm ready"


def test_build_message_from_session_doc(monkeypatch):
    doc = {
        "player_name": "Rushi",
        "focus_drill": "wristshot",
        "currentPhase": "warmup",
        "setup_framing_passed": True,
        "warmup_timer_started_at": "2026-06-19T03:42:10.000Z",
        "last_warmup_timer_seconds": 30,
        "last_warmup_timer_label": "Arm circles",
    }

    class FakeSnap:
        exists = True

        def to_dict(self):
            return doc

    fake_ref = MagicMock()
    fake_ref.get.return_value = FakeSnap()
    fake_ref.collection.return_value.stream.return_value = []

    monkeypatch.setattr("app.reconnect_context.session_ref", lambda _sid: fake_ref)
    monkeypatch.setattr(
        "app.reconnect_context._warmup_timer_active",
        lambda d, now=None: (True, "Arm circles"),
    )

    msg = build_voice_reconnect_message("live-h27pjmlwskuq")
    assert msg is not None
    assert "Player name: Rushi" in msg
    assert "Focus drill: wristshot" in msg
    assert "Phase: warmup" in msg
    assert "Setup framing passed: yes" in msg
    assert "warm-up timer (Arm circles) is still running" in msg


def test_enrich_replaces_stale_client_note(monkeypatch):
    stale = (
        "(Voice reconnected — continue this existing session. "
        "Focus drill: not set yet. Phase: unknown. Reps completed: 0. "
        "Setup framing passed: no. Acknowledge the reconnect in one short sentence, "
        "then continue exactly where we left off.)"
    )
    fresh = "(Voice reconnected — Focus drill: wristshot. Phase: warmup.)"
    monkeypatch.setattr(
        "app.reconnect_context.build_voice_reconnect_message",
        lambda _sid: fresh,
    )
    assert enrich_voice_reconnect_message("live-x", stale) == fresh
