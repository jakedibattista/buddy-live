# Buddy Live: System Architecture

Discover where each component of Buddy Live runs, how data flows, and how the system connects to the existing Puck Buddy stack.

## Hosting Map

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│  VERCEL                         │     │  GOOGLE CLOUD (Cloud Run)        │
│  apps/buddy-live/               │     │  services/buddy-live-adk/        │
│                                 │     │                                  │
│  • Next.js web UI (/coach)      │     │  • Python FastAPI + Google ADK   │
│  • Webcam + MediaRecorder       │     │  • /chat/completions SSE         │
│  • ElevenLabs React widget      │────▶│  • Gemini Flash + 15 tools       │
│  • /api/session,                │     │                                  │
│    /api/clips/upload,           │     │  make deploy → gcloud builds     │
│    /api/reps/analyze|refresh    │     │  submit                          │
│  vercel deploy --prod           │     │                                  │
│└──────────────┬──────────────────┘     └──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│  FIREBASE (puck-buddy project)  │     │  ELEVENLABS (their cloud)        │
│  • Firestore live_sessions/     │     │  • Voice ASR + TTS               │
│  • Storage rep clips            │     │  • Calls your ADK on each turn   │
│└─────────────────────────────────┘     └──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  EXISTING Cloud Run             │
│  modelforpuckbuddy              │
│  /api/analyze-video             │
│└─────────────────────────────────┘
```

| Component | Host | Deploy |
|---|---|---|
| Web app (UI + API routes) | **Vercel** | `cd apps/buddy-live && vercel deploy --prod` |
| ADK agent brain | **Google Cloud Run** | `cd services/buddy-live-adk && make deploy` |
| Database and file storage | **Firebase** (`puck-buddy`) | Deploy merged rules from `modelforpuckbuddy` (see [FIRESTORE_RULES.md](./FIRESTORE_RULES.md)) |
| Voice layer | **ElevenLabs** | Configured via dashboard |
| Shot analysis | **Existing Cloud Run** | Pre-deployed at `api.buddysports.app` |

## End-to-End Request Flow

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
  │                                 ├─ start_warmup_timer → Firestore command (UI countdown)
  │                                 ├─ start_rep_capture → Firestore command
  │                                 ├─ stop_rep_capture → Firestore stop_capture command
  │                                 └─ analyze_rep → modelforpuckbuddy API
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

## Conversation UI (Browser)

The `/coach` page delivers a voice-first experience. It follows conversational UI patterns from [`UI-CONVERSATION-UX-PLAN.md`](./UI-CONVERSATION-UX-PLAN.md):

| Concern | Implementation |
|---|---|
| Activity and "social silence" | `CoachActivityIndicator` handles speaking, listening, and thinking states. |
| Chat history timeline | `TranscriptPanel` shows user and coach bubbles. It also shows system status pills for recording, uploading, and connecting. |
| Next actions | `NextTurnCue` and `VoiceQuickPrompts` show dynamic suggestion chips. |
| Interactive mascot | `CoachPuckAvatar` overlays the camera. It crossfades `coach-puck.png` and `coach-puck-speak.png` using real-time audio data from `getOutputByteFrequencyData()`. This uses a baked face instead of a complex SVG overlay. |
| Recording indicators | `RecordingTimer` displays a 60-second countdown. It provides verbal and clickable stop instructions. This is driven by the `useRepCapture` hook. |
| Warm-up timer | `WarmupTimerBridge` and `CountdownOverlay` show an amber countdown for each exercise. This is triggered by the `start_warmup_timer` tool. |
| Voice resilience | `CoachConversation` handles automatic reconnection if ElevenLabs drops. It sends keepalive signals every 5 seconds. It also triggers reconnects when switching browser tabs. The backend detects reconnects to prevent double greetings, restoring the player's name, active drill, current phase, and shot state. |
| Current phase | The sidebar displays the active phase from Firestore's `currentPhase` field (mapped in `lib/phases.ts`). |
| Camera setup and framing | Guided by verbal confirmation. Setup passes automatically when the focus drill is selected. This avoids complex visual framing checks. |
| Error recovery | Supports automatic reconnect attempts for ElevenLabs and prompts to retry camera permissions. |
| Final recap dashboard | Displays an interactive recap of all scored reps in the center panel during the `recap` and `ended` phases. |
| Picture-in-Picture camera | The webcam feed scales down to a floating box in the bottom-right corner during the final recap. |

Transcript text is kept in-memory within browser state via ElevenLabs listeners. Shot scores and session metadata persist permanently in Firestore.

## What "OpenAI-Compatible SSE" Means

ElevenLabs agents communicate using the standard **OpenAI Chat Completions streaming format**. Our ADK service hosts a `/chat/completions` endpoint. It returns Server-Sent Events (SSE) in real time:

```
data: {"choices":[{"delta":{"content":"Front knee was a 6"}}]}
data: [DONE]
```

Our system still runs **Google Gemini Flash** under the hood. The phrase "OpenAI-compatible" simply refers to the network format that ElevenLabs expects. It does not mean we use OpenAI's models.

## Firestore Data Model

Our database uses a simple schema in Firestore:

```
live_sessions/{sessionId}                 (TTL: ~24h via expires_at)
  session_id, user_id, startedAt, expires_at, currentPhase
  focus_drill, focus_drill_set_at
  setup_framing_passed                        (set by set_focus_drill; verbal)
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

