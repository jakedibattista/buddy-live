"""Unit tests for the pure parser/normalizer functions.

The parsers turn free-form Gemini Flash responses into the structured fields
the agent + UI depend on. They're the cheapest place to catch regressions
when we tweak prompt wording, so they get the most coverage here.
"""
from __future__ import annotations

from app.tools.peek_camera import _parse_peek_response
from app.tools.peek_warmup import _parse_warmup_response
from app.tools.rep_capture import _normalize_drill


# ---------------------------------------------------------------------------
# peek_warmup parser
# ---------------------------------------------------------------------------


def test_warmup_motion_yes_sets_moving_true():
    raw = (
        "MOTION: yes\n"
        "MOVING: yes\n"
        "FORM: good\n"
        "SETUP: arms swinging in big circles\n"
        "COACH: Nice — that's the move."
    )
    parsed = _parse_warmup_response(raw)
    assert parsed["motion_detected"] is True
    assert parsed["moving"] is True
    assert parsed["form"] == "good"
    assert parsed["setup"] == "arms swinging in big circles"
    assert parsed["observation"] == "Nice — that's the move."


def test_warmup_motion_no_forces_moving_false_even_when_moving_yes():
    """MOTION is the source of truth; a hallucinated MOVING=yes must not win."""
    raw = (
        "MOTION: no\n"
        "MOVING: yes\n"  # the model contradicting itself
        "FORM: adjust\n"
        "SETUP: standing still with arms out\n"
        "COACH: I didn't see you move — let's try together."
    )
    parsed = _parse_warmup_response(raw)
    assert parsed["motion_detected"] is False
    assert parsed["moving"] is False, "MOTION=no must override MOVING=yes"
    assert parsed["form"] == "adjust"


def test_warmup_motion_unclear_falls_back_to_moving_field():
    raw = (
        "MOTION: unclear\n"
        "MOVING: yes\n"
        "FORM: unclear\n"
        "SETUP: hard to tell from angle\n"
        "COACH: Face the camera so I can see you better."
    )
    parsed = _parse_warmup_response(raw)
    assert parsed["motion_detected"] is False
    assert parsed["motion_unclear"] is True
    # When motion is genuinely unclear, fall back to whatever MOVING says.
    assert parsed["moving"] is True


def test_warmup_form_normalizes_to_three_buckets():
    cases = [
        ("good", "good"),
        ("Good — clean reps", "good"),
        ("adjust", "adjust"),
        ("Adjust knee bend", "adjust"),
        ("unclear", "unclear"),
        ("uncertain", "unclear"),
        ("", "unclear"),
    ]
    for form_value, expected in cases:
        raw = f"MOTION: yes\nMOVING: yes\nFORM: {form_value}\nSETUP: x\nCOACH: x"
        assert _parse_warmup_response(raw)["form"] == expected, form_value


def test_warmup_handles_malformed_response_safely():
    parsed = _parse_warmup_response("totally unstructured nonsense from the model")
    # Defaults: no motion, not moving, form unclear, observation falls back to raw text.
    assert parsed["motion_detected"] is False
    assert parsed["moving"] is False
    assert parsed["form"] == "unclear"
    assert parsed["available"] is True
    assert "nonsense" in parsed["observation"]


def test_warmup_handles_empty_response():
    parsed = _parse_warmup_response("")
    assert parsed["motion_detected"] is False
    assert parsed["moving"] is False
    assert parsed["form"] == "unclear"
    assert parsed["setup"] == "warm-up move"


def test_warmup_keys_are_case_insensitive():
    raw = (
        "motion: YES\n"
        "moving: yes\n"
        "form: GOOD\n"
        "setup: arms\n"
        "coach: nice"
    )
    parsed = _parse_warmup_response(raw)
    assert parsed["motion_detected"] is True
    assert parsed["form"] == "good"


# ---------------------------------------------------------------------------
# peek_camera parser
# ---------------------------------------------------------------------------


def test_peek_all_yes_passes_framing():
    raw = (
        "PERSON: yes\n"
        "FULL_BODY: yes\n"
        "FACING: yes\n"
        "STICK: yes\n"
        "SETUP: full body with stick\n"
        "COACH: I can see you head to toes — let's go."
    )
    parsed = _parse_peek_response(raw)
    assert parsed["person_visible"] is True
    assert parsed["full_body_in_frame"] is True
    assert parsed["facing_camera"] is True
    assert parsed["stick_visible"] is True
    assert parsed["setup_framing_passed"] is True


def test_peek_missing_feet_fails_framing():
    raw = (
        "PERSON: yes\n"
        "FULL_BODY: no\n"
        "FACING: yes\n"
        "STICK: yes\n"
        "SETUP: head and feet cut off\n"
        "COACH: Step back so I can see your feet."
    )
    parsed = _parse_peek_response(raw)
    assert parsed["person_visible"] is True
    assert parsed["full_body_in_frame"] is False
    assert parsed["setup_framing_passed"] is False, (
        "framing must fail when full_body=no even if person/facing=yes"
    )


def test_peek_no_person_fails_framing():
    raw = (
        "PERSON: no\n"
        "FULL_BODY: no\n"
        "FACING: no\n"
        "STICK: no\n"
        "SETUP: nobody in frame\n"
        "COACH: Step into frame so I can see you."
    )
    parsed = _parse_peek_response(raw)
    assert parsed["person_visible"] is False
    assert parsed["setup_framing_passed"] is False


def test_peek_facing_no_fails_framing():
    raw = (
        "PERSON: yes\n"
        "FULL_BODY: yes\n"
        "FACING: no\n"
        "STICK: yes\n"
        "SETUP: turned away\n"
        "COACH: Face the camera."
    )
    parsed = _parse_peek_response(raw)
    assert parsed["setup_framing_passed"] is False


def test_peek_handles_malformed_response():
    parsed = _parse_peek_response("just one sentence of feedback")
    assert parsed["person_visible"] is False
    assert parsed["setup_framing_passed"] is False
    # observation falls back to the raw text so the agent still has something to say
    assert "feedback" in parsed["observation"]


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
