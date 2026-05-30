# Track 2: Optimize — Gap Analysis & Implementation Plan

**Plain-language overview (phases 1–4 & 6, IQ evals, memory limits, corpus
sources):** [`TRACK2-LAYMAN.md`](TRACK2-LAYMAN.md). **Backlog / do later:**
[`TRACK2-TODOS.md`](TRACK2-TODOS.md).

Reference: Google for Startups AI Agents Challenge ([resource guide PDF](https://services.google.com/fh/files/misc/ai_agents_challenge_designed_guide.pdf)).

> **Track 2 (Optimize):** "Take an agent that works in a sandbox and apply rigorous engineering discipline to make it handle real-world edge cases."

Buddy Live is a textbook Track 2 candidate: a fully functional voice-first ADK
agent on Cloud Run that already runs end-to-end coaching sessions. What's
missing is the **optimization workflow** Track 2 asks judges to see — simulation,
observability, evaluation, optimizer.

---

## Mandatory technologies (all three tracks)

| Requirement | Status | Evidence |
| --- | --- | --- |
| **Intelligence:** Gemini API | Pass | `gemini-flash-latest` via `google-genai` |
| **Orchestration:** ADK (or supported OSS framework) | Pass | `google-adk==2.0.0`, root `buddy_live_coach` + `vision_coach`, `drill_coach`, `iq_coach` sub-agents |
| **Infrastructure:** Cloud Run or GKE | Pass | `infra/cloudbuild.yaml`, deployed to `puck-buddy` project |

---

## Audit — current state (as of this plan)

### Already in place since the initial gap analysis

| Originally-flagged gap | Status today |
| --- | --- |
| "Single agent only" | **Closed** — root + `vision_coach`, `drill_coach`, `iq_coach` via ADK 2.0 `sub_agents=[]` and `transfer_to_agent` |
| "No ADK callbacks" | **Closed** — `phase_guard` BeforeToolCallback on both agents (Firestore-backed phase gates) |
| New tool `mark_iq_answer` | Added |

### Track 2 gaps still open

| Gap | Why it matters for Track 2 | Evidence |
| --- | --- | --- |
| **No Agent Simulation / User Simulation** | Core of Track 2. "Use Agent Simulation to generate synthetic user interactions and test the agent against rare, multi-variable events." | No `evalsets/`, no `ConversationScenario`, no `eval_config.json` |
| **No Environment Simulation** | Tools call real Firestore / modelforpuckbuddy — evals can't run hermetically and can't inject error edge cases | All tools (`peek_camera`, `analyze_rep`, …) talk to live infra |
| **No observability beyond Sentry errors** | "Use Agent Observability to visually trace complex reasoning and debug stalled logic." Sentry catches exceptions but not reasoning traces | `main.py` initialises Sentry only; no OpenTelemetry / Cloud Trace |
| **No Agent Optimizer** | "Use Agent Optimizer to programmatically refine system instructions." | Prompt is hand-tuned in `prompts.py` |
| ~~No grounding / RAG~~ | **Closed in Phase 3.** Curated drill corpus at `services/buddy-live-adk/knowledge/`, served via `lookup_drill_knowledge` (Vertex AI Search). `recommend_drill` now grounds first, falls back to the dict. | |
| **`InMemorySessionService`** | Sessions die on container restart; managed Memory Bank shows production discipline | `app/agent.py:108` |
| **Cloud Run (not Agent Runtime)** | Resource guide encourages "Deploy to Agent Runtime" for managed sessions + auto-tracing | `infra/cloudbuild.yaml` is plain Cloud Run; no `adk deploy` |

---

## Implementation plan — six phases

| # | Phase | Effort | Track 2 impact | Status |
| --- | --- | --- | --- | --- |
| 1 | **ADK Eval + User Simulation + Environment Simulation** | 2–3 days | **Critical** — the heart of Track 2 | **Done** |
| 2 | **OpenTelemetry tracing → Cloud Trace** | 1 day | **High** — needed for the "show your reasoning" demo | **Done** |
| 3 | **Vertex AI Search grounding for drill knowledge** | 2 days | **High** — explicit ask in resource guide | **Done** |
| 4 | **Persistent sessions + Memory Bank** | 0.5 day | Medium — production-readiness signal | **Done** |
| 5 | **Multi-agent decomposition (vision / drill / IQ / memory)** | 2 days | Medium — judges reward orchestration | **Done (core)** — `vision_coach` + `drill_coach` + `iq_coach`; memory agent skipped |
| 6 | **Agent Optimizer loop** | 1 day | Medium — closes the optimization story; depends on Phase 1 | **Done** |

---

## Phase 1 — Eval + Simulation (this PR)

### Goals

1. Hermetic, repeatable evals that exercise the agent without hitting Firestore,
   ElevenLabs, or modelforpuckbuddy.
2. Synthetic users that drive realistic multi-turn coaching sessions.
3. Scored metrics (`hallucinations_v1`, `safety_v1`) so we can demonstrate
   measurable before/after improvements.
4. Targeted edge-case injections that reproduce the failures we want Track 2 to
   show us solving (framing loop, analysis timeout, etc.).

### Architecture

```
services/buddy-live-adk/evals/
├── README.md                       # how to run + what each file does
├── agent_module/
│   ├── __init__.py                 # exposes root_agent for `adk eval`
│   └── agent.py                    # rebuilds prod agent + sub-agent with env sim
├── environment_simulation.py       # mock + injection configs for all 12 tools
├── conversation_scenarios.json     # synthetic user goals
├── session_input.json              # initial ADK session state
└── eval_config.json                # criteria + user simulator config
```

**Why a separate eval agent module?**
ADK's `adk eval` CLI takes an agent-module path and imports `root_agent` from
it. Production `app/` does not currently expose a module-level `root_agent`
(it uses a `get_agent()` factory called by the FastAPI bridge). Rather than
mutate production wiring, the eval module imports prompts + tools from `app.`
and constructs a parallel `root_agent` with:

- Environment Simulation as `before_tool_callback` (replacing the
  Firestore-backed `phase_guard`, which can't run hermetically).
- Identical instruction, model, and `sub_agents=[iq_coach]` structure so the
  evaluation reflects production behaviour as closely as possible.

The production `phase_guard` is correctness-tested separately via unit tests.

### Tool mocking strategy

| Tool | Mock strategy | Edge cases injected |
| --- | --- | --- |
| `peek_camera` | Fixed success response (full body, facing, stick) | `framing_struggle` scenario injects 3× failing responses |
| `peek_warmup` | Fixed "good motion" response | — |
| `start_warmup_timer` | Fixed `{"status": "started"}` | — |
| `set_focus_drill` | Echo the drill choice | — |
| `start_rep_capture` | Returns deterministic `rep_id` | — |
| `stop_rep_capture` | Fixed `{"status": "stop_requested"}` | — |
| `analyze_rep` | Fixed `{"status": "queued", "job_id": "job-eval"}` | — |
| `get_rep_result` | Fixed `ready` scorecard (8/10 weakest = weight transfer) | `analysis_timeout` scenario injects 3× `processing` |
| `recommend_drill` | Returns a stub follow-up drill | — |
| `end_session_recap` | Returns stub recap text | — |
| `show_iq_visual` | Echoes scenario_id | — |
| `mark_iq_answer` | Returns `{"status": "recorded"}` | — |

This uses ADK 2.0's `EnvironmentSimulationFactory.create_callback(config)`
( `google.adk.tools.environment_simulation` ).

### Scenarios (initial set)

| ID | Persona | Goal | What it tests |
| --- | --- | --- | --- |
| `happy_path_wristshot` | `NOVICE` | Pick wristshot, complete warm-up, do 2 reps, hear a recap | Baseline session flow |
| `no_space_iq_mode` | `NOVICE` | Tell coach you don't have room to shoot; want to learn anyway | Sub-agent transfer to `iq_coach` |
| `confident_player_corrects_coach` | `EXPERT` | Pick slapshot, push back if the coach's instructions feel wrong | Robustness to user corrections |
| `framing_struggle` | `NOVICE` | Keep wanting to start shooting; framing fails repeatedly | Recovery from repeated tool failure (no infinite loop) |
| `analysis_timeout` | `NOVICE` | Shoot a rep, ask "how'd I do?" right away | Graceful waiting behaviour while result pending |

### Metrics

User Simulation only supports two criteria today:

- `hallucinations_v1` — agent claims are grounded in tool outputs.
- `safety_v1` — responses are safe (relevant since users are children).

Default thresholds (`0.5` and `0.8`) per the ADK quickstart. Tune after first
run.

### Running

```bash
cd services/buddy-live-adk
make eval                     # runs adk eval against all scenarios
make eval SCENARIO=happy_path_wristshot  # single scenario
```

Cost note: each scenario runs the agent (`gemini-flash-latest`) **and** a user
simulator (also Flash), plus the two LLM-judged criteria. Budget roughly
$0.05–0.20 per full run depending on conversation length.

---

## Phase 2 — Cloud Trace observability (shipped)

### Goals

1. Cloud Trace shows the full reasoning trace for every coach turn:
   `buddy_live.turn` → `agent_run` → individual `tool.call` and `llm.call`
   spans, all tied together by trace_id.
2. Spans carry the GenAI semantic conventions (`gen_ai.agent.name`,
   `gen_ai.tool.name`, token usage, model, etc.) so judges who know GenAI
   tracing can read them without context.
3. Custom Buddy-Live attributes on the top span (`session_id`, reconnect
   flag, response length, turn outcome) make it trivial to find a specific
   live-session in Cloud Trace.
4. Telemetry never breaks the service: setup failures are caught and
   logged.

### What's shipped

- `services/buddy-live-adk/app/telemetry.py` — wires ADK's first-party
  `telemetry.google_cloud.get_gcp_exporters` +
  `telemetry.setup.maybe_set_otel_providers` helpers. Gated on
  `BUDDY_ENABLE_CLOUD_TRACE`. Resource detection + project_id resolution
  happen automatically (Cloud Run platform attrs included).
- `services/buddy-live-adk/app/main.py` — calls `setup_cloud_trace()`
  before `sentry_sdk.init(...)` so the ADK `TracerProvider` registers
  first; wraps the `runner.run_async` loop inside a top-level
  `buddy_live.turn` span with high-value attributes and `turn_outcome`
  (`ok` / `timeout` / `error`).
- `services/buddy-live-adk/requirements.txt` — adds
  `opentelemetry-exporter-otlp-proto-http==1.41.1` (HTTP/OTLP transport)
  and `opentelemetry-resourcedetector-gcp==1.12.0a0` (Cloud Run resource
  attribution).

### Custom span attributes

| Attribute | When set | Example |
| --- | --- | --- |
| `buddy_live.session_id` | every turn | `live-2026-05-28-abc123` |
| `buddy_live.user_text_len` | every turn | `42` |
| `buddy_live.is_reconnect` | every turn | `true` on voice reconnect |
| `buddy_live.session_existed` | every turn | `true` if ADK session was already alive |
| `buddy_live.response_text_len` | end of turn | `116` |
| `buddy_live.turn_outcome` | end of turn | `ok` / `timeout` / `error` |
| Exception details | error path | via `span.record_exception(exc)` |

### Sentry coexistence

Sentry's classic transaction tracing keeps running on its own pipeline.
Cloud Trace setup runs first so ADK's global `TracerProvider` is in place;
Sentry uses its own and the two backends are independent. Cloud Trace is
where judges look during the demo; Sentry remains for in-the-wild errors.

### Deployment

Two one-time setup steps on the GCP project:

```bash
# 1. Grant the runtime service account permission to write Cloud Trace spans
gcloud projects add-iam-policy-binding puck-buddy \
  --member="serviceAccount:buddy-live-adk@puck-buddy.iam.gserviceaccount.com" \
  --role="roles/cloudtrace.agent"

# 2. Set the env var on the Cloud Run service (and any future revisions)
gcloud run services update buddy-live-adk \
  --region=us-central1 \
  --update-env-vars=BUDDY_ENABLE_CLOUD_TRACE=1
```

After the next deploy (push to `main` -> Cloud Build), every chat turn
shows up in Cloud Trace under service `buddy-live-adk`.

### Viewing traces

1. Cloud Console → Trace Explorer → filter `service.name = buddy-live-adk`
2. Click a `buddy_live.turn` span to see the full hierarchy:
   - root: `buddy_live.turn` with our session attributes
   - children: `invocation` → `agent_run [buddy_live_coach]` → `tool.call
     [peek_camera]` → `llm.call [gemini-flash-latest]` etc.
3. Filter by attribute (e.g. `buddy_live.turn_outcome=timeout`) to find
   stalled turns — exactly the kind of forensic view Track 2 wants.

### Local verification

```bash
cd services/buddy-live-adk
make test                                              # 16 unit tests still pass
.venv/bin/python -c "from app.main import app"         # boot smoke check, env unset -> no-op log
BUDDY_ENABLE_CLOUD_TRACE=1 \
  .venv/bin/python -c "from app.telemetry import setup_cloud_trace; print(setup_cloud_trace())"
# -> prints 'puck-buddy' if ADC is configured; None otherwise (still no crash)
```

End-to-end trace verification requires the Cloud Run deploy and is part of
the demo run.

---

## Phase 3 — Vertex AI Search grounding (shipped)

### Goals

1. Replace the static `_DRILL_RECOMMENDATIONS` dict and its YouTube-search
   URLs with curated, citable drill knowledge retrieved at runtime.
2. Give Coach Buddy a way to ground metric explanations and Hockey-IQ
   rules answers in a source the player could read after the session
   instead of relying on baked-in prompt content.
3. Keep the demo path bulletproof: grounding is opt-in via env var, and
   every grounded code path has a deterministic fallback so an outage
   or unconfigured data store never breaks a live session.

### What's shipped

- `services/buddy-live-adk/knowledge/` — version-controlled markdown
  corpus (10 docs: README, three per-drill cheat sheets, three per-drill
  metric guides, three hockey-IQ topics) that we ingest into the data
  store. Each doc is self-contained because Vertex AI Search chunks
  independently. The `Fix cue:` convention on metric docs lets the
  coach quote spoken cues verbatim.
- `services/buddy-live-adk/app/tools/grounding.py` — `lookup_drill_knowledge`
  function tool wrapping `google.cloud.discoveryengine_v1.SearchServiceClient`.
  Lazy-initialised, gated on `BUDDY_VERTEX_SEARCH_DATA_STORE_ID`, returns
  `{available, query, results, summary}` with snippet + URI per result.
  Function tool (not the built-in `VertexAiSearchTool`) so it appears as
  a regular `tool.call` span in Cloud Trace and can be mocked by the
  Phase 1 Environment Simulation harness.
- `services/buddy-live-adk/app/tools/coaching.py` — `recommend_drill`
  now tries grounded retrieval first, then the legacy hand-curated dict,
  then a generic homework fallback. Return shape adds a `source` field
  (`vertex_ai_search` | `static_dict` | `fallback`) so the recap can show
  which path served the recommendation.
- `services/buddy-live-adk/app/prompts.py` — both coaches learn the new
  tool via short additions to their `TOOLS YOU CAN CALL` sections. The
  rest of the prompt is unchanged so existing behaviour stays intact.
- `services/buddy-live-adk/app/agent.py` + `evals/agent_module/agent.py`
  — `lookup_drill_knowledge` registered on `buddy_live_coach` (11 tools)
  and `iq_coach` (3 tools); mirrored in the eval agent module.
- `services/buddy-live-adk/evals/environment_simulation.py` — both
  `happy_path_config()` and `failure_config()` mock the new tool. The
  failure config also injects a 30%-probability "no matching documents"
  miss so we can eval the fallback-on-empty path.
- `services/buddy-live-adk/tests/test_grounding.py` — 9 hermetic unit
  tests covering: env-unset no-op, empty-query short-circuit, the
  three-tier `recommend_drill` fallback chain, and the `_cue_from_snippet`
  extractor (quoted cue, unquoted line, section-break handling).

### Why a function tool (and not built-in `VertexAiSearchTool`)

The built-in flavour wires the data store straight into Gemini's tool
config; we already ship 12 function tools on this agent and prefer to
keep retrieval observable and mockable. As a function tool,
`lookup_drill_knowledge` shows up as a regular span alongside `analyze_rep`
in Cloud Trace (Phase 2), and the Environment Simulation can stub it
deterministically (Phase 1) — the rest of the toolset already follows
that pattern, so this stays consistent.

### Deployment

Three one-time setup steps on the GCP project (you do these once when
you first turn grounding on):

```bash
# 1. Create the Discovery Engine data store for the drill corpus.
#    Generic / unstructured data so we can ingest markdown directly.
gcloud alpha discovery-engine data-stores create buddy-live-drills \
  --project=puck-buddy \
  --location=global \
  --industry-vertical=GENERIC \
  --solution-types=SOLUTION_TYPE_SEARCH \
  --content-config=CONTENT_REQUIRED

# 2. Upload the corpus and ingest. Bucket name is illustrative -- use any
#    GCS bucket in the same project.
gsutil mb -p puck-buddy -l us gs://puck-buddy-drill-knowledge
gsutil -m cp services/buddy-live-adk/knowledge/*.md \
  gs://puck-buddy-drill-knowledge/
gcloud alpha discovery-engine documents import \
  --data-store=buddy-live-drills --location=global \
  --gcs-source=gs://puck-buddy-drill-knowledge/ \
  --reconciliation-mode=FULL

# 3. Grant the Cloud Run runtime SA read access to the data store, then
#    set the env var on the service.
gcloud projects add-iam-policy-binding puck-buddy \
  --member="serviceAccount:buddy-live-adk@puck-buddy.iam.gserviceaccount.com" \
  --role="roles/discoveryengine.viewer"

gcloud run services update buddy-live-adk \
  --region=us-central1 \
  --update-env-vars=BUDDY_VERTEX_SEARCH_DATA_STORE_ID=projects/puck-buddy/locations/global/collections/default_collection/dataStores/buddy-live-drills
```

To **update** the corpus (no Cloud Run redeploy needed), edit the
markdown, re-upload, and re-import — the agent picks up the new content
on the next turn.

### Verifying it works

Cloud Trace (Phase 2 wiring) is the canonical verification surface — a
session that hits the grounded path shows a `tool.call [lookup_drill_knowledge]`
span as a child of `agent_run [buddy_live_coach]`. If `available=true`
on the tool result, the data store served the answer; if `available=false`,
the coach is on a fallback path and you can decide whether the corpus
needs more content.

Local verification (no GCP creds required):

```bash
cd services/buddy-live-adk
make test                                  # 25 unit tests pass (9 new in test_grounding.py)
.venv/bin/python -c "from app.main import app"   # boots clean, env unset -> no-op log
.venv/bin/python -c "
from app.tools.grounding import lookup_drill_knowledge
print(lookup_drill_knowledge('weight transfer wristshot drill'))
# -> {available: False, reason: 'grounding disabled...'} when env unset
"
```

### Why this is better than what we had

#### What "the current search we do" actually was

Two surfaces before Phase 3:

1. **`recommend_drill(weakest_metric)`** — a hand-coded Python dict in
   `app/tools/coaching.py` mapping 30 metric strings to
   `{title, url, cue}`. The URLs were **YouTube search result pages**
   (`youtube.com/results?search_query=...`), not specific videos.
   Whatever ranked #1 today won. No matching → generic
   "50 wristshots a day" default.
2. **The prompt itself** — `COACH_SETH_LIVE_PROMPT` shipped ~5 KB of
   baked-in coaching knowledge every turn (DRILL CHEAT SHEETS, SCORING
   RUBRIC, HOCKEY IQ samples). Updates required code changes; the
   player had no source citations.

#### Why Vertex AI Search grounding is materially better

| Dimension | Current dict + prompt (before) | Vertex AI Search data store (after) |
| --- | --- | --- |
| **Match quality** | Exact-string lookup. "front knee was a 6" only matched the literal key `front knee bend`. | Semantic embedding search. Matches synonyms, paraphrases, partial concepts. |
| **Content quality** | Points at YouTube *search pages* — whatever ranks today, possibly a 30-min adult breakdown when the player is 11. | Returns **specific docs you curated**, with citations the coach can name out loud. |
| **Update cycle** | New cue / fix / drill = code change + Cloud Build + Cloud Run rev. | Drop a doc into the data store; live without a deploy. |
| **Hallucination control** | LLM invents from training data when a question falls outside the prompt. | Retrieval forces grounded answers; "no result" is explicit and the coach can say "let me find that for next time." |
| **Token cost / latency** | Full DRILL CHEAT SHEETS shipped every turn even for a 3-word answer. | Only retrieved snippets in context when needed. |
| **Track 2 evidence** | Zero. | Exactly what the resource guide asks for ("Strategically employ Grounding using Vertex AI Search… and RAG"). |
| **Eval-able** | `recommend_drill("reverse-triple-axel")` returned the generic fallback silently — no hallucination signal. | Phase 1 evals can ask about a fake drill and verify the coach declines instead of hallucinating. |

---

## Phase 4 — Cross-session player memory (shipped)

### Goals

1. Returning players hear a one-sentence callback to their last session
   (drill, rep count, weakest metric) in the opening.
2. `session_summaries/` (already written by `end_session_recap`) becomes
   queryable by player name — no new analytics pipeline.
3. Hermetic evals keep working; production never hard-fails when Firestore
   is unavailable.

### What's shipped

- `app/tools/player_memory.py` — `remember_player_profile(name, age)` persists
  to the live session doc + ADK state; `load_player_memory(name)` reads the
  most recent matching row from `session_summaries/` (excludes current session).
- `app/tools/coaching.py` — `_write_session_summary` now stores
  `player_name`, `player_age`, `player_name_normalized`, `user_id`.
- `app/prompts.py` — opening flow calls both tools after age is learned;
  speaks `summary_hint` when `has_prior_session` is true.
- Eval harness mocks both tools; first scenario renamed to Tyler so Marcus
  returning scenario does not false-positive in future eval-set refreshes.
- `tests/test_player_memory.py` — 6 hermetic unit tests.

### Why Firestore summaries (not Vertex Memory Bank yet)

Vertex AI Memory Bank (`VertexAiMemoryBankService` + `load_memory`) requires
an Agent Engine id and async `add_session_to_memory` after each session.
Our `session_summaries/` collection already captures the exact fields judges
care about (drill, weakest metric, rep count) with zero new infra. Memory
Bank remains the documented upgrade path for semantic recall over full
transcripts.

### Demo: seed a returning player

After any real session where the player said their name, a summary row exists.
For a scripted demo, write one doc in Firebase console → `session_summaries`.
**Required:** set `user_id` to the Firebase anonymous uid from your browser's
`live_sessions/{sessionId}` doc (same device you will demo on). Name alone is
not enough — memory is scoped per browser.

```json
{
  "session_id": "demo-prior-marcus",
  "created_at": "2026-05-27T18:00:00Z",
  "user_id": "<paste uid from live_sessions.user_id>",
  "player_name": "Marcus",
  "player_name_normalized": "marcus",
  "drill": "wristshot",
  "rep_count": 2,
  "weakest_metric": "weight_transfer"
}
```

Next live session **on that same browser**: Marcus says his name → coach calls
`load_player_memory` → welcome-back with last drill and focus area.

### Optional: Vertex AI Memory Bank

```bash
# After Agent Engine + Memory Bank are provisioned:
# BUDDY_VERTEX_AGENT_ENGINE_ID=projects/.../reasoningEngines/...
# Wire VertexAiMemoryBankService on Runner + ADK load_memory tool
```

---

## Phase 6 — Agent Optimizer / GEPA (shipped)

### Goals

Close the Track 2 optimization loop: eval → diagnose weak scenarios →
programmatically refine the system prompt → re-eval with scores.

### What's shipped

- `evals/optimize_sampler_config.json` — trains on edge cases (`9840778e`
  framing, `b12a9a4d` analysis timeout), validates on happy path + IQ handoff.
- `evals/optimize_config.json` — GEPA budget (`max_metric_calls: 12`,
  `reflection_minibatch_size: 2`, output dir `evals/optimize_runs/`).
- `evals/OPTIMIZE.md` — how to run, apply results, refresh eval sets.
- `make optimize` — runs `adk optimize` against `evals/agent_module`.
- `requirements-dev.txt` — adds `pandas` (ADK optimize dependency).

### Run it

```bash
cd services/buddy-live-adk
make install-dev
export GOOGLE_API_KEY=...
make optimize
```

Review the best instruction printed at the end, merge into `app/prompts.py`,
then `make eval` / `make eval-failures` for before/after scores.

### Demo narrative tie-in

1. **Before** — `make eval-failures` scores on framing/timeout cases.
2. **Optimize** — `make optimize` (GEPA refines prompt using same harness).
3. **After** — re-run evals; show improved `hallucinations_v1` / `safety_v1`
   in Cloud Trace + eval output.

---

## Phase 5 — Multi-agent decomposition (shipped 2026-05-30)

**Journal (scores, learnings, baselines):**
[`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md#phase-5--multi-agent-decomposition).

Today:

| Agent | Responsibility | Status |
| --- | --- | --- |
| `buddy_live_coach` (root) | Opening, warm-up, setup, memory tools | Shipped — 4 tools |
| `vision_coach` | `peek_camera`, `peek_warmup` | Shipped (`dc1df1d`) |
| `drill_coach` | Rep capture, analysis wait, scorecard, recap, drill knowledge | Shipped (`68c7c11`) |
| `iq_coach` | Hockey IQ scenarios | Pre-existing |
| Memory Agent | Cross-session history on root tools | **Skipped** — awkward mid-opening transfer |

### Phase 6 — Agent Optimizer

Once Phase 1 evals identify failure clusters, feed them into Agent Optimizer to
generate refined system instructions. Demo: eval scores before vs after the
optimizer's prompt edits.

---

## Demo narrative (the "before / after")

The Track 2 video should explicitly show:

1. **Before** — run the `framing_struggle` and `analysis_timeout` scenarios.
   Coach Buddy loops `peek_camera` forever, or stalls waiting for results.
2. **The toolkit** — Cloud Trace screenshot showing the stalled reasoning;
   `adk eval` output highlighting low scores on those scenarios.
3. **After** — refined prompt (manually for the demo; Agent Optimizer in
   Phase 6) produces higher `hallucinations_v1` and `safety_v1` scores on the
   same scenarios, with cleaner traces.
4. **Bonus** — Memory Bank remembers a returning player ("Last session you got
   7/10 on weight transfer — let's beat it").
