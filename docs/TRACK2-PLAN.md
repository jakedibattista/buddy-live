# Track 2: Optimize — Gap Analysis & Implementation Plan

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
| **Orchestration:** ADK (or supported OSS framework) | Pass | `google-adk==2.0.0`, root `buddy_live_coach` + `iq_coach` sub-agent |
| **Infrastructure:** Cloud Run or GKE | Pass | `infra/cloudbuild.yaml`, deployed to `puck-buddy` project |

---

## Audit — current state (as of this plan)

### Already in place since the initial gap analysis

| Originally-flagged gap | Status today |
| --- | --- |
| "Single agent only" | **Closed (basic)** — root agent + `iq_coach` sub-agent via ADK 2.0 `sub_agents=[]`, agent transfer for Hockey IQ mode |
| "No ADK callbacks" | **Closed** — `phase_guard` BeforeToolCallback on both agents (Firestore-backed phase gates) |
| New tool `mark_iq_answer` | Added |

### Track 2 gaps still open

| Gap | Why it matters for Track 2 | Evidence |
| --- | --- | --- |
| **No Agent Simulation / User Simulation** | Core of Track 2. "Use Agent Simulation to generate synthetic user interactions and test the agent against rare, multi-variable events." | No `evalsets/`, no `ConversationScenario`, no `eval_config.json` |
| **No Environment Simulation** | Tools call real Firestore / modelforpuckbuddy — evals can't run hermetically and can't inject error edge cases | All tools (`peek_camera`, `analyze_rep`, …) talk to live infra |
| **No observability beyond Sentry errors** | "Use Agent Observability to visually trace complex reasoning and debug stalled logic." Sentry catches exceptions but not reasoning traces | `main.py` initialises Sentry only; no OpenTelemetry / Cloud Trace |
| **No Agent Optimizer** | "Use Agent Optimizer to programmatically refine system instructions." | Prompt is hand-tuned in `prompts.py` |
| **No grounding / RAG** | Resource guide: "Strategically employ Grounding … and RAG to enhance the knowledge and reliability of individual agents." | Coaching knowledge baked into `COACH_SETH_LIVE_PROMPT` |
| **`InMemorySessionService`** | Sessions die on container restart; managed Memory Bank shows production discipline | `app/agent.py:108` |
| **Cloud Run (not Agent Runtime)** | Resource guide encourages "Deploy to Agent Runtime" for managed sessions + auto-tracing | `infra/cloudbuild.yaml` is plain Cloud Run; no `adk deploy` |

---

## Implementation plan — six phases

| # | Phase | Effort | Track 2 impact | Status |
| --- | --- | --- | --- | --- |
| 1 | **ADK Eval + User Simulation + Environment Simulation** | 2–3 days | **Critical** — the heart of Track 2 | **Done** |
| 2 | **OpenTelemetry tracing → Cloud Trace** | 1 day | **High** — needed for the "show your reasoning" demo | **Done** |
| 3 | **Vertex AI Search grounding for drill knowledge** | 2 days | **High** — explicit ask in resource guide | Pending |
| 4 | **Persistent sessions + Memory Bank** | 0.5 day | Medium — production-readiness signal | Pending |
| 5 | **Multi-agent decomposition (vision / drill / IQ / memory)** | 2 days | Medium — judges reward orchestration | Pending |
| 6 | **Agent Optimizer loop** | 1 day | Medium — closes the optimization story; depends on Phase 1 | Pending |

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

## Phase 3–6 — follow-ups (not in this PR)

### Phase 3 — Grounding / RAG (next)

Move the embedded drill cheat sheets, rubrics, and IQ scenario bank out of
`COACH_SETH_LIVE_PROMPT` into a Vertex AI Search Data Store. Add a
`search_coaching_knowledge` tool. Demonstrate via eval scores that grounded
recommendations beat prompt-baked ones.

### Phase 4 — Persistent sessions + Memory Bank

Replace `InMemorySessionService` with either:

- `DatabaseSessionService` (Cloud SQL) for durability, or
- `VertexAiMemoryBankService` for cross-session player memory.

This is a ~10-line change; it just needs the Cloud SQL / Memory Bank backend
provisioned.

### Phase 5 — Multi-agent decomposition

Today: root coach + IQ sub-agent. Proposed expansion:

| Agent | Responsibility |
| --- | --- |
| Coach Orchestrator | Phase flow, voice personality |
| Vision Agent | `peek_camera`, `peek_warmup` |
| Drill Agent | `start_rep_capture`, `stop_rep_capture`, `analyze_rep`, `get_rep_result` |
| Hockey IQ Agent | existing `iq_coach` |
| Memory Agent | Cross-session history, returning-player nudges |

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
