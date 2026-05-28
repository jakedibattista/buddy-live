"""Cloud Trace setup for the Buddy Live ADK service.

ADK 2.0 emits rich OpenTelemetry spans natively (agent invocations, tool
calls, LLM rounds with token usage, GenAI semantic conventions, etc.). All
this module does is wire those spans to **Cloud Trace** so judges can open
the GCP Cloud Trace console and see exactly how Coach Buddy reasoned
through each turn — which is the "Agent Observability" piece Track 2 asks
to see in the demo.

Track 2 reference: see ``docs/TRACK2-PLAN.md`` Phase 2.

Design

- Gated on the ``BUDDY_ENABLE_CLOUD_TRACE`` env var. Off by default so local
  imports never need ADC creds. Cloud Run sets it explicitly.
- Uses ADK's first-party ``telemetry.google_cloud.get_gcp_exporters`` +
  ``telemetry.setup.maybe_set_otel_providers`` helpers. No hand-rolled
  exporter wiring. Anything ADK changes upstream we get for free.
- ``OTEL_SERVICE_NAME`` defaults to ``buddy-live-adk`` so Cloud Trace
  groups spans correctly. Override with the standard OTel env var.
- Resource detection (Cloud Run platform, project_id) happens via the GCP
  Resource Detector.

Concurrent with Sentry

Sentry's classic transaction tracing continues to run on its own pipeline.
This module only sets the global ``TracerProvider`` if no other code has
set one first; if Sentry or some other library already registered a
provider, ADK's setup is a no-op and logs a warning. Initialise this
module before Sentry to give Cloud Trace priority.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

_logger = logging.getLogger(__name__)

_DEFAULT_SERVICE_NAME = "buddy-live-adk"


def _is_enabled() -> bool:
    raw = os.getenv("BUDDY_ENABLE_CLOUD_TRACE", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def setup_cloud_trace() -> Optional[str]:
    """Initialise OpenTelemetry → Cloud Trace if enabled.

    Returns the resolved GCP project id (for logging) on success, or
    ``None`` when telemetry is disabled or unavailable. All failures are
    swallowed and logged — telemetry must never break the service.
    """
    if not _is_enabled():
        _logger.info("cloud trace disabled (BUDDY_ENABLE_CLOUD_TRACE unset)")
        return None

    # Make sure OTEL_SERVICE_NAME is set BEFORE the ADK helper calls the
    # resource detector; the detector reads env vars to build resource
    # attributes.
    os.environ.setdefault("OTEL_SERVICE_NAME", _DEFAULT_SERVICE_NAME)

    try:
        import google.auth  # type: ignore[import-untyped]
        from google.adk.telemetry.google_cloud import (
            get_gcp_exporters,
            get_gcp_resource,
        )
        from google.adk.telemetry.setup import maybe_set_otel_providers

        credentials, project_id = google.auth.default()
        if not project_id:
            _logger.warning(
                "cloud trace: no GCP project_id resolved; skipping setup"
            )
            return None

        hooks = get_gcp_exporters(
            enable_cloud_tracing=True,
            google_auth=(credentials, project_id),
        )
        if not hooks.span_processors:
            _logger.warning(
                "cloud trace: get_gcp_exporters returned no span processors; "
                "skipping setup"
            )
            return None

        resource = get_gcp_resource(project_id=project_id)
        maybe_set_otel_providers([hooks], otel_resource=resource)
        _logger.info(
            "cloud trace enabled project=%s service=%s",
            project_id,
            os.environ.get("OTEL_SERVICE_NAME"),
        )
        return project_id
    except Exception:
        _logger.exception("cloud trace setup failed; continuing without it")
        return None


__all__ = ["setup_cloud_trace"]
