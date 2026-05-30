"""Unit tests for the turn input/output sanitizers in app.main.

These guard the two reliability fixes that came out of live session triage:
  - `_clean_coach_text`: strips speaker-label / chain-of-thought artifacts that
    the model occasionally narrates aloud ("Stafford: (thought) ...").
  - `_trim_user_text`: caps an ever-growing open-mic transcript so a rambling
    side conversation can't balloon turn latency.
"""
from __future__ import annotations

from app.main import _MAX_USER_TEXT_CHARS, _clean_coach_text, _trim_user_text


# ---------------------------------------------------------------------------
# _clean_coach_text — strip artifacts before they reach TTS
# ---------------------------------------------------------------------------


def test_clean_strips_leading_speaker_label():
    assert _clean_coach_text("Stafford: Nice read, Jake!") == "Nice read, Jake!"
    assert _clean_coach_text("Coach Buddy: Let's go.") == "Let's go."


def test_clean_strips_leaked_chain_of_thought_parenthetical():
    raw = "Stafford: (thought) Wait, I must NEVER prefix my responses. So I'll just wait."
    cleaned = _clean_coach_text(raw)
    assert "thought" not in cleaned.lower()
    assert "stafford" not in cleaned.lower()
    assert "So I'll just wait." in cleaned


def test_clean_leaves_normal_reply_untouched():
    reply = "You're far from the net. Big windup, or quick snap?"
    assert _clean_coach_text(reply) == reply


def test_clean_handles_empty():
    assert _clean_coach_text("") == ""


def test_clean_strips_support_phrase_leak():
    raw = "Option B: Wait. Can we help you?"
    assert _clean_coach_text(raw) == "Option B: Wait."


# ---------------------------------------------------------------------------
# _trim_user_text — cap the open-mic transcript
# ---------------------------------------------------------------------------


def test_trim_short_text_unchanged():
    assert _trim_user_text("Skate around them.") == "Skate around them."


def test_trim_keeps_only_the_tail_of_a_long_ramble():
    # Mirrors the live storm: a short answer buried under bystander chatter.
    rambling = (
        "Skate around them. " * 20
        + "So how do they know the right answers? Did you tell them? "
        + "I think it kind of crashed here."
    )
    trimmed = _trim_user_text(rambling)
    assert len(trimmed) <= _MAX_USER_TEXT_CHARS
    assert trimmed.endswith("I think it kind of crashed here.")


def test_trim_starts_at_a_sentence_boundary_when_possible():
    long_text = "x" * (_MAX_USER_TEXT_CHARS - 5) + "end. Fresh sentence here."
    trimmed = _trim_user_text(long_text)
    # Should not begin mid-word with the leftover 'x' run.
    assert trimmed == "Fresh sentence here."
