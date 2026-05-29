# Buddy Live — Architecture

Where each piece runs, how data flows, and how it connects to the existing Puck Buddy stack.

## Hosting map

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│  VERCEL                         │     │  GOOGLE CLOUD (Cloud Run)        │
│  apps/buddy-live/               │     │  services/buddy-live-adk/        │
│                                 │     │                                  │
│  • Next.js web UI (/coach)      │     │  • Python FastAPI + Google ADK   │
│  • Webcam + MediaRecorder       │     │  • /chat/completions SSE         │
│  • ElevenLabs React widget      │────▶│  • Gemini Flash + 10 tools       │
│  • /api/session, /api/peek,     │     │                                  │
│    /api/clips/upload,           │     │  make deploy → gcloud builds     │
│    /api/reps/analyze|refresh    │     │  submit                          │
│  vercel deploy --prod           │     │                                  │
└──────────────┬──────────────────┘     └──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│  FIREBASE (puck-buddy project)  │     │  ELEVENLABS (their cloud)        │
│  • Firestore live_sessions/     │     │  • Voice ASR + TTS               │
│  • Storage clips + peek frames  │     │  • Calls your ADK on each turn   │
└─────────────────────────────────┘     └──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  EXISTING Cloud Run             │
│  modelforpuckbuddy              │
│  /api/analyze-video             │
└─────────────────────────────────┘
```

| Component | Host | Deploy |
|---|---|---|
| Web app (UI + API routes) | **Vercel** | `cd apps/buddy-live && vercel deploy --prod` |
| ADK agent brain | **Google Cloud Run** | `cd services/buddy-live-adk && make deploy` |
| Database + file storage | **Firebase** (`puck-buddy`) | Deploy merged rules from `modelforpuckbuddy` — see [FIRESTORE_RULES.md](./FIRESTORE_RULES.md) |
| Voice layer | **ElevenLabs** | Dashboard config only |
| Shot analysis | **Existing Cloud Run** | Already deployed at `api.buddysports.app` |

## End-to-end request flow

```
Player (browser)
  │
  ├─ voice ──────────────────▶ ElevenLabs Agent (WebRTC)
  │                                 │
  │                                 │ POST /chat/completions (OpenAI-style SSE)
  │                                 ▼
  │                            ADK Service (Cloud Run)
  │                                 │
  │                                 ├─ Gemini Flash (conversation)
  │                                 ├─ peek_camera → Fallback setup framing (verbal confirmation preferred)
  │                                 ├─ peek_warmup → Fallback warm-up check (verbal confirmation preferred)
  │                                 ├─ start_warmup_timer → Firestore command (UI countdown)
  │                                 ├─ start_rep_capture → Firestore command
  │                                 ├─ stop_rep_capture → Firestore stop_capture command
  │                                 └─ analyze_rep → modelforpuckbuddy API
  │
  ├─ webcam JPEG every ~2.5s ──▶ /api/peek (Vercel) ──▶ Firebase Storage + Firestore
  │
  └─ rep clip on command ──────▶ signed PUT URL (/api/clips/upload-url) ──▶ Storage (direct)
                                      │  then /api/clips/upload finalises ──▶ Firestore
                                      │
                                      ▼
                               modelforpuckbuddy worker (30–90s)
                                      │
                                      ▼
                               Firestore live_sessions/.../reps/{repId}.results
                                      │
                                      ▼
                               UI scorecard + ADK get_rep_result tool
