"""Prompt contract: warm-up timer cues require start_warmup_timer."""
from __future__ import annotations

from app.prompts import COACH_SETH_LIVE_PROMPT, DRILL_COACH_PROMPT


def test_root_prompt_requires_timer_tool_before_screen_cue():
    assert "start_warmup_timer succeeded in this turn" in COACH_SETH_LIVE_PROMPT
    assert 'never say "watch the screen"' in COACH_SETH_LIVE_PROMPT.lower()


def test_drill_prompt_allows_recovery_timer():
    assert "start_warmup_timer" in DRILL_COACH_PROMPT
