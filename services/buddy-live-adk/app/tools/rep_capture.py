"""Rep capture tools: start_rep_capture, analyze_rep, get_rep_result.

These three tools implement the "background analysis while we keep talking" pattern
described in the plan:

  1. `start_rep_capture` posts a command to Firestore. The web client subscribes to
     `live_sessions/{sid}/commands` and begins MediaRecorder capture, uploads the
     resulting .webm to Firebase Storage, then writes a rep doc with the clip URL.
  2. `analyze_rep` reads the rep doc, POSTs the clip storage path to the existing
     modelforpuckbuddy `/api/analyze-video` endpoint, and returns immediately. The
     batch worker runs MediaPipe + Roboflow + Coach Seth scoring (~30-90s).
  3. `get_rep_result` polls the modelforpuckbuddy job-status endpoint (or reads
     the cached result from Firestore) and returns a scorecard or "still processing".

The agent uses NON_BLOCKING behaviour on `analyze_rep` so it can keep talking.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from google.adk.tools.tool_context import ToolContext

from app.firestore_client import db, rep_ref, session_ref

_logger = logging.getLogger(__name__)

_DRILL_ID_MAP = {
    "wristshot": "wristshot",
    "wrist_shot": "wristshot",
    "snapshot": "snapshot",
    "snap": "snapshot",
    "slapshot": "slapshot_form",
    "slap": "slapshot_form",
    "backhand": "backhand",
    "skating": "skating",
    "stride": "skating",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_session_id(tool_context: ToolContext) -> str | None:
    state = tool_context.state or {}
    return state.get("session_id") or state.get("sessionId")


def _normalize_drill(drill_id: str) -> str:
    return _DRILL_ID_MAP.get((drill_id or "").lower().strip(), drill_id)


def start_rep_capture(
    drill_id: str,
    hint: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Tell the web UI to start recording the next rep.

    Args:
        drill_id: One of "wristshot", "snapshot", "skating", "slapshot", "backhand".
        hint: A short user-facing hint shown on the UI ("3 wristshots, go on your time").

    Returns:
        Dict with `rep_id` (use this with analyze_rep) and `status`.
    """
    session_id = _get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "rep_id": None}

    canonical = _normalize_drill(drill_id)
    rep_id = uuid.uuid4().hex[:10]

    ref = rep_ref(session_id, rep_id)
    if ref is not None:
        ref.set(
            {
                "rep_id": rep_id,
                "drill_id": canonical,
                "hint": hint,
                "status": "pending_capture",
                "created_at": _now_iso(),
            }
        )

    sref = session_ref(session_id)
    if sref is not None:
        sref.collection("commands").add(
            {
                "type": "start_capture",
                "rep_id": rep_id,
                "drill_id": canonical,
                "hint": hint,
                "created_at": _now_iso(),
            }
        )

    return {"rep_id": rep_id, "drill_id": canonical, "status": "capture_requested"}


