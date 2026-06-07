"""Unit tests for the pure parser/normalizer functions.

The parsers turn free-form Gemini Flash responses into the structured fields
the agent + UI depend on. They're the cheapest place to catch regressions
when we tweak prompt wording, so they get the most coverage here.
"""
from __future__ import annotations

from app.tools.rep_capture import _normalize_drill


# ---------------------------------------------------------------------------
# rep_capture drill normalizer
# ---------------------------------------------------------------------------


def test_normalize_drill_canonical_ids_pass_through():
    assert _normalize_drill("wristshot") == "wristshot"
    assert _normalize_drill("slapshot_form") == "slapshot_form"
    assert _normalize_drill("backhand") == "backhand"


def test_normalize_drill_maps_user_facing_slapshot_to_canonical():
    assert _normalize_drill("slapshot") == "slapshot_form"
    assert _normalize_drill("SLAPSHOT") == "slapshot_form"
    assert _normalize_drill("slap") == "slapshot_form"


def test_normalize_drill_unknown_falls_back_to_wristshot():
    """Don't let a typo or legacy id ('snapshot', 'skating') break analysis."""
    assert _normalize_drill("snapshot") == "wristshot"
    assert _normalize_drill("skating") == "wristshot"
    assert _normalize_drill("typo") == "wristshot"
    assert _normalize_drill("") == "wristshot"


def test_normalize_drill_strips_whitespace_and_case():
    assert _normalize_drill("  Wristshot  ") == "wristshot"
    assert _normalize_drill("Backhand") == "backhand"
