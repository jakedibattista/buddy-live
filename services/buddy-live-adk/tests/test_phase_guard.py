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


def test_set_focus_drill_allowed_in_iq_mode_for_switch_to_shooting(tool_context, monkeypatch):
    # Player started in Hockey IQ (no space), then found a stick and space.
    # set_focus_drill must be allowed so the root coach can switch them to
    # shooting (session live-os7zhrniobny). focus_drill is unset in IQ-first
    # sessions, so the call proceeds and the tool flips phase to warmup.
    _patch_doc(monkeypatch, {"currentPhase": "iq_practice"})
    assert phase_guard(_tool("set_focus_drill"), {"drill_id": "wristshot"}, tool_context) is None


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


# ---------------------------------------------------------------------------
# start_rep_capture — single-rep policy with one unscoreable retake
# ---------------------------------------------------------------------------

_READY_DOC = {"focus_drill": "slapshot", "setup_framing_passed": True}


def _patch_rep_stats(monkeypatch, count: int, any_scoreable: bool):
    monkeypatch.setattr(
        "app.callbacks._completed_rep_stats", lambda _sid: (count, any_scoreable)
    )


def test_rep_capture_allowed_with_no_completed_reps(tool_context, monkeypatch):
    _patch_doc(monkeypatch, _READY_DOC)
    _patch_rep_stats(monkeypatch, 0, False)
    assert phase_guard(_tool("start_rep_capture"), {}, tool_context) is None


def test_rep_capture_blocked_after_scoreable_rep(tool_context, monkeypatch):
    _patch_doc(monkeypatch, _READY_DOC)
    _patch_rep_stats(monkeypatch, 1, True)
    result = phase_guard(_tool("start_rep_capture"), {}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_rep_already_scored"


def test_rep_capture_retake_allowed_after_unscoreable_rep(tool_context, monkeypatch):
    # Session live-inibrtfoscyy: rep completed but analyzer produced no
    # metrics; the player asked to re-record and was wrongly refused.
    _patch_doc(monkeypatch, _READY_DOC)
    _patch_rep_stats(monkeypatch, 1, False)
    assert phase_guard(_tool("start_rep_capture"), {}, tool_context) is None


def test_rep_capture_blocked_after_second_unscoreable_rep(tool_context, monkeypatch):
    _patch_doc(monkeypatch, _READY_DOC)
    _patch_rep_stats(monkeypatch, 2, False)
    result = phase_guard(_tool("start_rep_capture"), {}, tool_context)
    assert result is not None
    assert result["status"] == "blocked_retake_used"


def test_rep_is_scoreable_detection():
    from app.callbacks import _rep_is_scoreable

    assert _rep_is_scoreable(
        {"results": {"structured_shots": [{"metrics": {"windUp": 4.5}}]}}
    )
    assert _rep_is_scoreable({"results": {"scores": {"stance": 7}}})
    assert not _rep_is_scoreable(
        {"results": {"structured_shots": [{"metrics": {"windUp": None}}]}}
    )
    assert not _rep_is_scoreable({"results": {}})
    assert not _rep_is_scoreable({})


def test_end_session_recap_allowed_with_no_completed_reps(tool_context, monkeypatch):
    _patch_doc(monkeypatch, {"currentPhase": "warmup", "focus_drill": "wristshot"})
    monkeypatch.setattr("app.callbacks._has_completed_rep", lambda _sid: False)
    assert phase_guard(_tool("end_session_recap"), {}, tool_context) is None