session_summaries/{sessionId}              (kept forever as a weekly review record)
  session_id, started_at, created_at, drill, rep_count, by_drill,
  weakest_metric, average_scores, final_phase
```

The system standardizes `drill_id` values to `wristshot`, `slapshot_form`, or `backhand`. We retired older `snapshot` and `skating` categories in our May 26 cleanup pass.

**Active conversation history** lives in memory on Cloud Run using ADK's `InMemorySessionService`. It is not stored in Firestore. The browser displays transcripts in real time using ElevenLabs event listeners combined with local system events (`lib/transcript.ts`).

## Storage Cleanup and Observability

| Layer | Path | Mechanism |
| --- | --- | --- |
| Google Cloud Storage | `gs://puck-buddy.firebasestorage.app/live_sessions/**` | Object Lifecycle rule. Automatically deletes videos after 1 day (`infra/storage-lifecycle.json`). |
| Firestore | `live_sessions/{sid}` + subcollections | Automated TTL policy. Deletes expired session documents within 24 hours of creation. |
| Firestore | `session_summaries/{sid}` | Exempt from deletion. Maintained as a durable, long-term record for weekly coach reviews. |
| Error Tracking | ADK service | Centralized monitoring using the Sentry FastAPI integration (`SENTRY_DSN` environment variable). |

### ADK Guardrails (`main.py`)

These turn-level safety checks run on the `/chat/completions` gateway. They protect whichever sub-agent is active during the current turn.

| Guardrail | Operation and Benefit |
| --- | --- |
| `max_llm_calls=10` | Restricts the agent to a maximum of 10 tool-calling iterations per turn. This prevents infinite tool-calling loops. |
| Silence filter | Blocks empty audio transmissions from ElevenLabs. The system returns an immediate blank response without making a costly Gemini call. |
| Turn deduplication | Merges duplicate voice transmissions received within 4 seconds. New utterances extending the conversation by 15 or more characters are allowed. Scoring notifications are deduped for 10 minutes. |
| User text capping (`_trim_user_text`) | Limits input text to 240 characters to prevent accidental open-microphone loops. Reconnection signals are exempt from this limit. |
| Session locking | Uses an asynchronous lock to serialize multiple requests coming from the same user session. |
| Turn timeout | Limits execution to 30 seconds using standard asyncio.timeout parameters. The session fails fast instead of hanging and wasting resources. |
| Reconnect detection | Recognizes returning connections and suppresses standard welcome greetings if the session already exists. |
| Speech sanitization (`_clean_coach_text`) | Strips internal `<thought>` brackets and speaker names before sending text to the ElevenLabs voice synthesizer. |
| IQ phase synchronization | Automatically changes `currentPhase` to `iq_practice` whenever the Hockey IQ coach is talking. |

### Structural Guardrails (`callbacks.py` — `phase_guard`)

These code-enforced gates run immediately before any of the three agents (Root, Shooting, or IQ Coach) invoke a protected tool. Firestore acts as our source of truth. We verify these behaviors with unit tests in [`tests/test_phase_guard.py`](../services/buddy-live-adk/tests/test_phase_guard.py).

| Protected Tool | Code-Enforced Rules |
| --- | --- |
| `set_focus_drill` | Restricts drill selection to once per session. This is blocked if a drill is already active or if the player is in Hockey IQ mode. |
| `show_iq_visual` | Blocks visual cards during standard shooting flows. This tool is only allowed when the phase is set to Hockey IQ, and it is blocked once the session wraps up. |
| `start_rep_capture` | Requires both an active drill and passed camera framing. This enforces a strict single-rep policy by blocking capture if any shot is already completed. |
| `analyze_rep` | Enforces the same requirements as rep capture and blocks analysis once the session is finished. |
| `end_session_recap` | Requires at least one completed shot to summarize the shooting flow. This check is bypassed if the player is in Hockey IQ mode. |

All remaining tools (including warm-up timers, video results, and IQ scoring) rely on conversational guidelines and direct agent handoffs instead of hard code barriers.

You can learn more about our data management in the Sunday review guide: [`infra/storage-lifecycle.md`](../infra/storage-lifecycle.md).

## Sandbox vs. Production Environments

