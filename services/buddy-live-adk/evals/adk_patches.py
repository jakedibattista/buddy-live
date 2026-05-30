"""Monkey-patches for ADK eval/optimize gaps in google-adk 2.0.0."""
from __future__ import annotations

from typing import Any


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
