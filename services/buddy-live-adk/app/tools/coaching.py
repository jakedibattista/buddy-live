"""Coaching helper tools: recommend_drill, end_session_recap."""
from __future__ import annotations

import logging
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)


_DRILL_RECOMMENDATIONS: dict[str, dict[str, str]] = {
    "front knee bend": {
        "title": "Deep knee bend wristshot drill",
        "url": "https://www.youtube.com/results?search_query=hockey+knee+bend+shooting+drill",
        "cue": "Get lower. Imagine sitting back into a chair before the release.",
    },
    "weight transfer": {
        "title": "Wall-shoot weight-transfer drill",
        "url": "https://www.youtube.com/results?search_query=hockey+weight+transfer+drill",
        "cue": "Drive your weight from back foot to front foot through the puck.",
    },
    "back leg push": {
        "title": "Back-leg explosion drill",
        "url": "https://www.youtube.com/results?search_query=hockey+back+leg+push+drill",
        "cue": "Snap your back leg straight as you release -- like a coiled spring.",
    },
    "bottom hand": {
        "title": "Bottom hand pull-through drill",
        "url": "https://www.youtube.com/results?search_query=hockey+bottom+hand+drill",
        "cue": "Pull hard with your bottom hand toward your hip on release.",
    },
    "top hand": {
        "title": "Top hand snap drill",
        "url": "https://www.youtube.com/results?search_query=hockey+top+hand+wrist+snap",
        "cue": "Roll your top wrist over at the very end -- that's the snap.",
    },
    "puck starting position": {
        "title": "Puck-in-the-pocket drill",
        "url": "https://www.youtube.com/results?search_query=hockey+puck+position+stance",
        "cue": "Start the puck closer to your back foot for a quicker release.",
    },
    "stick bend": {
        "title": "Stick-load drill",
        "url": "https://www.youtube.com/results?search_query=hockey+stick+flex+loading",
        "cue": "Push down into the ice to load the stick before the snap.",
    },
    "stance": {
        "title": "Athletic stance basics",
        "url": "https://www.youtube.com/results?search_query=hockey+shooting+stance",
        "cue": "Shoulder-width feet, knees bent, head over puck.",
    },
}


def recommend_drill(weakest_metric: str) -> dict[str, Any]:
    """Recommend a homework drill targeting the player's weakest metric.

    Args:
        weakest_metric: Human-readable metric name (e.g., "front knee bend",
            "weight transfer"). Case-insensitive.

    Returns:
        Dict with `title`, `url`, and a one-line `cue` the coach can speak.
    """
    key = (weakest_metric or "").lower().strip()
    rec = _DRILL_RECOMMENDATIONS.get(key)
    if rec:
        return rec
    return {
        "title": "Daily 50 wristshots",
        "url": "https://www.youtube.com/results?search_query=hockey+50+wristshots+a+day",
        "cue": "50 wristshots a day, every day. Consistency wins.",
    }


def end_session_recap(tool_context: ToolContext) -> dict[str, Any]:
    """Summarize the session: how many reps per drill, average scores, single biggest improvement.

    Reads all reps from the current Firestore session and returns a compact summary
    the coach can speak in 2-3 sentences.

    Returns:
        Dict with `total_reps`, `by_drill`, `average_scores`, `biggest_opportunity`,
        and `summary` (one short paragraph).
    """
    state = tool_context.state or {}
    session_id = state.get("session_id") or state.get("sessionId")
    if not session_id:
        return {"summary": "Great work out there today.", "total_reps": 0}

    ref = session_ref(session_id)
    if ref is None:
        return {"summary": "Great work out there today.", "total_reps": 0}

    reps_snap = list(ref.collection("reps").stream())
    by_drill: dict[str, int] = {}
    all_scores: dict[str, list[float]] = {}
    for snap in reps_snap:
        rep = snap.to_dict() or {}
        drill = rep.get("drill_id", "unknown")
        by_drill[drill] = by_drill.get(drill, 0) + 1
        results = rep.get("results") or {}
        shots = results.get("structured_shots") or []
        for shot in shots:
            metrics = shot.get("metrics") or {}
            for k, v in metrics.items():
                if isinstance(v, (int, float)):
                    all_scores.setdefault(k, []).append(float(v))
        flat = results.get("scores") or {}
        for k, v in flat.items():
            if isinstance(v, (int, float)):
                all_scores.setdefault(k, []).append(float(v))

    averages = {k: sum(v) / len(v) for k, v in all_scores.items() if v}
    biggest_opportunity = None
    if averages:
        biggest_opportunity = min(averages, key=averages.get)

    if not by_drill:
        summary = "Great work today. Let's review your reps next time."
    else:
        rep_summary = ", ".join(f"{n} {drill}" for drill, n in by_drill.items())
        if biggest_opportunity:
            label = biggest_opportunity.replace("_", " ").lower()
            summary = (
                f"Nice session: {rep_summary}. Biggest area to work on is your {label}. "
                "Keep grinding."
            )
        else:
            summary = f"Nice session: {rep_summary}. Keep grinding."

    return {
        "total_reps": sum(by_drill.values()),
        "by_drill": by_drill,
        "average_scores": averages,
        "biggest_opportunity": biggest_opportunity,
        "summary": summary,
    }
