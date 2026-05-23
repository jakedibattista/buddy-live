"""Firebase Admin SDK singleton for the ADK service.

Lazily initializes so unit tests / local dev without credentials can still import the
module. In Cloud Run the default service account is used automatically.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

_lock = threading.Lock()
_app: firebase_admin.App | None = None
_client: Any | None = None
_logger = logging.getLogger(__name__)


def _init() -> None:
    global _app, _client
    if _app is not None:
        return
    with _lock:
        if _app is not None:
            return
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        try:
            if cred_path and os.path.exists(cred_path):
                _app = firebase_admin.initialize_app(credentials.Certificate(cred_path))
            else:
                _app = firebase_admin.initialize_app()
            _client = firestore.client()
            _logger.info("firebase_admin initialized")
        except Exception as exc:
            _logger.warning("firebase_admin init failed (continuing without): %s", exc)
            _app = None
            _client = None


def db() -> Any | None:
    """Return the Firestore client, or None if Firebase isn't configured.

    Callers must handle None gracefully (e.g., for local dev without credentials).
    """
    _init()
    return _client


def session_ref(session_id: str) -> Any | None:
    client = db()
    if client is None:
        return None
    return client.collection("live_sessions").document(session_id)


def rep_ref(session_id: str, rep_id: str) -> Any | None:
    parent = session_ref(session_id)
    if parent is None:
        return None
    return parent.collection("reps").document(rep_id)
