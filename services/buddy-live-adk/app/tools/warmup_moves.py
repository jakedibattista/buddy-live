"""Warm-up move lookup: grounded retrieval + static fallback catalog.

The root coach calls :func:`lookup_warmup_moves` at the start of warm-up to
pick 3 general + 2 hockey-specific moves (30 seconds each) instead of running
the same fixed four-move script every session.

Resolution order (mirrors :func:`recommend_drill`):
  1. Vertex AI Search via :func:`lookup_drill_knowledge` — ranks catalog moves
     that appear in retrieved snippets so grounded content surfaces first.
  2. Shuffled static catalog — used when grounding is disabled or returns no
     matches. Session id seeds the shuffle so two sessions feel different.
"""
from __future__ import annotations

import hashlib
import random
from typing import Any, Literal

from google.adk.tools.tool_context import ToolContext

from app.tools._common import get_session_id
from app.tools.grounding import lookup_drill_knowledge

WarmupCategory = Literal["general", "hockey"]

_DURATION_SECONDS = 30

# Static fallback — kept in sync with knowledge/warmup-general.md and
# knowledge/warmup-hockey.md so offline evals and missing Vertex config
# still return kid-friendly, varied warm-ups.
_GENERAL_MOVES: list[dict[str, str]] = [
    {
        "id": "arm_circles",
        "label": "Arm circles",
        "exercise": "slow arm circles with arms out wide",
        "spoken_demo_under_10": (
            "Spread your arms like airplane wings. Make big slow circles — thirty seconds."
        ),
    },
    {
        "id": "high_knees",
        "label": "High knees",
        "exercise": "march in place lifting knees high",
        "spoken_demo_under_10": (
            "March in place. Lift each knee up high, like stepping over a puddle — thirty seconds."
        ),
    },
    {
        "id": "torso_twists",
        "label": "Torso twists",
        "exercise": "standing torso twists with arms loose at the sides",
        "spoken_demo_under_10": (
            "Stand tall and twist your shoulders left, then right — like you're looking "
            "behind you — thirty seconds."
        ),
    },
    {
        "id": "leg_swings",
        "label": "Leg swings",
        "exercise": "slow forward and backward leg swings holding a wall or chair",
        "spoken_demo_under_10": (
            "Hold something steady. Swing one leg forward and back slow, then switch — thirty seconds."
        ),
    },
    {
        "id": "shoulder_rolls",
        "label": "Shoulder rolls",
        "exercise": "big slow shoulder rolls forward then backward",
        "spoken_demo_under_10": (
            "Roll your shoulders in big slow circles — forward, then backward — thirty seconds."
        ),
    },
    {
        "id": "standing_squats",
        "label": "Standing squats",
        "exercise": "slow bodyweight squats with feet shoulder-width apart",
        "spoken_demo_under_10": (
            "Feet apart, bend your knees like sitting in a chair, then stand up slow — thirty seconds."
        ),
    },
    {
        "id": "calf_raises",
        "label": "Calf raises",
        "exercise": "slow calf raises rising onto toes then lowering heels",
        "spoken_demo_under_10": (
            "Rise up on your toes slow, then lower your heels — like you're reaching for a shelf — "
            "thirty seconds."
        ),
    },
    {
        "id": "ankle_circles",
        "label": "Ankle circles",
        "exercise": "lift one foot slightly, slow circles with the ankle, switch feet",
        "spoken_demo_under_10": (
            "Lift one foot a little. Make slow circles with your ankle — switch feet — thirty seconds."
        ),
    },
    {
        "id": "overhead_march",
        "label": "Overhead march",
        "exercise": "march in place holding stick overhead with straight arms",
        "spoken_demo_under_10": (
            "Hold your stick up high like a tunnel. March in place — thirty seconds."
        ),
    },
    {
        "id": "side_shuffles",
        "label": "Side shuffles",
        "exercise": "slow side-to-side shuffles with knees bent, stay facing forward",
        "spoken_demo_under_10": (
            "Bend your knees. Shuffle left, shuffle right — stay facing forward — thirty seconds."
        ),
    },
]

