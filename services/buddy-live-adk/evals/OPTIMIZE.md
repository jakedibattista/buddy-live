# Agent Optimizer (GEPA) — Phase 6

Uses ADK's `adk optimize` command (GEPA root-agent prompt optimizer) to
refine `COACH_SETH_LIVE_PROMPT` against the same hermetic eval harness as
Phase 1. Training focuses on the edge-case eval cases (framing struggle,
analysis timeout); validation holds the happy-path scenarios.

## Prerequisites

```bash
cd services/buddy-live-adk
make install-dev   # includes pandas (required by ADK optimize)
export GOOGLE_API_KEY=...   # or GEMINI_API_KEY
```

## Run optimization

```bash
make optimize
```

This runs:

```bash
adk optimize evals/agent_module \
  --sampler_config_file_path evals/optimize_sampler_config.json \
  --optimizer_config_file_path evals/optimize_config.json \
  --print_detailed_results
```

Outputs land under `evals/optimize_runs/` (gitignored). The CLI prints the
best candidate instruction at the end.

## Apply the result

1. Copy the optimized instruction from the CLI output or `optimize_runs/`.
2. Paste into `app/prompts.py` as `COACH_SETH_LIVE_PROMPT` (review diff carefully).
3. Re-run baseline evals: `make eval` and `make eval-failures`.
4. Compare `hallucinations_v1` / `safety_v1` scores before vs after for the
   demo narrative in `docs/TRACK2-PLAN.md`.

## Config knobs

| File | Purpose |
| --- | --- |
| `optimize_sampler_config.json` | Which eval cases train vs validate |
| `optimize_config.json` | GEPA budget (`max_metric_calls`, reflection batch) |

Raise `max_metric_calls` in `optimize_config.json` for deeper search (more
Gemini spend). Default `12` is a pragmatic hackathon budget.

## Train / validation split

| Split | Eval case IDs | Scenarios |
| --- | --- | --- |
| Train | `9840778e`, `b12a9a4d` | framing struggle, analysis timeout |
| Validation | `f8dd685a`, `285f6d24` | happy path, IQ handoff |

After editing `conversation_scenarios.json`, refresh the eval set:

```bash
# Add new cases only (does not remove old ones)
.venv/bin/adk eval_set add_eval_case evals/agent_module coaching_scenarios \
  --scenarios_file evals/conversation_scenarios.json \
  --session_input_file evals/session_input.json
```
