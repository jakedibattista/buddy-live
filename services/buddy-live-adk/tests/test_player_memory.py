"""Phase 4 player memory tests (hermetic, no Firestore)."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.tools.player_memory import (
    _normalize_name,
    load_player_memory,
    remember_player_profile,
)


@pytest.fixture
def tool_context():
    ctx = MagicMock()
    ctx.state = {
        "session_id": "live-session-abc",
        "user_id": "firebase-uid-123",
    }
    return ctx


def test_normalize_name():
    assert _normalize_name("  Marcus  ") == "marcus"


def test_remember_player_profile_requires_name(tool_context):
    result = remember_player_profile("", 11, tool_context)
    assert result["status"] == "error"


def test_remember_player_profile_saves_to_state(tool_context, monkeypatch):
    monkeypatch.setattr("app.tools.player_memory.session_ref", lambda _: None)
    result = remember_player_profile("Marcus", 11, tool_context)
    assert result["status"] == "saved"
    assert tool_context.state["player_name"] == "Marcus"
    assert tool_context.state["player_age"] == 11


def test_load_player_memory_empty_name(tool_context):
    result = load_player_memory("", tool_context)
    assert result["available"] is False


def test_load_player_memory_no_firestore(tool_context, monkeypatch):
    monkeypatch.setattr("app.tools.player_memory.db", lambda: None)
    result = load_player_memory("Marcus", tool_context)
    assert result["available"] is False
    assert "unavailable" in result["reason"]


def test_load_player_memory_finds_prior(tool_context, monkeypatch):
    class FakeSnap:
        def __init__(self, sid: str, data: dict):
            self.id = sid
            self._data = data

        def to_dict(self):
            return self._data

    class FakeCollection:
        def limit(self, n):
            return self

        def stream(self):
            return [
                FakeSnap(
                    "prior-session-001",
                    {
                        "session_id": "prior-session-001",
                        "created_at": "2026-05-27T20:00:00+00:00",
                        "player_name": "Marcus",
                        "player_name_normalized": "marcus",
                        "user_id": "firebase-uid-123",
                        "drill": "wristshot",
                        "rep_count": 2,
                        "weakest_metric": "weight_transfer",
                    },
                ),
                FakeSnap(
                    "live-session-abc",
                    {
                        "session_id": "live-session-abc",
                        "created_at": "2026-05-28T20:00:00+00:00",
                        "player_name": "Marcus",
                        "player_name_normalized": "marcus",
                        "user_id": "firebase-uid-123",
                    },
                ),
            ]

    class FakeClient:
        def collection(self, name):
            assert name == "session_summaries"
            return FakeCollection()

    monkeypatch.setattr("app.tools.player_memory.db", lambda: FakeClient())
    result = load_player_memory("Marcus", tool_context)
    assert result["available"] is True
    assert result["has_prior_session"] is True
    assert result["drill"] == "wristshot"
    assert "weight transfer" in result["summary_hint"]


def test_load_player_memory_same_name_different_user_no_collision(
    tool_context, monkeypatch
):
    """Two Alex kids on different browsers must not share welcome-back memory."""

    class FakeSnap:
        def __init__(self, sid: str, data: dict):
            self.id = sid
            self._data = data

        def to_dict(self):
            return self._data

    class FakeCollection:
        def limit(self, n):
            return self

        def stream(self):
            return [
                FakeSnap(
                    "other-alex-session",
                    {
                        "session_id": "other-alex-session",
                        "created_at": "2026-05-27T20:00:00+00:00",
                        "player_name": "Alex",
                        "player_name_normalized": "alex",
                        "user_id": "different-firebase-uid",
                        "drill": "wristshot",
                        "rep_count": 1,
                        "weakest_metric": "weight_transfer",
                    },
                ),
            ]

    class FakeClient:
        def collection(self, name):
            return FakeCollection()

    monkeypatch.setattr("app.tools.player_memory.db", lambda: FakeClient())
    result = load_player_memory("Alex", tool_context)
    assert result["has_prior_session"] is False
    assert result["sessions_found"] == 0


def test_load_player_memory_no_user_id(tool_context, monkeypatch):
    tool_context.state = {"session_id": "live-session-abc", "user_id": "player"}
    monkeypatch.setattr("app.tools.player_memory.session_ref", lambda _: None)
    monkeypatch.setattr("app.tools.player_memory.db", lambda: MagicMock())
    result = load_player_memory("Marcus", tool_context)
    assert result["has_prior_session"] is False
    assert "user_id" in result.get("reason", "")