_HOCKEY_MOVES: dict[str, list[dict[str, str]]] = {
    "wristshot": [
        {
            "id": "stick_wipers",
            "label": "Stick wipers",
            "exercise": "stick out front tapping side to side like windshield wipers",
            "spoken_demo_under_10": (
                "Hold your stick out in front. Tap left, then right, like wiping a windshield — "
                "thirty seconds."
            ),
        },
        {
            "id": "shadow_wristshot",
            "label": "Shadow wrist shot",
            "exercise": "slow pretend wrist shot with knees bent and wrist snap",
            "spoken_demo_under_10": (
                "Pretend you're shooting at the net. Bend your knees and snap your wrists — "
                "slow motion — thirty seconds."
            ),
        },
        {
            "id": "puck_pulls",
            "label": "Puck pulls",
            "exercise": "slow puck pulls across the body with stick on the floor",
            "spoken_demo_under_10": (
                "Slide an imaginary puck across your body slow, then pull it back — thirty seconds."
            ),
        },
        {
            "id": "stickhandling_in_place",
            "label": "Stickhandling",
            "exercise": "quick stickhandling in place with soft hands",
            "spoken_demo_under_10": (
                "Tap the puck or ball left and right in front of you — soft quick hands — "
                "thirty seconds."
            ),
        },
        {
            "id": "quick_feet",
            "label": "Quick feet",
            "exercise": "fast small steps in place on the balls of the feet, knees bent",
            "spoken_demo_under_10": (
                "Quick tiny steps in place — like the floor is hot — stay low — thirty seconds."
            ),
        },
        {
            "id": "one_timer_shadow",
            "label": "One-timer shadow",
            "exercise": "slow pretend one-timer as if receiving a pass, no windup",
            "spoken_demo_under_10": (
                "Pretend a pass is coming — shoot in one motion, no big windup — thirty seconds."
            ),
        },
    ],
    "slapshot": [
        {
            "id": "stick_wipers",
            "label": "Stick wipers",
            "exercise": "stick out front tapping side to side like windshield wipers",
            "spoken_demo_under_10": (
                "Hold your stick out in front. Tap left, then right, like wiping a windshield — "
                "thirty seconds."
            ),
        },
        {
            "id": "shadow_slapshot",
            "label": "Shadow slap shot",
            "exercise": "slow pretend slap shot sweeping stick down toward the floor",
            "spoken_demo_under_10": (
                "Pretend a puck is on the floor. Stick back a little, then sweep down slow — "
                "thirty seconds."
            ),
        },
        {
            "id": "wind_up_practice",
            "label": "Wind-up practice",
            "exercise": "slow slap shot wind-up to waist height without full swing",
            "spoken_demo_under_10": (
                "Bring your stick up to your waist slow, then sweep down like a slap shot — "
                "thirty seconds."
            ),
        },
        {
            "id": "weight_shift_drill",
            "label": "Weight shift",
            "exercise": "shift weight from back foot to front foot with stick on floor",
            "spoken_demo_under_10": (
                "Stick on the floor. Shift your weight from back foot to front foot slow — "
                "thirty seconds."
            ),
        },
        {
            "id": "quick_feet",
            "label": "Quick feet",
            "exercise": "fast small steps in place on the balls of the feet, knees bent",
            "spoken_demo_under_10": (
                "Quick tiny steps in place — like the floor is hot — stay low — thirty seconds."
            ),
        },
        {
            "id": "one_timer_shadow",
            "label": "One-timer shadow",
            "exercise": "slow pretend one-timer as if receiving a pass, no windup",
            "spoken_demo_under_10": (
                "Pretend a pass is coming — shoot in one motion, no big windup — thirty seconds."
            ),
        },
    ],
    "backhand": [
        {
            "id": "stick_wipers",
            "label": "Stick wipers",
            "exercise": "stick out front tapping side to side like windshield wipers",
            "spoken_demo_under_10": (
                "Hold your stick out in front. Tap left, then right, like wiping a windshield — "
                "thirty seconds."
            ),
        },
        {
            "id": "shadow_backhand",
            "label": "Shadow backhand",
            "exercise": "slow pretend backhand sweeping stick across the body",
            "spoken_demo_under_10": (
                "Pretend the puck is on your back foot side. Sweep your stick across your body "
                "slow — thirty seconds."
            ),
        },
        {
            "id": "cross_body_pulls",
            "label": "Cross-body pulls",
            "exercise": "slow cross-body puck pulls with stick cupping motion",
            "spoken_demo_under_10": (
                "Pull an imaginary puck across your body slow, cupping with your stick — "
                "thirty seconds."
            ),
        },
        {
            "id": "stickhandling_in_place",
            "label": "Stickhandling",
            "exercise": "quick stickhandling in place with soft hands",
            "spoken_demo_under_10": (
                "Tap the puck or ball left and right in front of you — soft quick hands — "
                "thirty seconds."
            ),
        },
        {
            "id": "quick_feet",
            "label": "Quick feet",
            "exercise": "fast small steps in place on the balls of the feet, knees bent",
            "spoken_demo_under_10": (
                "Quick tiny steps in place — like the floor is hot — stay low — thirty seconds."
            ),
        },
    ],
}

_DRILL_ALIASES = {
    "slapshot_form": "slapshot",
    "slap": "slapshot",
}


def _normalize_drill(drill_id: str) -> str:
    key = (drill_id or "").strip().lower()
    return _DRILL_ALIASES.get(key, key) if key in _DRILL_ALIASES else (
        key if key in _HOCKEY_MOVES else "wristshot"
    )


def _catalog_for(category: WarmupCategory, focus_drill: str) -> list[dict[str, str]]:
    if category == "general":
        return list(_GENERAL_MOVES)
    drill = _normalize_drill(focus_drill)
    return list(_HOCKEY_MOVES.get(drill, _HOCKEY_MOVES["wristshot"]))


