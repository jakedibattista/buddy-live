"""Phase 3 grounding tests.

Pure-function coverage for the Vertex AI Search wiring and the
`recommend_drill` fallback chain. These tests run hermetically: the
grounding env var is left unset so the lazy client never initialises,
which means no GCP credentials, network, or Discovery Engine call is
required to verify the public contracts.
"""
from __future__ import annotations

import importlib

import pytest


@pytest.fixture(autouse=True)
def _no_grounding_env(monkeypatch):
    """Hard-disable Vertex AI Search for every test in this module.

    The grounding client is a module-level singleton (lazy-initialised).
    We clear the data store env var and reset the singleton's "init
    attempted" flag so each test sees a fresh disabled state.
    """
    monkeypatch.delenv("BUDDY_VERTEX_SEARCH_DATA_STORE_ID", raising=False)
    monkeypatch.delenv("BUDDY_VERTEX_SEARCH_SERVING_CONFIG", raising=False)
    from app.tools import grounding

    grounding._client = None
    grounding._client_init_attempted = False
    yield
    grounding._client = None
    grounding._client_init_attempted = False


def test_lookup_drill_knowledge_noop_when_env_unset():
    """Most important production guarantee: never crash when the data
    store env var is missing -- just return ``available: False`` so the
    coach can fall back to baked-in prompt knowledge."""
    from app.tools.grounding import lookup_drill_knowledge

    result = lookup_drill_knowledge("front knee bend wristshot fix")
    assert result["available"] is False
    assert result["query"] == "front knee bend wristshot fix"
    assert result["results"] == []
    assert "reason" in result


def test_lookup_drill_knowledge_empty_query_short_circuits():
    """Empty queries should never hit the client at all."""
    from app.tools.grounding import lookup_drill_knowledge

    result = lookup_drill_knowledge("")
    assert result["available"] is False
    assert result["reason"] == "empty query"


def test_recommend_drill_known_metric_uses_dict_fallback():
    """With grounding disabled the static dict is the next layer down.
    A known metric should return its hand-curated entry."""
    from app.tools.coaching import recommend_drill

    result = recommend_drill("weight transfer")
    assert result["source"] == "static_dict"
    assert "weight transfer" in result["cue"].lower() or "back foot" in result["cue"].lower()
    assert result["url"].startswith("https://www.youtube.com/")


def test_recommend_drill_unknown_metric_uses_generic_fallback():
    """A made-up metric should fall all the way through to the generic
    'consistency wins' homework so the coach is never empty-handed."""
    from app.tools.coaching import recommend_drill

    result = recommend_drill("reverse triple axel windshot")
    assert result["source"] == "fallback"
    assert "wristshots" in result["title"].lower()


def test_recommend_drill_empty_metric_uses_generic_fallback():
    from app.tools.coaching import recommend_drill

    result = recommend_drill("")
    assert result["source"] == "fallback"


def test_recommend_drill_is_case_insensitive():
    from app.tools.coaching import recommend_drill

    result = recommend_drill("  Weight Transfer  ")
    assert result["source"] == "static_dict"


def test_cue_from_snippet_extracts_fix_cue_marker():
    """The corpus stores spoken cues on a `Fix cue: "..."` line so the
    coach can quote them verbatim. The extractor must pull exactly that
    quoted phrase."""
    from app.tools.coaching import _cue_from_snippet

    snippet = (
        "weight transfer -- Drives power into the shot via the legs, not just "
        "the arms. Fix cue: \"Drive your weight from back foot to front foot "
        "through the puck.\" Recommended drill: wall-shoot drill."
    )
    cue = _cue_from_snippet(snippet, "weight transfer")
    assert cue == "Drive your weight from back foot to front foot through the puck."


def test_cue_from_snippet_without_marker_falls_back_to_first_line():
    from app.tools.coaching import _cue_from_snippet

    snippet = "Bend your front knee through the release.\nMore context here."
    cue = _cue_from_snippet(snippet, "front knee bend")
    assert cue == "Bend your front knee through the release."


def test_cue_from_snippet_empty_returns_generic_cue():
    from app.tools.coaching import _cue_from_snippet

    cue = _cue_from_snippet("", "stance")
    assert "stance" in cue.lower()
