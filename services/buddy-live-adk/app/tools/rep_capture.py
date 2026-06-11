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

`analyze_rep` never blocks the voice turn: if the clip is still uploading it
returns `waiting_for_clip` immediately. The browser separately kicks off the
same analysis idempotently the moment the upload finishes (see the Next.js
`/api/reps/analyze` route), so analysis always starts without the agent waiting.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from google.adk.tools.tool_context import ToolContext

from app.firestore_client import rep_ref, session_ref
from app.tools._common import get_session_id, now_iso

_logger = logging.getLogger(__name__)

# Canonical drill ids accepted by the modelforpuckbuddy /api/analyze-video
# endpoint. The agent speaks user-facing names ("slapshot") and we map to the
# canonical id here. Anything we don't recognize defaults to "wristshot" so
# analysis never fails on a typo.
_DRILL_ID_MAP = {
    "wristshot": "wristshot",
    "wrist_shot": "wristshot",
    "slapshot": "slapshot_form",
    "slap": "slapshot_form",
    "slapshot_form": "slapshot_form",
    "backhand": "backhand",
}


# After the player shoots, the browser stops recording, uploads the .webm, and
# writes storage_path to the rep doc. If that pipeline fails (too-short clip,
# upload error, dropped connection) the rep would otherwise sit in
# "awaiting_clip" forever and the coach would stall. This watchdog flips a
# stuck rep to "clip_failed" so the coach can offer a quick reshoot.
_CLIP_WATCHDOG_SECS = float(os.getenv("CLIP_WATCHDOG_SECS", "45"))
_CLIP_PENDING_STATUSES = frozenset(
    {"awaiting_clip", "capturing", "pending_capture"}
)


def _seconds_since(iso_ts: str | None) -> float:
    """Seconds elapsed since an ISO timestamp. Returns 0.0 if unparseable so
    the watchdog never fires prematurely on bad data."""
    if not iso_ts:
        return 0.0
    try:
        dt = datetime.fromisoformat(iso_ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return 0.0


def _normalize_drill(drill_id: str) -> str:
    return _DRILL_ID_MAP.get((drill_id or "").lower().strip(), "wristshot")


def _build_auth_headers() -> dict[str, str]:
    """Build headers for modelforpuckbuddy. Accepts either a static API key
    (preferred for service-to-service) or a Bearer token. The API returns 401
    on every call without one of these."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if auth_token := os.getenv("MODELFORPUCKBUDDY_BEARER_TOKEN"):
        headers["Authorization"] = f"Bearer {auth_token}"
    if api_key := os.getenv("MODELFORPUCKBUDDY_API_KEY"):
        headers["X-API-Key"] = api_key
    return headers


def start_rep_capture(
    drill_id: str,
    hint: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Tell the web UI to start recording the next rep.

    Args:
        drill_id: One of "wristshot", "slapshot", or "backhand". Anything else
            is treated as "wristshot" so analysis never fails on a typo.
        hint: A short user-facing hint shown on the UI ("Shoot when you're ready").

    Returns:
        Dict with `rep_id` (use this with analyze_rep) and `status`.
    """
    session_id = get_session_id(tool_context)
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
                # The agent-facing drill name ("slapshot") before mapping to the
                # analysis-API id ("slapshot_form"). Stored so monitoring can
                # tell the two apart instead of seeing an apparent mismatch.
                "requested_drill": drill_id,
                "hint": hint,
                "status": "pending_capture",
                "created_at": now_iso(),
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
                "created_at": now_iso(),
            }
        )
        sref.set({"currentPhase": "scored_reps"}, merge=True)

    return {"rep_id": rep_id, "drill_id": canonical, "status": "capture_requested"}


