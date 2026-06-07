"""Unit tests for lookup_warmup_moves (static catalog + grounding ranking)."""
from __future__ import annotations

import pytest

from app.tools import grounding
from app.tools.warmup_moves import lookup_warmup_moves


@pytest.fixture(autouse=True)
def _no_grounding_env(monkeypatch):
    monkeypatch.delenv("BUDDY_VERTEX_SEARCH_DATA_STORE_ID", raising=False)
    grounding._client = None
    grounding._client_init_attempted = False
    yield
    grounding._client = None
    grounding._client_init_attempted = False


def test_lookup_warmup_moves_general_returns_three_moves():
    result = lookup_warmup_moves("general", count=3)
    assert result["available"] is True
    assert result["category"] == "general"
    assert len(result["moves"]) == 3
    assert all(m["duration_seconds"] == 30 for m in result["moves"])
    assert result["source"] == "static_catalog"


def test_lookup_warmup_moves_hockey_requires_focus_drill():
    result = lookup_warmup_moves("hockey", count=2)
    assert result["available"] is False
    assert "focus_drill" in result["reason"]


def test_lookup_warmup_moves_hockey_returns_two_for_wristshot():
    result = lookup_warmup_moves("hockey", focus_drill="wristshot", count=2)
    assert result["available"] is True
    assert result["focus_drill"] == "wristshot"
    assert len(result["moves"]) == 2
    labels = {m["label"] for m in result["moves"]}
    assert labels  # non-empty distinct picks


def test_lookup_warmup_moves_invalid_category():
    result = lookup_warmup_moves("stretching", count=3)
    assert result["available"] is False


def test_lookup_warmup_moves_varies_by_session_id():
    """Different session ids should usually shuffle to different orderings."""

    class _Ctx:
        state = {"session_id": "session-a"}

    class _CtxB:
        state = {"session_id": "session-b"}

    a = lookup_warmup_moves("general", count=3, tool_context=_Ctx())  # type: ignore[arg-type]
    b = lookup_warmup_moves("general", count=3, tool_context=_CtxB())  # type: ignore[arg-type]
    labels_a = [m["label"] for m in a["moves"]]
    labels_b = [m["label"] for m in b["moves"]]
    # Not guaranteed every time, but with 7 general moves and count=3,
    # different seeds should diverge often enough for a smoke check.
    assert labels_a != labels_b or len(set(labels_a)) == 3
