#!/usr/bin/env python3
"""Run ADK GEPA optimize with wall-clock timeout and live logging.

Safeguards vs the prior 24h hang:
  - session-level hallucinations scoring (not per-turn)
  - GEPA reflection thinking_budget=0
  - wall-clock timeout
  - null-score patch for reflection trace extraction (ADK 2.0.0 bug)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = ROOT / "evals"
AGENT_MODULE = EVAL_DIR / "agent_module"


class _Tee:
    """Write to a log file and stdout."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._file = path.open("w", encoding="utf-8")

    def write(self, data: str) -> None:
        self._file.write(data)
        self._file.flush()
        sys.stdout.write(data)
        sys.stdout.flush()

    def close(self) -> None:
        self._file.close()


def _load_dotenv() -> None:
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def _tail(path: Path, lines: int = 40) -> None:
    if not path.is_file():
        return
    content = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if not content:
        return
    print("\n--- last log lines ---")
    for row in content[-lines:]:
        print(row)


def _run_gepa(
    sampler_config_path: Path,
    optimizer_config_path: Path,
    log_path: Path,
) -> int:
    from google.adk.cli.cli_eval import get_root_agent
    from google.adk.evaluation.local_eval_sets_manager import LocalEvalSetsManager
    from google.adk.optimization.gepa_root_agent_prompt_optimizer import (
        GEPARootAgentPromptOptimizer,
        GEPARootAgentPromptOptimizerConfig,
    )
    from google.adk.optimization.local_eval_sampler import (
        LocalEvalSampler,
        LocalEvalSamplerConfig,
    )

    from evals.adk_patches import apply_local_eval_sampler_null_score_fix

    apply_local_eval_sampler_null_score_fix()

    sampler_config = LocalEvalSamplerConfig.model_validate_json(
        sampler_config_path.read_text(encoding="utf-8")
    )
    optimizer_config = GEPARootAgentPromptOptimizerConfig.model_validate_json(
        optimizer_config_path.read_text(encoding="utf-8")
    )

    root_agent = get_root_agent(str(AGENT_MODULE))
    app_name = AGENT_MODULE.name
    if app_name != sampler_config.app_name:
        raise ValueError(
            f"app name mismatch: module={app_name} config={sampler_config.app_name}"
        )

    eval_sets_manager = LocalEvalSetsManager(agents_dir=str(EVAL_DIR))
    sampler = LocalEvalSampler(sampler_config, eval_sets_manager)
    optimizer = GEPARootAgentPromptOptimizer(optimizer_config)

    tee = _Tee(log_path)
    class _StreamHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            tee.write(self.format(record) + "\n")

    handler = _StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logging.getLogger("google_adk").addHandler(handler)
    logging.getLogger("google.adk").addHandler(handler)

    try:
        optimization_result = asyncio.run(optimizer.optimize(root_agent, sampler))
    finally:
        tee.close()

    best_idx = optimization_result.gepa_result["best_idx"]
    best_instruction = (
        optimization_result.optimized_agents[best_idx].optimized_agent.instruction
    )

    summary_path = log_path.with_suffix(".best_prompt.txt")
    summary_path.write_text(best_instruction, encoding="utf-8")

    print("=" * 80)
    print("Optimized root agent instructions:")
    print("-" * 80)
    print(best_instruction)
    print("=" * 80)
    print("Detailed GEPA optimization metrics:")
    print("-" * 80)
    print(json.dumps(optimization_result.gepa_result, indent=2))
    print(f"\nBest prompt saved to {summary_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run GEPA optimize with safeguards")
    parser.add_argument(
        "--timeout-minutes",
        type=int,
        default=int(os.environ.get("BUDDY_OPTIMIZE_TIMEOUT_MIN", "60")),
    )
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()

    _load_dotenv()
    os.environ.setdefault("PYTHONPATH", str(ROOT))
    os.environ["BUDDY_EVAL_FAILURES"] = "1"

    if not os.environ.get("GOOGLE_API_KEY") and not os.environ.get("GEMINI_API_KEY"):
        print("ERROR: set GOOGLE_API_KEY in services/buddy-live-adk/.env", file=sys.stderr)
        return 1

    sampler_config = EVAL_DIR / (
        "optimize_sampler_config_smoke.json" if args.smoke else "optimize_sampler_config.json"
    )
    optimizer_config = EVAL_DIR / (
        "optimize_config_smoke.json" if args.smoke else "optimize_config.json"
    )

    log_dir = EVAL_DIR / "optimize_runs"
    log_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_path = log_dir / f"run_{ts}.log"

    mode = "smoke" if args.smoke else "full"
    print(f"GEPA optimize ({mode}) — timeout {args.timeout_minutes}m")
    print(f"Logging to {log_path}")

    log_path.write_text(
        f"mode: {mode}\nstarted: {datetime.now(timezone.utc).isoformat()}\n\n",
        encoding="utf-8",
    )

    try:
        import signal

        def _timeout_handler(signum, frame):  # noqa: ARG001
            raise TimeoutError(f"exceeded {args.timeout_minutes} minute timeout")

        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(args.timeout_minutes * 60)
        try:
            exit_code = _run_gepa(sampler_config, optimizer_config, log_path)
        finally:
            signal.alarm(0)
    except TimeoutError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        _tail(log_path)
        return 124
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        _tail(log_path)
        return 1

    log_path.write_text(
        log_path.read_text(encoding="utf-8")
        + f"\nfinished: {datetime.now(timezone.utc).isoformat()}\nexit_code: {exit_code}\n",
        encoding="utf-8",
    )
    print(f"Exit code: {exit_code}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