def _grounding_query(category: WarmupCategory, focus_drill: str) -> str:
    if category == "general":
        return "off-ice general warm-up standing moves 30 seconds youth hockey"
    drill = _normalize_drill(focus_drill)
    return f"hockey {drill} warm-up stick moves 30 seconds off-ice"


def _score_move(move: dict[str, str], grounded_text: str) -> int:
    """Higher score = stronger match to grounded retrieval text."""
    haystack = grounded_text.lower()
    score = 0
    for token in (move["id"], move["label"], move["exercise"]):
        if token.lower() in haystack:
            score += 2
    # Partial word hits on label (e.g. "wipers" in "stick wipers")
    for word in move["label"].lower().split():
        if len(word) > 3 and word in haystack:
            score += 1
    return score


def _grounded_blob(grounded: dict[str, Any]) -> str:
    parts: list[str] = []
    for hit in grounded.get("results") or []:
        parts.append(str(hit.get("title") or ""))
        parts.append(str(hit.get("snippet") or ""))
    parts.append(str(grounded.get("summary") or ""))
    return "\n".join(parts)


def _shuffle_key(session_id: str | None, category: str, focus_drill: str) -> int:
    seed_material = f"{session_id or 'default'}:{category}:{focus_drill}"
    digest = hashlib.sha256(seed_material.encode()).hexdigest()
    return int(digest[:8], 16)


def _select_moves(
    catalog: list[dict[str, str]],
    grounded: dict[str, Any] | None,
    count: int,
    session_id: str | None,
    category: str,
    focus_drill: str,
) -> tuple[list[dict[str, Any]], str]:
    """Pick ``count`` distinct moves; prefer grounding-ranked hits when available."""
    count = max(1, min(count, len(catalog)))
    blob = _grounded_blob(grounded or {})
    ranked = sorted(catalog, key=lambda m: _score_move(m, blob), reverse=True)

    if grounded and grounded.get("available") and any(_score_move(m, blob) > 0 for m in ranked):
        picked = ranked[:count]
        source = "vertex_ai_search"
    else:
        rng = random.Random(_shuffle_key(session_id, category, focus_drill))
        picked = rng.sample(catalog, count)
        source = "static_catalog"

    return (
        [
            {
                "label": m["label"],
                "exercise": m["exercise"],
                "spoken_demo_under_10": m["spoken_demo_under_10"],
                "duration_seconds": _DURATION_SECONDS,
            }
            for m in picked
        ],
        source,
    )


def lookup_warmup_moves(
    category: str,
    focus_drill: str = "",
    count: int = 3,
    tool_context: ToolContext | None = None,
) -> dict[str, Any]:
    """Fetch warm-up moves from the knowledge corpus (with static fallback).

    Call once at the start of warm-up for general moves (``count=3``), then
    again for hockey-specific moves (``category="hockey"``, ``count=2``,
    ``focus_drill`` set to today's drill). Run the returned moves in order;
    each is 30 seconds via ``start_warmup_timer``.

    Args:
        category: ``"general"`` for body-loosening moves, ``"hockey"`` for
            stick/skating prep matched to the focus drill.
        focus_drill: Required when ``category="hockey"``. One of
            ``wristshot``, ``slapshot``, ``backhand``.
        count: How many moves to return (default 3; use 2 for hockey block).

    Returns:
        Dict with ``moves`` (list of label/exercise/spoken_demo/duration),
        ``source`` (``vertex_ai_search`` or ``static_catalog``), and
        ``available`` (always ``True`` when the catalog has entries).
    """
    cat = (category or "").strip().lower()
    if cat not in ("general", "hockey"):
        return {
            "available": False,
            "category": category,
            "moves": [],
            "reason": 'category must be "general" or "hockey"',
        }

    if cat == "hockey" and not (focus_drill or "").strip():
        return {
            "available": False,
            "category": cat,
            "moves": [],
            "reason": "focus_drill required for hockey warm-up moves",
        }

    session_id = get_session_id(tool_context) if tool_context else None
    catalog = _catalog_for(cat, focus_drill)  # type: ignore[arg-type]
    grounded = lookup_drill_knowledge(_grounding_query(cat, focus_drill))  # type: ignore[arg-type]
    moves, source = _select_moves(
        catalog,
        grounded,
        count,
        session_id,
        cat,
        focus_drill,
    )

    return {
        "available": True,
        "category": cat,
        "focus_drill": _normalize_drill(focus_drill) if cat == "hockey" else None,
        "moves": moves,
        "source": source,
        "grounded": grounded.get("available", False),
        "hint": (
            "Run each move for 30 seconds. Ask if they know it, demo if needed, "
            "wait for ready, then start_warmup_timer(exercise, 30, label)."
        ),
    }


__all__ = ["lookup_warmup_moves"]
