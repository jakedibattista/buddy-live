"""Coaching helper tools: recommend_drill, end_session_recap."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from google.adk.tools.tool_context import ToolContext

from app.firestore_client import db, session_ref
from app.tools.grounding import lookup_drill_knowledge

_SESSION_SUMMARIES_COLLECTION = "session_summaries"

_logger = logging.getLogger(__name__)


_DRILL_RECOMMENDATIONS: dict[str, dict[str, str]] = {
    # --- Wristshot ---
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

    Resolution order:
      1. Vertex AI Search grounding against the curated drill corpus
         (Phase 3). Returns the top result with the source snippet so the
         coach can cite a real, vetted drill instead of a YouTube search
         results page.
      2. Static dict lookup (legacy hand-curated mapping). Used when
         grounding is disabled, returns nothing, or errors out.
      3. Generic fallback ("50 wristshots a day") -- only when both above
         miss, so the coach is never empty-handed.

    Args:
        weakest_metric: Human-readable metric name (e.g., "front knee bend",
            "weight transfer"). Case-insensitive.

    Returns:
        Dict with `title`, `url`, `cue`, and (when grounded) a `source`
        snippet the coach can reference verbatim.
    """
    metric = (weakest_metric or "").strip()

    if metric:
        grounded = lookup_drill_knowledge(
            f"recommended drill for {metric} weakness in hockey shooting"
        )
        if grounded.get("available"):
            top = (grounded.get("results") or [None])[0]
            if top and (top.get("snippet") or top.get("title")):
                title = top.get("title") or f"{metric} drill"
                snippet = top.get("snippet") or ""
                cue = _cue_from_snippet(snippet, metric)
                return {
                    "title": title,
                    "url": top.get("uri")
                    or f"https://www.youtube.com/results?search_query=hockey+{metric.replace(' ', '+')}+drill",
                    "cue": cue,
                    "source": "vertex_ai_search",
                    "snippet": snippet,
                }

    key = metric.lower()
    rec = _DRILL_RECOMMENDATIONS.get(key)
    if rec:
        return {**rec, "source": "static_dict"}
    return {
        "title": "Daily 50 wristshots",
        "url": "https://www.youtube.com/results?search_query=hockey+50+wristshots+a+day",
        "cue": "50 wristshots a day, every day. Consistency wins.",
        "source": "fallback",
    }


_CUE_SECTION_BREAKS = (
    "Recommended drill:",
    "Search hint:",
    "Good looks like:",
    "Related metrics",
)


def _cue_from_snippet(snippet: str, metric: str) -> str:
    """Extract a short spoken cue from a corpus snippet.

    The drill corpus puts the spoken cue on a line that starts with
    ``Fix cue:`` (see ``services/buddy-live-adk/knowledge/metrics-*.md``).
    Vertex AI Search snippets sometimes flow paragraphs onto a single
    line, so we look for a quoted cue first, then fall back to splitting
    on the next known section header, then on a newline. If nothing
    matches we return a generic metric-focused cue so the coach is
    never speechless.
    """
    if not snippet:
        return f"Focus on your {metric} this week. Small reps, big gains."

    for marker in ("Fix cue:", "Cue:"):
        if marker not in snippet:
            continue
        tail = snippet.split(marker, 1)[1].lstrip()
        if tail.startswith('"'):
            closing = tail.find('"', 1)
            if closing > 1:
                cue = tail[1:closing].strip()
                if cue:
                    return cue
        line = tail.split("\n", 1)[0]
        for delim in _CUE_SECTION_BREAKS:
            if delim in line:
                line = line.split(delim, 1)[0]
                break
        cue = line.strip().strip('"').strip()
        if cue:
            return cue

    return snippet.split("\n", 1)[0].strip() or (
        f"Focus on your {metric} this week. Small reps, big gains."
    )


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

    ended_at = datetime.now(timezone.utc).isoformat()
    if ref is not None:
        try:
            ref.set(
                {
                    "currentPhase": "recap",
                    "ended_at": ended_at,
                },
                merge=True,
            )
        except Exception:
            _logger.exception("end_session_recap status write failed")

    # Persist a compact, long-lived summary for weekly review. Lives in a
    # separate top-level collection so it survives the live_sessions TTL.
    try:
        session_doc = (ref.get().to_dict() or {}) if ref is not None else {}
        _write_session_summary(
            session_id=session_id,
            session_doc=session_doc,
            by_drill=by_drill,
            averages=averages,
            biggest_opportunity=biggest_opportunity,
            ended_at=ended_at,
        )
    except Exception:
        _logger.exception("session summary write failed")

    return {
        "total_reps": sum(by_drill.values()),
        "by_drill": by_drill,
        "average_scores": averages,
        "biggest_opportunity": biggest_opportunity,
        "summary": summary,
    }


def _write_session_summary(
    *,
    session_id: str,
    session_doc: dict[str, Any],
    by_drill: dict[str, int],
    averages: dict[str, float],
    biggest_opportunity: str | None,
    ended_at: str,
) -> None:
    """Write a single compact summary doc per session into session_summaries/.

    Schema is deliberately flat so it can be queried/filtered in the Firebase
    console without indexes. Keep this lean -- one row per session is the
    weekly review unit, not a high-cardinality analytics stream.
    """
    client = db()
    if client is None:
        return

    primary_drill = (
        session_doc.get("focus_drill")
        or (max(by_drill, key=by_drill.get) if by_drill else None)
    )

    summary_doc: dict[str, Any] = {
        "session_id": session_id,
        "created_at": ended_at,
        "started_at": session_doc.get("startedAt"),
        "drill": primary_drill,
        "rep_count": sum(by_drill.values()),
        "by_drill": by_drill,
        "weakest_metric": biggest_opportunity,
        "average_scores": averages,
        "framing_struggles": int(session_doc.get("framing_failure_count") or 0),
        "warmup_motion_misses": int(session_doc.get("warmup_motion_miss_count") or 0),
        "warmup_moves_checked": int(session_doc.get("warmup_moves_checked") or 0),
        "final_phase": session_doc.get("currentPhase"),
        "player_name": session_doc.get("player_name"),
        "player_age": session_doc.get("player_age"),
        "player_name_normalized": session_doc.get("player_name_normalized"),
        "user_id": session_doc.get("user_id"),
    }
    client.collection(_SESSION_SUMMARIES_COLLECTION).document(session_id).set(
        summary_doc,
        merge=True,
    )
