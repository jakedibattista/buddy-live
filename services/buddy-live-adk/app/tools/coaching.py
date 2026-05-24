"""Coaching helper tools: recommend_drill, end_session_recap."""
from __future__ import annotations

import logging
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import session_ref

_logger = logging.getLogger(__name__)


_DRILL_RECOMMENDATIONS: dict[str, dict[str, str]] = {
    # --- Wristshot / snapshot ---
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
    "puck position at contact": {
        "title": "Puck contact-point drill",
        "url": "https://www.youtube.com/results?search_query=hockey+puck+contact+point+shooting",
        "cue": "Make contact off your front foot -- not your back foot.",
    },
    "stick flex": {
        "title": "Stick-load drill",
        "url": "https://www.youtube.com/results?search_query=hockey+stick+flex+loading",
        "cue": "Push down into the floor to load the stick before the snap.",
    },
    "stick bend": {
        "title": "Stick-load drill",
        "url": "https://www.youtube.com/results?search_query=hockey+stick+flex+loading",
        "cue": "Push down into the floor to load the stick before the snap.",
    },
    "stance": {
        "title": "Athletic stance basics",
        "url": "https://www.youtube.com/results?search_query=hockey+shooting+stance",
        "cue": "Shoulder-width feet, knees bent, head over the puck.",
    },
    # --- Slapshot form ---
    "stance and base": {
        "title": "Slapshot stance drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+stance+base",
        "cue": "Feet wider than your shoulders, weight on the back leg before the wind-up.",
    },
    "wind up": {
        "title": "Slapshot wind-up drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+wind+up",
        "cue": "Stick to waist height, not over your head -- short and snappy.",
    },
    "front knee bend at impact": {
        "title": "Slapshot knee bend drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+knee+bend",
        "cue": "Bend your front knee as the stick hits the floor -- drive through it.",
    },
    "power sequence": {
        "title": "Slapshot kinetic-chain drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+power+sequence",
        "cue": "Hips first, then shoulders, then arms -- chain it together.",
    },
    "stick mechanics": {
        "title": "Slapshot stick flex drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+stick+flex",
        "cue": "Hit the floor an inch behind the puck so the stick flexes into the shot.",
    },
    "follow through": {
        "title": "Slapshot follow-through drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+follow+through",
        "cue": "Point the blade where you want the puck to go after release.",
    },
    "arm mechanics": {
        "title": "Slapshot arm extension drill",
        "url": "https://www.youtube.com/results?search_query=hockey+slapshot+arm+extension",
        "cue": "Keep your top arm straighter through the swing -- don't collapse the elbow.",
    },
    # --- Backhand ---
    "posture and balance": {
        "title": "Backhand balance drill",
        "url": "https://www.youtube.com/results?search_query=hockey+backhand+balance+posture",
        "cue": "Stay tall through the shot -- don't lean back as you release.",
    },
    "extension through release": {
        "title": "Backhand follow-through drill",
        "url": "https://www.youtube.com/results?search_query=hockey+backhand+follow+through",
        "cue": "Push your hands up and across your body after release -- full extension.",
    },
    "puck control roll": {
        "title": "Backhand cup-and-roll drill",
        "url": "https://www.youtube.com/results?search_query=hockey+backhand+cup+roll",
        "cue": "Roll the puck from the back of the blade to the front as you sweep.",
    },
    "top hand control": {
        "title": "Backhand top hand drill",
        "url": "https://www.youtube.com/results?search_query=hockey+backhand+top+hand",
        "cue": "Keep your top hand away from your body so the stick can travel freely.",
    },
    "blade angle": {
        "title": "Backhand blade angle drill",
        "url": "https://www.youtube.com/results?search_query=hockey+backhand+blade+angle",
        "cue": "Cup the puck on release -- closed blade lifts it for the upper corners.",
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