```

## Conversation UI (browser)

The `/coach` page is voice-first but follows conversational UI patterns from [`UI-CONVERSATION-UX-PLAN.md`](./UI-CONVERSATION-UX-PLAN.md):

| Concern | Implementation |
|---|---|
| Activity / “social silence” | `CoachActivityIndicator` — speaking, listening, thinking |
| Timeline | `TranscriptPanel` — user/coach bubbles + system pills (record, upload, peek, connection) |
| Next action | `NextTurnCue` + `VoiceQuickPrompts` chips |
| Mascot | `CoachPuckAvatar` on camera — crossfades `coach-puck.png` ↔ `coach-puck-speak.png` via `getOutputByteFrequencyData()` (baked face, no SVG overlay) |
| Recording | `RecordingTimer` — 60s REC countdown + verbal / click stop instructions; driven by `useRepCapture` |
| Warm-up timer | `WarmupTimerBridge` + `CountdownOverlay` — amber m:ss countdown per move; driven by `start_warmup_timer` command |
| Voice resilience | `CoachConversation` — auto-reconnect on ElevenLabs drop (using a secure backend-mints WebRTC token and no unauthorized overrides) combined with ADK backend reconnect detection to suppress double greetings |
| Session phase | Sidebar label from Firestore `currentPhase` (`lib/phases.ts`) |
| Setup framing | Verbal confirmation by default (framing automatically passes when focus drill is set); fallback to `peek_camera` tool |
| Errors | Retry connect (ElevenLabs) and retry camera permission |
| Recap Dashboard | Full-screen interactive recap of all scored reps in the center panel during `recap` and `ended` phases |
| Picture-in-Picture | Camera view smoothly scales down to a floating PiP in the bottom-right corner during final recap |

Transcript text is **in-memory only** (ElevenLabs `onMessage`). Rep scores and session metadata persist in Firestore.

## What “OpenAI-compatible SSE” means

ElevenLabs Custom LLM speaks **OpenAI Chat Completions streaming format**. Our ADK service exposes `/chat/completions` and returns SSE chunks like:

```
data: {"choices":[{"delta":{"content":"Front knee was a 6"}}]}
data: [DONE]
```

**The model is still Gemini Flash** inside ADK. “OpenAI-compatible” refers only to the HTTP wire format ElevenLabs expects, not the LLM provider.

## Firestore data model

```
live_sessions/{sessionId}                 (TTL: ~24h via expires_at)
  session_id, user_id, startedAt, expires_at, currentPhase
  focus_drill, focus_drill_set_at
  peek_url, peek_updated_at, peek_url_history[]   (ring buffer, ≤8 frames)
  last_peek_person_visible, last_peek_full_body_in_frame,
  last_peek_facing_camera, last_peek_stick_visible, last_peek_setup,
  setup_framing_passed, camera_hint, peek_status_updated_at,
  framing_failure_count                       (counts pass→fail transitions)
  last_warmup_exercise, last_warmup_form, last_warmup_moving,
  last_warmup_motion_detected, last_warmup_frames_analyzed, last_warmup_setup,
  warmup_moves_checked, warmup_motion_miss_count, warmup_peek_updated_at,
  last_warmup_timer_label, last_warmup_timer_seconds, warmup_timer_started_at,
  results_ready_at, ended_at

  reps/{repId}
    drill_id, status, storage_path, job_id, results

  commands/{cmdId}
    type: "start_capture" | "stop_capture" | "start_warmup_timer"
    rep_id, drill_id, hint, handled          (capture commands)
    exercise, label, duration_seconds         (warm-up timer commands)

  coach_log/{logId}        (reserved; not fully wired yet)
  ambient_notes/{noteId}   (reserved)

session_summaries/{sessionId}              (kept forever — weekly review record)
  session_id, started_at, created_at, drill, rep_count, by_drill,
  weakest_metric, average_scores,
  framing_struggles, warmup_motion_misses, warmup_moves_checked, final_phase
```

`drill_id` is canonicalised to `wristshot | slapshot_form | backhand`; legacy
`snapshot` / `skating` ids were retired in the 2026-05-26 cleanup pass.

**Conversation turns** (chat history) live in ADK `InMemorySessionService` on Cloud Run — not in Firestore today. The UI transcript is in browser state from ElevenLabs `onMessage` callbacks plus client-side system events (`lib/transcript.ts`).

## Storage cleanup + observability

| Layer | Path | Mechanism |
| --- | --- | --- |
| GCS | `gs://puck-buddy.firebasestorage.app/live_sessions/**` | Object Lifecycle rule, delete after 1 day (`infra/storage-lifecycle.json`) |
| Firestore | `live_sessions/{sid}` + subcollections | TTL policy on `expires_at` (≈24h) |
| Firestore | `session_summaries/{sid}` | Not on TTL — durable per-session record for weekly review |
| Errors | ADK service | Sentry FastAPI integration (`SENTRY_DSN` env var on Cloud Run) |

### ADK guardrails (main.py)

| Guard | Effect |
| --- | --- |
| `max_llm_calls=10` | Caps tool-calling rounds per user turn (default was 500) |
| Silence filter | `"..."` / empty from ElevenLabs → immediate empty SSE, no Gemini call |
| Per-session asyncio lock | Serializes concurrent turns on same session |
| 30s turn timeout | `asyncio.timeout` — fails fast instead of hanging until Cloud Run kills at 300s |
| Reconnect detection | Suppresses default welcome/greeting on reconnecting turns if the session already exists |

