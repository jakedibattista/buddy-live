"""Monkey-patches for ADK eval/optimize gaps in google-adk 2.0.0."""
from __future__ import annotations

import os
from typing import Any


def apply_vertex_safety_adc_fix() -> None:
    """Route safety_v1's Vertex Gen AI Eval client through ADC, not the API key.

    ADK's _VertexAiEvalFacade prefers GOOGLE_API_KEY when present and builds
    ``vertexai.Client(api_key=...)`` — which 401s because a plain Gemini API
    key isn't valid for the Vertex Gen AI Eval service. The agent and user
    simulator still need GOOGLE_API_KEY for their own Gemini calls, so we
    can't just remove it from .env. Instead, hide the key only while the
    facade constructs its client so it falls back to
    GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION + Application Default
    Credentials.

    Opt-in via BUDDY_SAFETY_VERTEX_ADC=1 (requires `gcloud auth
    application-default login`).
    """
    if os.environ.get("BUDDY_SAFETY_VERTEX_ADC") != "1":
        return

    from google.adk.evaluation import vertex_ai_eval_facade as facade_mod

    cls = facade_mod._VertexAiEvalFacade
    if getattr(cls, "_buddy_adc_patched", False):
        return

    original_init = cls.__init__

    def _init(self, *args: Any, **kwargs: Any) -> None:
        api_key = os.environ.pop("GOOGLE_API_KEY", None)
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "puck-buddy")
        os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
        try:
            original_init(self, *args, **kwargs)
        finally:
            if api_key is not None:
                os.environ["GOOGLE_API_KEY"] = api_key

    cls.__init__ = _init  # type: ignore[method-assign]
    cls._buddy_adc_patched = True


def apply_local_eval_sampler_null_score_fix() -> None:
    """Prevent GEPA reflection crash when a criterion returns score=None.

    ADK's LocalEvalSampler._extract_eval_data does round(score, 2) without a
    null guard. During GEPA reflection (capture_traces=True), per-invocation
    hallucinations_v1 can be NOT_EVALUATED with score=None and the optimizer
    dies mid-run even though aggregate evals passed.
    """
    from google.adk.optimization import local_eval_sampler as les
    from google.adk.optimization.local_eval_sampler import extract_single_invocation_info

    if getattr(les.LocalEvalSampler, "_buddy_null_score_patched", False):
        return

    def _extract_eval_data(
        self,
        eval_set_id: str,
        eval_results: list[Any],
    ) -> dict[str, dict[str, Any]]:
        eval_data: dict[str, dict[str, Any]] = {}
        for eval_result in eval_results:
            eval_result_dict: dict[str, Any] = {}
            eval_case = self._eval_sets_manager.get_eval_case(
                app_name=self._config.app_name,
                eval_set_id=eval_set_id,
                eval_case_id=eval_result.eval_id,
            )
            if eval_case and eval_case.conversation_scenario:
                eval_result_dict["conversation_scenario"] = (
                    eval_case.conversation_scenario
                )

            per_invocation_results = []
            for per_invocation_result in eval_result.eval_metric_result_per_invocation:
                eval_metric_results = []
                for eval_metric_result in per_invocation_result.eval_metric_results:
                    raw_score = eval_metric_result.score
                    eval_metric_results.append({
                        "metric_name": eval_metric_result.metric_name,
                        "score": (
                            round(raw_score, 2) if raw_score is not None else None
                        ),
                        "eval_status": eval_metric_result.eval_status.name,
                    })
                per_invocation_result_dict: dict[str, Any] = {
                    "actual_invocation": extract_single_invocation_info(
                        per_invocation_result.actual_invocation
                    ),
                    "eval_metric_results": eval_metric_results,
                }
                if per_invocation_result.expected_invocation:
                    per_invocation_result_dict["expected_invocation"] = (
                        extract_single_invocation_info(
                            per_invocation_result.expected_invocation
                        )
                    )
                per_invocation_results.append(per_invocation_result_dict)
            eval_result_dict["invocations"] = per_invocation_results
            eval_data[eval_result.eval_id] = eval_result_dict

        return eval_data

    les.LocalEvalSampler._extract_eval_data = _extract_eval_data  # type: ignore[method-assign]
    les.LocalEvalSampler._buddy_null_score_patched = True
