#!/usr/bin/env python3
"""Run ADK GEPA optimize with wall-clock timeout and live logging.

The prior 24h hang came from compounding slow eval loops inside GEPA:
  - per-turn hallucinations_v1 scoring (24 LLM judge calls per scenario)
  - GEPA reflection using gemini-2.5-flash + thinking_budget=10240 by default
  - no wall-clock cap on the outer process

This wrapper enforces timeout, unbuffered logs, and BUDDY_EVAL_FAILURES=1 so
train cases actually inject framing/timeout edge cases.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = ROOT / "evals"
VENV_ADK = ROOT / ".venv" / "bin" / "adk"


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Run GEPA optimize with safeguards")
    parser.add_argument(
        "--timeout-minutes",
        type=int,
        default=int(os.environ.get("BUDDY_OPTIMIZE_TIMEOUT_MIN", "60")),
        help="Wall-clock cap (default 60, override with BUDDY_OPTIMIZE_TIMEOUT_MIN)",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Fast validation: 1 train case, max_metric_calls=2",
    )
    args = parser.parse_args()

    _load_dotenv()

    if not os.environ.get("GOOGLE_API_KEY") and not os.environ.get("GEMINI_API_KEY"):
        print("ERROR: set GOOGLE_API_KEY (or GEMINI_API_KEY) in services/buddy-live-adk/.env", file=sys.stderr)
        return 1

    if not VENV_ADK.is_file():
        print("ERROR: run `make install-dev` first (.venv missing adk CLI)", file=sys.stderr)
        return 1

    sampler_config = (
        "optimize_sampler_config_smoke.json" if args.smoke else "optimize_sampler_config.json"
    )
    optimizer_config = (
        "optimize_config_smoke.json" if args.smoke else "optimize_config.json"
    )

    log_dir = EVAL_DIR / "optimize_runs"
    log_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_path = log_dir / f"run_{ts}.log"

    cmd = [
        str(VENV_ADK),
        "optimize",
        str(EVAL_DIR / "agent_module"),
        "--sampler_config_file_path",
        str(EVAL_DIR / sampler_config),
        "--optimizer_config_file_path",
        str(EVAL_DIR / optimizer_config),
        "--print_detailed_results",
    ]

    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    env["PYTHONUNBUFFERED"] = "1"
    env["BUDDY_EVAL_FAILURES"] = "1"

    mode = "smoke" if args.smoke else "full"
    print(f"GEPA optimize ({mode}) — timeout {args.timeout_minutes}m")
    print(f"Logging to {log_path}")

    header = (
        f"command: {' '.join(cmd)}\n"
        f"mode: {mode}\n"
        f"started: {datetime.now(timezone.utc).isoformat()}\n\n"
    )

    with log_path.open("w", encoding="utf-8") as logf:
        logf.write(header)
        logf.flush()
        try:
            proc = subprocess.run(
                cmd,
                cwd=ROOT,
                env=env,
                stdout=logf,
                stderr=subprocess.STDOUT,
                timeout=args.timeout_minutes * 60,
                check=False,
            )
        except subprocess.TimeoutExpired:
            logf.write(f"\n\nTIMEOUT after {args.timeout_minutes} minutes\n")
            print(f"ERROR: exceeded {args.timeout_minutes} minute timeout", file=sys.stderr)
            _tail(log_path)
            return 124

    log_path.write_text(
        log_path.read_text(encoding="utf-8")
        + f"\nfinished: {datetime.now(timezone.utc).isoformat()}\n"
        + f"exit_code: {proc.returncode}\n",
        encoding="utf-8",
    )

    print(f"Exit code: {proc.returncode}")
    _tail(log_path)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