def analyze_rep(
    rep_id: str,
    drill_id: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Kick off deep biomechanics analysis on a recorded rep clip (BACKGROUND).

    This calls the existing modelforpuckbuddy `/api/analyze-video` endpoint, which
    runs MediaPipe pose + Roboflow puck detection + Coach Seth Gemini scoring. The
    analysis takes 30-90s; this tool returns immediately. Use `get_rep_result` later
    to fetch the scorecard.

    Args:
        rep_id: The rep_id returned by start_rep_capture.
        drill_id: Same drill_id used in start_rep_capture.

    Returns:
        Dict with `status` ("queued" | "no_clip" | "error"), `rep_id`, `job_id`.
    """
    session_id = _get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "rep_id": rep_id}

    ref = rep_ref(session_id, rep_id)
    if ref is None:
        return {"status": "no_firestore", "rep_id": rep_id}

    snap = ref.get()
    if not snap.exists:
        return {"status": "no_rep_doc", "rep_id": rep_id}
    rep = snap.to_dict() or {}
    storage_path = rep.get("storage_path")
    if not storage_path:
        return {"status": "no_clip", "rep_id": rep_id}

    canonical = _normalize_drill(drill_id)
    api_url = os.getenv("MODELFORPUCKBUDDY_API_URL", "").rstrip("/")
    if not api_url:
        # Demo / no-backend fallback: write a synthetic placeholder so get_rep_result
        # returns something useful for hackathon walkthroughs.
        ref.update(
            {
                "status": "stub_queued",
                "drill_id": canonical,
                "queued_at": _now_iso(),
            }
        )
        return {"status": "queued_stub", "rep_id": rep_id, "job_id": None}

    auth_token = os.getenv("MODELFORPUCKBUDDY_BEARER_TOKEN")
    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    if api_key := os.getenv("MODELFORPUCKBUDDY_API_KEY"):
        headers["X-API-Key"] = api_key

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                f"{api_url}/api/analyze-video",
                json={
                    "storage_path": storage_path,
                    "drill_id": canonical,
                    "coach_id": "seth",
                },
                headers=headers,
            )
            resp.raise_for_status()
            body = resp.json()
            job_id = body.get("jobId") or body.get("job_id")
    except Exception as exc:
        _logger.exception("analyze_rep modelforpuckbuddy call failed")
        ref.update({"status": "analyze_error", "error": str(exc)})
        return {"status": "error", "rep_id": rep_id, "error": str(exc)}

    ref.update(
        {
            "status": "analyzing",
            "job_id": job_id,
            "drill_id": canonical,
            "queued_at": _now_iso(),
        }
    )
    return {"status": "queued", "rep_id": rep_id, "job_id": job_id}


def get_rep_result(rep_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Get the analysis scorecard for a previously analyzed rep.

    Returns the structured Coach Seth scorecard if ready, else a "processing" status.
    Tell the player to wait if not ready.

    Args:
        rep_id: The rep_id from start_rep_capture / analyze_rep.

    Returns:
        Dict with `status` and (when ready) `scores`, `coach_summary`, `weakest_metric`.
    """
    session_id = _get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "rep_id": rep_id}

    ref = rep_ref(session_id, rep_id)
    if ref is None:
        return {"status": "no_firestore", "rep_id": rep_id}
    snap = ref.get()
    if not snap.exists:
        return {"status": "unknown_rep", "rep_id": rep_id}
    rep = snap.to_dict() or {}

    cached = rep.get("results")
    if cached:
        return _summarize_results(rep_id, cached)

    job_id = rep.get("job_id")
    if not job_id:
        return {"status": rep.get("status", "pending"), "rep_id": rep_id}

    api_url = os.getenv("MODELFORPUCKBUDDY_API_URL", "").rstrip("/")
    if api_url:
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(f"{api_url}/api/job-status/{job_id}")
                if resp.status_code == 200:
                    job = resp.json()
                    job_status = job.get("status")
                    if job_status == "completed":
                        results = job.get("results", {})
                        ref.update({"status": "completed", "results": results})
                        return _summarize_results(rep_id, results)
                    if job_status == "failed":
                        ref.update({"status": "failed", "error": job.get("error")})
                        return {"status": "failed", "rep_id": rep_id, "error": job.get("error")}
                    return {"status": "processing", "rep_id": rep_id, "phase": job_status}
        except Exception as exc:
            _logger.warning("get_rep_result job-status fetch failed: %s", exc)

    return {"status": "processing", "rep_id": rep_id}


_SHOOTING_METRIC_LABELS = {
    "front_knee_bend": "front knee bend",
    "frontKneeBend": "front knee bend",
    "weight_transfer": "weight transfer",
    "weightTransfer": "weight transfer",
    "back_leg_push": "back leg push",
    "backLegPush": "back leg push",
    "bottom_hand": "bottom hand",
    "bottomHand": "bottom hand",
    "top_hand": "top hand",
    "topHand": "top hand",
    "puck_starting_position": "puck starting position",
    "puckStartingPosition": "puck starting position",
    "stick_bend": "stick bend",
    "stickBend": "stick bend",
    "stance": "stance",
}


def _summarize_results(rep_id: str, results: dict[str, Any]) -> dict[str, Any]:
    """Pick the headline numbers from a Coach Seth scorecard for the voice agent."""
    shots = results.get("structured_shots") or []
    if shots:
        first_shot = shots[0]
        metrics: dict[str, Any] = first_shot.get("metrics") or {}
    else:
        metrics = results.get("scores") or results.get("metrics") or {}

    numeric_metrics = {
        k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))
    }
    weakest_metric = None
    weakest_score = None
    if numeric_metrics:
        weakest_metric, weakest_score = min(numeric_metrics.items(), key=lambda kv: kv[1])

    return {
        "status": "ready",
        "rep_id": rep_id,
        "scores": numeric_metrics,
        "weakest_metric": _SHOOTING_METRIC_LABELS.get(weakest_metric or "", weakest_metric),
        "weakest_score": weakest_score,
        "coach_summary": results.get("coach_summary"),
    }


def _record_session_event(session_id: str, event: dict[str, Any]) -> None:
    client = db()
    if client is None:
        return
    try:
        client.collection("live_sessions").document(session_id).collection(
            "coach_log"
        ).add({**event, "ts": _now_iso()})
    except Exception:
        _logger.exception("failed to log session event")