See [`infra/storage-lifecycle.md`](../infra/storage-lifecycle.md) for the Sunday
review workflow.

## Environment split (hackathon)

| Env | Web app | ADK service | analyze-video API |
|---|---|---|---|
| **Testing (this project)** | **Vercel only** — [buddy-live-indol.vercel.app](https://buddy-live-indol.vercel.app) (deployment protection on). No local QA. | Cloud Run `buddy-live-adk` (always deployed) | `https://api.buddysports.app` |
| Local dev (reference) | `localhost:3000` — not used for Buddy Live QA | `localhost:8080` + ngrok — not used | dev Cloud Run URL |

For heavy testing, point `MODELFORPUCKBUDDY_API_URL` at the **dev** API so you don't load prod workers:

```
https://puck-buddy-model-api-dev-22317830094.us-central1.run.app
```

See [FIRESTORE_RULES.md](./FIRESTORE_RULES.md) for safe rules deployment into the shared `puck-buddy` Firebase project.

## Deferred ADK 2.0 work

We're on `google-adk==2.0.0` and already use:

- **Sub-agents** — `buddy_live_coach` (root) + `iq_coach` (sub-agent) via the
  `sub_agents=[...]` pattern in [`services/buddy-live-adk/app/agent.py`](../services/buddy-live-adk/app/agent.py).
  Root transfers via `transfer_to_agent("iq_coach")` when the player picks IQ mode.
- **`before_tool_callback`** — `phase_guard` in
  [`services/buddy-live-adk/app/callbacks.py`](../services/buddy-live-adk/app/callbacks.py)
  structurally blocks `start_rep_capture` without framing and
  `end_session_recap` without ready results.

The following ADK 2.0 features are **intentionally deferred** and tracked here
so they don't get lost:

### 1. Graph workflow rewrite (HIGH effort, MEDIUM value)

Replace the prompt-driven phase machine in `COACH_SETH_LIVE_PROMPT` with an
explicit `google.adk.workflow.Workflow` graph:

```
[Opening] → [SpaceCheck] → branch
                            ├─ has_space → [Warmup] → [Setup] → [DrillReadiness]
                            │                                     → [ScoredRepsLoop] → [Recap]
                            └─ no_space → [IQPracticeLoop] → [IQWrap]
```

**Why deferred:** the [`services/buddy-live-adk/app/main.py`](../services/buddy-live-adk/app/main.py)
`/chat/completions` endpoint streams via `runner.run_async(agent=...)` which is wired
to an `Agent`, not a `Workflow`. The ElevenLabs OpenAI-compatible SSE bridge would
need to be re-implemented against the Workflow Runtime's event stream. Risk: high
without local staging — we currently can't run locally (see Vercel-only testing rule).

**Prerequisites before doing this:**
1. Stand up a staging Cloud Run service (`buddy-live-adk-staging`) and point a staging
   ElevenLabs agent at it.
2. Verify the Workflow Runtime emits ADK `Event` objects compatible with the existing
   SSE chunk format (`event.content.parts[].text`, `event.partial`).
3. Migrate one phase at a time (start with `Recap` — lowest blast radius).
4. Keep `Agent`-based path behind an env flag (`ADK_USE_WORKFLOW=false` default) for
   instant rollback during the cutover.

### 2. Persistent (Firestore-backed) `SessionService` (MEDIUM effort, LOW value today)

Implement a `BaseSessionService` subclass that persists `Session.state` and `Event`
log to Firestore so sessions survive Cloud Run scale-to-zero.

**Why deferred:** the voice reconnect flow already restores `focus_drill`,
`currentPhase`, `repCount`, and `setupFramingPassed` via a hidden context message
(see [`apps/buddy-live/src/lib/hiddenAgentMessages.ts`](../apps/buddy-live/src/lib/hiddenAgentMessages.ts)).
That covers the main failure mode (Cloud Run restart mid-session) without needing
custom event serialization.

**Revisit when:** we add features that depend on full conversation replay (e.g.
session resume in a new browser tab, post-hoc transcript analysis, or evaluator runs
that need the full event log).

### 3. Split shooting flow further (LOW effort, LOW value today)

Could split `buddy_live_coach` further into `warmup_coach`, `setup_coach`,
`drill_coach`, `recap_coach`. Each gets a smaller prompt, easier to test in isolation.

**Why deferred:** the current root prompt is mature and tested. The IQ split was the
high-value one because IQ was a new feature; further splits are mostly tidiness.
Revisit if a single sub-flow starts misbehaving frequently.
