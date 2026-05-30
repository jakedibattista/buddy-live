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
make optimize          # full GEPA run (~20–40 min with safeguards)
make optimize-smoke    # quick harness check (~5–10 min, max_metric_calls=2)
```

The wrapper (`evals/run_optimize.py`) sets `BUDDY_EVAL_FAILURES=1`, disables
GEPA thinking budget, caps wall-clock time (default 60 min), and streams logs
to `evals/optimize_runs/run_<timestamp>.log`.

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
4. Compare `hallucinations_v1` scores before vs after; run full `make eval`
   separately for `safety_v1` (see note below).

## Optimize uses `hallucinations_v1` only

GEPA's sampler crashes when any criterion returns `score: null` (ADK bug in
`local_eval_sampler._extract_eval_data`). The **analysis timeout** train case
(`b12a9a4d`) can leave `safety_v1` unevaluated (`Response is required but
missing`), so `optimize_sampler_config.json` omits `safety_v1`. Baseline evals
(`make eval`) still run both criteria.

## Config knobs

| File | Purpose |
| --- | --- |
| `optimize_sampler_config.json` | Which eval cases train vs validate |
| `optimize_config.json` | GEPA budget (`max_metric_calls`, reflection batch) |

Raise `max_metric_calls` in `optimize_config.json` for deeper search (more
Gemini spend). Default `8` is a pragmatic hackathon budget (was `12`; lowered
after the 24h hang post-mortem).

## Why the prior run hung (~24h)

Three compounding issues:

1. **Per-turn hallucinations scoring** — `evaluate_intermediate_nl_responses:
   true` ran the LLM judge on every user/agent turn (~24× per scenario). Optimize
   config now sets this to `false` (session-level score only).
2. **GEPA reflection thinking budget** — ADK defaults to `gemini-2.5-flash`
   with `thinking_budget=10240` for reflection even when `optimizer_model` is
   `gemini-flash-latest`. `optimize_config.json` now sets `thinking_budget: 0`.
3. **No wall-clock cap** — `future.result()` inside GEPA blocks forever if an
   eval stalls. `run_optimize.py` wraps the CLI with a timeout (default 60 min).

Also: train cases need `BUDDY_EVAL_FAILURES=1` so framing/timeout injections
actually fire — the wrapper sets this automatically.

## Smoke test before a full run

```bash
make optimize-smoke
```

Uses one train case, `max_metric_calls=2`, 20-minute timeout. If smoke passes,
run `make optimize` for the full loop.

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
