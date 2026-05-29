"""Rep capture watchdog tests (hermetic, no Firestore/HTTP)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.tools import rep_capture
from app.tools.rep_capture import _seconds_since, get_rep_result


@pytest.fixture
def tool_context():
    ctx = MagicMock()
    ctx.state = {"session_id": "live-session-abc"}
    return ctx


def _iso(delta_secs: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=delta_secs)).isoformat()


def test_seconds_since_handles_bad_input():
    assert _seconds_since(None) == 0.0
    assert _seconds_since("not-a-date") == 0.0


def test_seconds_since_naive_timestamp():
    # ~10s ago, no tzinfo -> treated as UTC, should be ~10.
    assert _seconds_since(_iso(-10).replace("+00:00", "")) > 5


class _FakeRef:
    def __init__(self, data: dict):
        self._data = data
        self.updated: dict = {}

    def get(self):
        snap = MagicMock()
        snap.exists = True
        snap.to_dict = lambda: self._data
        return snap

    def update(self, patch: dict):
        self.updated.update(patch)
        self._data.update(patch)


def _patch_ref(monkeypatch, ref):
    monkeypatch.setattr("app.tools.rep_capture.rep_ref", lambda *_: ref)


def test_client_reported_clip_failed_short_circuits(tool_context, monkeypatch):
    ref = _FakeRef({"status": "clip_failed", "clip_error": "Clip too short — try again"})
    _patch_ref(monkeypatch, ref)
    result = get_rep_result("rep1", tool_context)
    assert result["status"] == "clip_failed"
    assert "reshoot" in result["hint"].lower()


def test_watchdog_flips_stuck_awaiting_clip(tool_context, monkeypatch):
    ref = _FakeRef(
        {"status": "awaiting_clip", "capture_stopped_at": _iso(-(rep_capture._CLIP_WATCHDOG_SECS + 5))}
    )
    _patch_ref(monkeypatch, ref)
    result = get_rep_result("rep1", tool_context)
    assert result["status"] == "clip_failed"
    assert ref.updated.get("status") == "clip_failed"
    assert "clip_failed_at" in ref.updated


def test_watchdog_waits_within_window(tool_context, monkeypatch):
    ref = _FakeRef({"status": "awaiting_clip", "capture_stopped_at": _iso(-1)})
    _patch_ref(monkeypatch, ref)
    result = get_rep_result("rep1", tool_context)
    assert result["status"] == "awaiting_clip"
    assert ref.updated == {}