def stop_rep_capture(rep_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Tell the web UI to stop recording a rep and upload the clip.

    Call this right after the player shoots so the clip is ready before
    analyze_rep runs.

    Args:
        rep_id: The rep_id returned by start_rep_capture.

    Returns:
        Dict with `status` and `rep_id`.
    """
    session_id = get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "rep_id": rep_id}

    sref = session_ref(session_id)
    if sref is not None:
        sref.collection("commands").add(
            {
                "type": "stop_capture",
                "rep_id": rep_id,
                "created_at": now_iso(),
            }
        )

    ref = rep_ref(session_id, rep_id)
    if ref is not None:
        ref.set({"status": "capturing", "capture_stopped_at": now_iso()}, merge=True)

    return {"status": "stop_requested", "rep_id": rep_id}


def _submit_analysis(
    session_id: str,
    rep_id: str,
    drill_id: str,
    storage_path: str,
) -> dict[str, Any]:
    """POST clip to modelforpuckbuddy and update the rep doc."""
    ref = rep_ref(session_id, rep_id)
    if ref is None:
        return {"status": "no_firestore", "rep_id": rep_id}

    canonical = _normalize_drill(drill_id)
    api_url = os.getenv("MODELFORPUCKBUDDY_API_URL", "").rstrip("/")
    if not api_url:
        ref.update(
            {
                "status": "stub_queued",
                "drill_id": canonical,
                "queued_at": now_iso(),
            }
        )
        return {"status": "queued_stub", "rep_id": rep_id, "job_id": None}

    headers = _build_auth_headers()
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
            "queued_at": now_iso(),
        }
    )
    return {"status": "queued", "rep_id": rep_id, "job_id": job_id}


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
    session_id = get_session_id(tool_context)
    if not session_id:
        return {"status": "no_session", "rep_id": rep_id}

    ref = rep_ref(session_id, rep_id)
    if ref is None:
        return {"status": "no_firestore", "rep_id": rep_id}

    snap = ref.get()
    if not snap.exists:
        return {"status": "no_rep_doc", "rep_id": rep_id}
    rep = snap.to_dict() or {}

    if rep.get("job_id"):
        return {
            "status": "already_queued",
            "rep_id": rep_id,
            "job_id": rep.get("job_id"),
        }

    storage_path = rep.get("storage_path")
    if not storage_path:
        # The clip may still be uploading. Don't block the voice turn waiting
        # for it — the browser calls /api/reps/analyze the moment the upload
        # finalizes (idempotent kickoff), so analysis starts on its own. Mark
        # the rep pending and return immediately so the coach keeps talking.
        ref.update({"status": "awaiting_clip", "analysis_pending": True})
        return {
            "status": "waiting_for_clip",
            "rep_id": rep_id,
            "hint": "Clip still uploading — analysis will start automatically.",
        }

    canonical = _normalize_drill(drill_id)
    return _submit_analysis(session_id, rep_id, canonical, storage_path)


def _mark_results_ready(session_id: str) -> None:
    """Set results_ready_at on the session when the first scorecard lands."""
    sref = session_ref(session_id)
    if sref is None:
        return
    try:
        snap = sref.get()
        if snap.exists and (snap.to_dict() or {}).get("results_ready_at"):
            return
        sref.set({"results_ready_at": now_iso()}, merge=True)
    except Exception:
        _logger.exception("results_ready_at write failed")


def get_rep_result(rep_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Get the analysis scorecard for a previously analyzed rep.

    Returns the structured Coach Seth scorecard if ready, else a "processing" status.
    Tell the player to wait if not ready.

    Args:
        rep_id: The rep_id from start_rep_capture / analyze_rep.

    Returns:
        Dict with `status` and (when ready) `scores`, `coach_summary`, `weakest_metric`.
    """
    session_id = get_session_id(tool_context)
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
        _mark_results_ready(session_id)
        return _summarize_results(rep_id, cached)

    job_id = rep.get("job_id")
    if not job_id:
        status = rep.get("status", "pending")
        # The browser already reported the upload failed.
        if status == "clip_failed":
            return {
                "status": "clip_failed",
                "rep_id": rep_id,
                "error": rep.get("clip_error"),
                "hint": "The recording didn't save. Offer the player a quick reshoot.",
            }
        # Watchdog: clip never arrived and we've waited long enough -- don't
        # leave the coach hanging on a rep that will never analyze.
        if status in _CLIP_PENDING_STATUSES:
            started = rep.get("capture_stopped_at") or rep.get("created_at")
            if _seconds_since(started) > _CLIP_WATCHDOG_SECS:
                ref.update({"status": "clip_failed", "clip_failed_at": now_iso()})
                _logger.warning(
                    "rep clip watchdog fired session=%s rep=%s status=%s",
                    session_id,
                    rep_id,
                    status,
                )
                return {
                    "status": "clip_failed",
                    "rep_id": rep_id,
                    "hint": "The recording didn't save. Offer the player a quick reshoot.",
                }
        return {"status": status, "rep_id": rep_id}

    api_url = os.getenv("MODELFORPUCKBUDDY_API_URL", "").rstrip("/")
    if api_url:
        try:
            headers = _build_auth_headers()
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(f"{api_url}/api/job-status/{job_id}", headers=headers)
                if resp.status_code == 200:
                    job = resp.json()
                    job_status = job.get("status")
                    if job_status == "completed":
                        results = job.get("results", {})
                        ref.update({"status": "completed", "results": results})
                        _mark_results_ready(session_id)
                        return _summarize_results(rep_id, results)
                    if job_status == "failed":
                        ref.update({"status": "failed", "error": job.get("error")})
                        return {"status": "failed", "rep_id": rep_id, "error": job.get("error")}
                    return {"status": "processing", "rep_id": rep_id, "phase": job_status}
        except Exception as exc:
            _logger.warning("get_rep_result job-status fetch failed: %s", exc)

    return {"status": "processing", "rep_id": rep_id}


_SHOOTING_METRIC_LABELS = {
    # Wristshot (per-shot API returns camelCase; session_insights uses snake_case)
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
    "puck_position_at_contact": "puck position at contact",
    "puckPositionAtContact": "puck position at contact",
    "stick_bend": "stick flex",
    "stickBend": "stick flex",
    "stance": "stance",
    # Slapshot form
    "stance_and_base": "stance and base",
    "stanceAndBase": "stance and base",
    "wind_up": "wind up",
    "windUp": "wind up",
    "front_knee_bend_at_impact": "front knee bend at impact",
    "frontKneeBendAtImpact": "front knee bend at impact",
    "power_sequence": "power sequence",
    "powerSequence": "power sequence",
    "stick_mechanics": "stick mechanics",
    "stickMechanics": "stick mechanics",
    "follow_through": "follow through",
    "followThrough": "follow through",
    "arm_mechanics": "arm mechanics",
    "armMechanics": "arm mechanics",
    # Backhand
    "posture_and_balance": "posture and balance",
    "postureAndBalance": "posture and balance",
    "extension_through_release": "extension through release",
    "extensionThroughRelease": "extension through release",
    "puck_control_roll": "puck control roll",
    "puckControlRoll": "puck control roll",
    "top_hand_control": "top hand control",
    "topHandControl": "top hand control",
    "blade_angle": "blade angle",
    "bladeAngle": "blade angle",
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

    # Degenerate result: the analyzer returned a scorecard with no usable
    # metrics (e.g. the clip was poorly framed / no clear shot, as in session
    # live-tc0ot4sklzju where every metric came back null). Do NOT pretend to
    # have a score -- tell the coach to be honest and wrap up warmly.
    if not numeric_metrics:
        return {
            "status": "unscoreable",
            "rep_id": rep_id,
            "hint": (
                "Analysis didn't lock onto a clear shot in that clip (the "
                "player likely set up or moved without taking one big, full, "
                "committed shot). Be honest in one sentence, do NOT invent "
                "scores, and do NOT make up mechanics homework -- there is no "
                "data. OFFER ONE RETAKE: \"That one didn't track -- want to "
                "take one more shot? This time take one big full shot and say "
                "'shot!' right after.\" If they say yes, call start_rep_capture "
                "again (the retake is allowed). If they decline or this was "
                "already the retake, give one encouragement, make the homework "
                "the clean-shot cue itself, then move to the recap."
            ),
            "coach_summary": results.get("coach_summary"),
        }

    weakest_metric, weakest_score = min(numeric_metrics.items(), key=lambda kv: kv[1])

    return {
        "status": "ready",
        "rep_id": rep_id,
        "scores": numeric_metrics,
        "weakest_metric": _SHOOTING_METRIC_LABELS.get(weakest_metric or "", weakest_metric),
        "weakest_score": weakest_score,
        "coach_summary": results.get("coach_summary"),
    }