| Environment | Web Application | ADK Backend Service | Video Analysis API |
|---|---|---|---|
| **Testing (this project)** | **Vercel Production Only**: [buddy-live-indol.vercel.app](https://buddy-live-indol.vercel.app) with deployment protection active. No local QA is performed. | Google Cloud Run: `buddy-live-adk` (continuously deployed). | Production Endpoint: `https://api.buddysports.app` |
| **Local Development (reference)** | `localhost:3000` (not used for active QA on this project). | `localhost:8080` with ngrok (not used). | Development Endpoint. |

For intensive testing, point the `MODELFORPUCKBUDDY_API_URL` environment variable at our dedicated dev API to avoid overloading production queue workers:

```
https://puck-buddy-model-api-dev-22317830094.us-central1.run.app
```

Refer to [FIRESTORE_RULES.md](./FIRESTORE_RULES.md) to safely deploy security rules to our shared Firebase database project.

## Implemented and Future ADK 2.0 Features

We are currently running on `google-adk==2.0.0` and utilize the following features:

* **Decomposed Sub-Agents:** Our main `buddy_live_coach` delegates work to two specialists defined in `sub_agents=[...]` inside [`services/buddy-live-adk/app/agent.py`](../services/buddy-live-adk/app/agent.py):

  | Agent | Tools and Primary Responsibilities |
  | --- | --- |
  | `drill_coach` | Handles video captures, calls `analyze_rep`, reviews the scorecard, delivers the recap, and references drill safety rules. |
  | `iq_coach` | Manages Hockey IQ visual displays and evaluates player answers. |

  The Root agent manages the opening sequence, warm-up pacing, webcam positioning, and basic session tools (such as `lookup_warmup_moves` and `set_focus_drill`). 
  
  The `load_player_memory` tool is fully built but remains intentionally unwired to ensure that every student session begins with a fresh, welcoming greeting. The warm-up sequence chooses 3 general and 2 hockey-specific moves (30 seconds each) dynamically. Seamless agent handoffs are performed via `transfer_to_agent("...")` based on student needs.
  
  Review the complete step-by-step history in [`docs/TRACK2-PHASE-JOURNAL.md`](./TRACK2-PHASE-JOURNAL.md).

* **Before Tool Execution Interceptors:** Mapped in `phase_guard` inside [`services/buddy-live-adk/app/callbacks.py`](../services/buddy-live-adk/app/callbacks.py) across all three agents. This enforces hard programmatic code boundaries on drill selections, rep captures, analytical requests, and recap pages. Mapped unit tests are located in [`tests/test_phase_guard.py`](../services/buddy-live-adk/tests/test_phase_guard.py).

The following ADK 2.0 features are intentionally deferred and tracked here for future development:

### 1. Unified Graph-Based Workflow (High Effort, Medium Short-Term Value)

We plan to transition the conversational phase machine in `COACH_SETH_LIVE_PROMPT` into a formal, declarative `google.adk.workflow.Workflow` diagram:

```
[Opening] → [SpaceCheck] → branch
                            ├─ has_space → [Warmup] → [Setup] → [DrillReadiness]
                            │                                     → [ScoredRepsLoop] → [Recap]
                            └─ no_space → [IQPracticeLoop] → [IQWrap]
```

**Why deferred:** Our current server endpoint in `/chat/completions` (defined in `services/buddy-live-adk/app/main.py`) streams chunks using `runner.run_async()`, which is designed around individual `Agent` classes instead of workflows. Migrating to the Workflow Runtime would require rewiring our streaming server logic. This carries high operational risk without local testing environments.

**Development Prerequisites:**
1. Provision a dedicated staging server (`buddy-live-adk-staging`) and point a staging ElevenLabs agent at it.
2. Confirm the Workflow Runtime emits real-time events that easily convert to our standard chunk response format.
3. Migrate the conversational flows incrementally, starting with the `Recap` phase to limit risk.
4. Keep the agent-driven path active by default and gated behind a toggle (such as `ADK_USE_WORKFLOW=false`).

### 2. Persistent Firestore-Backed Session Service (Medium Effort, Low Short-Term Value)

We plan to implement a custom `BaseSessionService` subclass that persists conversation sessions and event histories to Firestore. This will allow active student sessions to survive backend server restarts.

**Why deferred:** Our client-side voice reconnection system already restores crucial state (including player name, active drill, current phase, and rep count) using hidden instructions (see [`apps/buddy-live/src/lib/hiddenAgentMessages.ts`](../apps/buddy-live/src/lib/hiddenAgentMessages.ts)). This mitigates server restarts without requiring custom serialization code. *Note: Avoid pushing new code to production during live recording sessions.*

**Future triggers to revisit:** This will become necessary if we expand to multi-device session handoffs or require complete historical replay for deep analytics and debugging.

### 3. Granular Coach Decomposition (Low Effort, Low Short-Term Value)

We can split the main coach further into highly focused sub-agents, such as a `warmup_coach`, a `setup_coach`, and a `recap_coach`.

**Why deferred:** The main coaching agent has been thoroughly hardened. Decomposing the Hockey IQ mode was our highest-value split because it isolated a completely new, classroom-style experience. Further splits are primarily for organization and will be done if specific sections of the flow require independent prompt updates.
