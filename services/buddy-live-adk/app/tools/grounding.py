"""Vertex AI Search grounding for Coach Buddy's drill knowledge.

Phase 3 of the Track 2 plan (see ``docs/TRACK2-PLAN.md``). Backs a single
function tool, :func:`lookup_drill_knowledge`, that the agent can call when
it needs to retrieve curated drill / metric / hockey-IQ knowledge instead
of relying on baked-in prompt content or the static YouTube-search dict in
:mod:`app.tools.coaching`.

Why a function tool (and not the built-in :class:`VertexAiSearchTool`):
the built-in flavour wires the data store directly into Gemini's request
config; we already ship 15 function tools across these agents and prefer to
keep retrieval observable and mockable from Phase 1's eval harness, which
intercepts every tool call. As a function tool, ``lookup_drill_knowledge``
appears as a normal span in Cloud Trace alongside ``analyze_rep`` etc.,
and the Environment Simulation can stub it with deterministic results.

Configuration (set on the Cloud Run service):

- ``BUDDY_VERTEX_SEARCH_DATA_STORE_ID`` -- the full resource path,
  e.g. ``projects/puck-buddy/locations/global/collections/default_collection/dataStores/buddy-live-drills``.
  When unset, the tool is a no-op (returns ``available: False``) so local
  development and the demo never hard-fail on missing infrastructure.
- ``BUDDY_VERTEX_SEARCH_SERVING_CONFIG`` -- optional override for the
  serving config id, defaults to ``default_search``.

Runtime SA needs ``roles/discoveryengine.viewer`` on the project hosting
the data store.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any

_logger = logging.getLogger(__name__)

_DEFAULT_SERVING_CONFIG = "default_search"
_PAGE_SIZE = 3
_MAX_SNIPPET_CHARS = 600

_lock = threading.Lock()
_client: Any | None = None
_client_init_attempted = False


def _data_store_path() -> str | None:
    """Full Vertex AI Search data store resource path, or ``None`` when unset."""
    return os.getenv("BUDDY_VERTEX_SEARCH_DATA_STORE_ID")


def _serving_config_path() -> str | None:
    """Serving config path derived from the data store path.

    Vertex AI Search queries hit ``{data_store}/servingConfigs/{serving_config_id}``;
    we compose the serving config from the data store env var plus the
    optional serving config id override (default ``default_search``).
    """
    data_store = _data_store_path()
    if not data_store:
        return None
    serving_config_id = os.getenv("BUDDY_VERTEX_SEARCH_SERVING_CONFIG", _DEFAULT_SERVING_CONFIG)
    return f"{data_store}/servingConfigs/{serving_config_id}"


def _get_client() -> Any | None:
    """Lazy-initialise the Discovery Engine SearchServiceClient.

    Initialisation is gated on the data store env var being set AND the
    ``google-cloud-discoveryengine`` package being importable. Both gates
    are required because the package is fairly heavyweight and we don't
    want to pay the import cost during eval / unit-test runs that never
    touch grounding.
    """
    global _client, _client_init_attempted
    if _client is not None or _client_init_attempted:
        return _client
    with _lock:
        if _client is not None or _client_init_attempted:
            return _client
        _client_init_attempted = True
        if not _data_store_path():
            _logger.info(
                "lookup_drill_knowledge disabled: BUDDY_VERTEX_SEARCH_DATA_STORE_ID unset"
            )
            return None
        try:
            from google.cloud import discoveryengine_v1 as discoveryengine

            _client = discoveryengine.SearchServiceClient()
            _logger.info("Vertex AI Search client initialised")
        except Exception as exc:
            _logger.warning(
                "Vertex AI Search client init failed (continuing without grounding): %s",
                exc,
            )
            _client = None
        return _client


def _no_grounding(query: str, reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "query": query,
        "results": [],
        "summary": "",
        "reason": reason,
    }


def _truncate(text: str, limit: int = _MAX_SNIPPET_CHARS) -> str:
    if not text:
        return ""
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _extract_snippet(doc: Any) -> str:
    """Pull a usable text snippet out of a SearchResponse.Result.

    Discovery Engine returns derived fields in ``document.derived_struct_data``
    (snippets, link, title) as a ``Struct`` proto. We probe the common keys
    Vertex AI Search populates and fall back to the indexed content fields
    so the LLM always has *something* to ground on.
    """
    derived = getattr(doc, "derived_struct_data", None)
    if derived:
        try:
            data = dict(derived)
        except Exception:
            data = {}
        snippets = data.get("snippets") or []
        for snip in snippets:
            text = (snip.get("snippet") or "").strip() if isinstance(snip, dict) else ""
            if text:
                return _truncate(text)
        extractive = data.get("extractive_answers") or data.get("extractive_segments") or []
        for item in extractive:
            text = (item.get("content") or "").strip() if isinstance(item, dict) else ""
            if text:
                return _truncate(text)
    struct_data = getattr(doc, "struct_data", None)
    if struct_data:
        try:
            data = dict(struct_data)
        except Exception:
            data = {}
        for key in ("content", "text", "body"):
            text = (data.get(key) or "").strip()
            if text:
                return _truncate(text)
    return ""


def lookup_drill_knowledge(query: str) -> dict[str, Any]:
    """Search the curated drill knowledge corpus for grounded coaching content.

    Use this when:
      - The player asks "what does my front knee bend score mean?" or any
        scoring-metric question and you want a definitive answer.
      - You're recommending homework drills in the final recap and want
        a curated drill (better than the legacy YouTube-search fallback).
      - The IQ Coach needs a kid-level rules explanation (offside, icing).

    The corpus lives in version control at ``services/buddy-live-adk/knowledge/``
    and is ingested into a Vertex AI Search data store named
    ``buddy-live-drills``.

    Args:
        query: Natural-language search query, e.g. "wristshot weight
            transfer drill" or "what is offside in hockey".

    Returns:
        Dict with:
          - ``available`` (bool): ``True`` if the data store returned results,
            ``False`` if grounding is disabled / errored / empty.
          - ``query`` (str): the query echoed back.
          - ``results`` (list): up to 3 items, each ``{title, snippet, uri}``.
          - ``summary`` (str): short summary if the data store has summary
            spec configured, else empty.
          - ``reason`` (str, optional): error / disabled reason when
            ``available`` is ``False``.
    """
    query = (query or "").strip()
    if not query:
        return _no_grounding(query, "empty query")

    client = _get_client()
    if client is None:
        return _no_grounding(query, "grounding disabled or client init failed")

    serving_config = _serving_config_path()
    if not serving_config:
        return _no_grounding(query, "no serving config available")

    try:
        from google.cloud import discoveryengine_v1 as discoveryengine

        request = discoveryengine.SearchRequest(
            serving_config=serving_config,
            query=query,
            page_size=_PAGE_SIZE,
            query_expansion_spec=discoveryengine.SearchRequest.QueryExpansionSpec(
                condition=discoveryengine.SearchRequest.QueryExpansionSpec.Condition.AUTO,
            ),
            spell_correction_spec=discoveryengine.SearchRequest.SpellCorrectionSpec(
                mode=discoveryengine.SearchRequest.SpellCorrectionSpec.Mode.AUTO,
            ),
            content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
                snippet_spec=discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
                    return_snippet=True,
                ),
                summary_spec=discoveryengine.SearchRequest.ContentSearchSpec.SummarySpec(
                    summary_result_count=_PAGE_SIZE,
                    include_citations=True,
                    ignore_adversarial_query=True,
                ),
            ),
        )
        response = client.search(request=request)
    except Exception as exc:
        _logger.exception("lookup_drill_knowledge search failed")
        return _no_grounding(query, f"search error: {type(exc).__name__}")

    results: list[dict[str, Any]] = []
    for hit in response.results:
        doc = hit.document
        derived: dict[str, Any] = {}
        if getattr(doc, "derived_struct_data", None):
            try:
                derived = dict(doc.derived_struct_data)
            except Exception:
                derived = {}
        title = derived.get("title") or getattr(doc, "name", "") or ""
        uri = derived.get("link") or derived.get("uri") or ""
        snippet = _extract_snippet(doc)
        results.append(
            {
                "title": title.split("/")[-1] if title else "",
                "snippet": snippet,
                "uri": uri,
            }
        )

    summary_text = ""
    summary = getattr(response, "summary", None)
    if summary is not None:
        summary_text = _truncate(getattr(summary, "summary_text", "") or "")

    if not results and not summary_text:
        return _no_grounding(query, "no matching documents")

    _logger.info(
        "lookup_drill_knowledge query=%r results=%d has_summary=%s",
        query,
        len(results),
        bool(summary_text),
    )
    return {
        "available": True,
        "query": query,
        "results": results,
        "summary": summary_text,
    }


__all__ = ["lookup_drill_knowledge"]
