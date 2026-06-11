"""Unit tests for the turn input/output sanitizers in app.main.

These guard the two reliability fixes that came out of live session triage:
  - `_clean_coach_text`: strips speaker-label / chain-of-thought artifacts that
    the model occasionally narrates aloud ("Stafford: (thought) ...").
  - `_trim_user_text`: caps an ever-growing open-mic transcript so a rambling
    side conversation can't balloon turn latency.
"""
from __future__ import annotations

from app.main import (
    _MAX_USER_TEXT_CHARS,
    _clean_coach_text,
    _handled_results_pushes,
    _is_duplicate_results_push,
    _is_duplicate_utterance,
    _trim_user_text,
)


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


def test_clean_strips_leaked_thought_block_keeps_quoted_reply():
    # Real leak from session live-yvu3h1au2npn: the model spoke its planning
    # scratchpad to a 5yo. Keep only the quoted intended reply.
    raw = (
        "_thought\n"
        "Aww, he's 5 and doesn't know hockey teams. Let's keep it super simple.\n"
        '"No worries, Jake! It just means I am still looking at your video. '
        'Let\'s do some giant toe touches while we wait." (21 words)\n'
        "Let's call `get_rep_result` again to check."
    )
    cleaned = _clean_coach_text(raw)
    assert cleaned == (
        "No worries, Jake! It just means I am still looking at your video. "
        "Let's do some giant toe touches while we wait."
    )
    assert "thought" not in cleaned.lower()
    assert "get_rep_result" not in cleaned
    assert "21 words" not in cleaned


def test_clean_leaves_normal_reply_untouched():
    reply = "You're far from the net. Big windup, or quick snap?"
    assert _clean_coach_text(reply) == reply


def test_clean_leaves_reply_with_quote_untouched():
    # A normal reply that happens to contain a quote must NOT be mangled —
    # the thought-strip only triggers on an explicit _thought/thinking marker.
    reply = 'Nice one! Just say "shot" right after you let it go.'
    assert _clean_coach_text(reply) == reply


def test_clean_strips_inline_thought_tags_keeps_reply():
    # Real leak from session live-3gh4vmj133s5: the model appended a literal
    # <thought> block AFTER the spoken question, three times in one session.
    raw = (
        "You're on a breakaway and the goalie is deep in their net. Do you "
        "shoot quickly to take the open space, or fake and skate around? "
        "<thought>The player needs to answer. I will stay silent and wait "
        "for their choice.</thought>"
    )
    cleaned = _clean_coach_text(raw)
    assert "thought" not in cleaned.lower()
    assert "stay silent" not in cleaned
    assert cleaned.endswith("or fake and skate around?")


def test_clean_strips_unclosed_inline_thought_tag():
    raw = "Nice shot, Jake! <thought>Now I should check the score"
    assert _clean_coach_text(raw) == "Nice shot, Jake!"


def test_clean_handles_empty():
    assert _clean_coach_text("") == ""


def test_clean_strips_support_phrase_leak():
    raw = "Option B: Wait. Can we help you?"
    assert _clean_coach_text(raw) == "Option B: Wait."


# ---------------------------------------------------------------------------
# Internal-line / tool-narration / echo backstops (session live-ir6r5c4ywpza)
# ---------------------------------------------------------------------------


def test_clean_strips_tool_call_narration_to_filler():
    # The model read its tool call aloud and left a stray "Text:" token.
    raw = "Let's call `get_rep_result(rep_id='6759002696')` to check again.\nText:"
    assert _clean_coach_text(raw) == "One sec — let me check that."


def test_clean_strips_turn_scaffolding_to_filler():
    raw = (
        "Now we transition to Turn 2 of the scorecard walkthrough:\n"
        "- Turn 2: one strength to reinforce, then homework.\n"
        "- Strength from scorecard: power sequencing (5.5)."
    )
    assert _clean_coach_text(raw) == "One sec — let me check that."


def test_clean_keeps_real_reply_drops_trailing_bullet():
    raw = (
        "Hey, your scorecard's ready! Want to walk through it together?\n"
        "- Turn 1: front knee bend was a 1.5."
    )
    assert _clean_coach_text(raw) == (
        "Hey, your scorecard's ready! Want to walk through it together?"
    )


def test_clean_drops_verbatim_echo_of_user():
    user = "Yeah. So what should I do now?"
    cleaned = _clean_coach_text("Yeah. So what should I do now?", user)
    assert cleaned == "Sorry, I didn't catch that — can you say it again?"


def test_clean_allows_short_confirmation_not_treated_as_echo():
    # A short confirmation that mirrors the player's word is NOT an echo.
    assert _clean_coach_text("Wristshot?", "wristshot") == "Wristshot?"


def test_clean_normal_reply_with_user_text_untouched():
    reply = "Big windup it is — bend that front knee and fire!"
    user = "Big windup."
    assert _clean_coach_text(reply, user) == reply


# ---------------------------------------------------------------------------
# _is_duplicate_utterance — open-mic resend collapse
# ---------------------------------------------------------------------------


def test_dedupe_identical_resend_is_dupe():
    assert _is_duplicate_utterance("My answer is B.", "My answer is B.")


def test_dedupe_shrinking_prefix_is_dupe():
    assert _is_duplicate_utterance("My answer", "My answer is B.")


def test_dedupe_superset_with_new_content_is_processed():
    # Session live-3gh4vmj133s5: the player kept explaining after a pause and
    # the fuller transcript was wrongly dropped as a duplicate.
    partial = "It is better to just kind of shoot. Um..."
    full = partial + " I guess I kind of just like skating around faking."
    assert not _is_duplicate_utterance(full, partial)


def test_dedupe_superset_with_trivial_tail_is_dupe():
    assert _is_duplicate_utterance("My answer is B. Yeah", "My answer is B.")


# ---------------------------------------------------------------------------
# _is_duplicate_results_push — re-delivered hidden results-ready pushes
# ---------------------------------------------------------------------------


def test_results_push_second_delivery_is_dupe():
    # Session live-inibrtfoscyy: the same push arrived 6s apart (outside the
    # normal 4s window) and the coach wrapped up twice.
    _handled_results_pushes.clear()
    push = "(Scored rep results are ready (id d6f399f190). Call get_rep_result...)"
    assert not _is_duplicate_results_push("s1", push)
    assert _is_duplicate_results_push("s1", push)


def test_results_push_different_rep_is_not_dupe():
    _handled_results_pushes.clear()
    assert not _is_duplicate_results_push("s1", "(Scored rep results are ready (id aaa).)")
    assert not _is_duplicate_results_push("s1", "(Scored rep results are ready (id bbb).)")


def test_results_push_other_sessions_independent():
    _handled_results_pushes.clear()
    push = "(Scored rep results are ready (id ccc).)"
    assert not _is_duplicate_results_push("s1", push)
    assert not _is_duplicate_results_push("s2", push)


def test_normal_text_never_results_push_dupe():
    _handled_results_pushes.clear()
    assert not _is_duplicate_results_push("s1", "I'm ready to shoot")
    assert not _is_duplicate_results_push("s1", "I'm ready to shoot")


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
