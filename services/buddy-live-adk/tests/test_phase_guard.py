"""Unit tests for app.callbacks.phase_guard (Firestore-backed phase gates)."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.callbacks import phase_guard


@pytest.fixture
def tool_context():
    ctx = MagicMock()
    ctx.state = {"session_id": "live-session-abc"}
    return ctx


def _tool(name: str) -> MagicMock:
    t = MagicMock()
    t.name = name
    return t


def _patch_doc(monkeypatch, doc: dict):
    monkeypatch.setattr("app.callbacks._read_session_doc", lambda _sid: doc)


def test_unguarded_tool_passes_through(tool_context):
    assert phase_guard(_tool("start_warmup_timer"), {}, tool_context) is None


def test_set_focus_drill_blocked_when_already_set(tool_context, monkeypatch):
    _patch_doc(monkeypatch, {"focus_drill": "wristshot", "currentPhase": "warmup"})
    result = phase_guard(_tool("set_focus_drill"), {"drill_id": "backhand"}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_drill_already_set"


def test_set_focus_drill_blocked_in_iq_mode(tool_context, monkeypatch):
    _patch_doc(monkeypatch, {"currentPhase": "iq_practice"})
    result = phase_guard(_tool("set_focus_drill"), {"drill_id": "wristshot"}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_iq_mode"


def test_set_focus_drill_allowed_when_unset(tool_context, monkeypatch):
    _patch_doc(monkeypatch, {"currentPhase": "opening"})
    assert phase_guard(_tool("set_focus_drill"), {"drill_id": "wristshot"}, tool_context) is None


def test_analyze_rep_blocked_without_framing(tool_context, monkeypatch):
    _patch_doc(
        monkeypatch,
        {"focus_drill": "wristshot", "setup_framing_passed": False},
    )
    result = phase_guard(_tool("analyze_rep"), {"rep_id": "r1"}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_framing_not_passed"


def test_analyze_rep_allowed_when_ready(tool_context, monkeypatch):
    _patch_doc(
        monkeypatch,
        {"focus_drill": "wristshot", "setup_framing_passed": True},
    )
    assert phase_guard(_tool("analyze_rep"), {"rep_id": "r1"}, tool_context) is None


def test_show_iq_visual_blocked_during_shooting_flow(tool_context, monkeypatch):
    _patch_doc(
        monkeypatch,
        {"focus_drill": "wristshot", "currentPhase": "warmup"},
    )
    result = phase_guard(_tool("show_iq_visual"), {}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_not_iq_mode"


def test_show_iq_visual_allowed_without_focus_drill(tool_context, monkeypatch):
    _patch_doc(
        monkeypatch,
        {"currentPhase": "opening", "iq_question_goal": 5},
    )
    assert phase_guard(_tool("show_iq_visual"), {}, tool_context) is None


def test_show_iq_visual_allowed_in_iq_phase(tool_context, monkeypatch):
    _patch_doc(
        monkeypatch,
        {
            "focus_drill": "wristshot",
            "currentPhase": "iq_practice",
            "iq_question_goal": 8,
        },
    )
    assert phase_guard(_tool("show_iq_visual"), {}, tool_context) is None


def test_show_iq_visual_blocked_without_question_goal(tool_context, monkeypatch):
    _patch_doc(
        monkeypatch,
        {"currentPhase": "iq_practice"},
    )
    result = phase_guard(_tool("show_iq_visual"), {}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_no_iq_goal"


def test_show_iq_visual_blocked_after_session_ended(tool_context, monkeypatch):
    _patch_doc(monkeypatch, {"currentPhase": "ended", "ended_at": "2026-01-01T00:00:00Z"})
    result = phase_guard(_tool("show_iq_visual"), {}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_session_over"


def test_peek_camera_blocked_after_recap(tool_context, monkeypatch):
    _patch_doc(monkeypatch, {"currentPhase": "recap"})
    result = phase_guard(_tool("peek_camera"), {}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_session_over"
