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
  │                                 ├─ peek_camera → Gemini Flash (setup framing)
  │                                 ├─ peek_warmup → Gemini Flash (warm-up form)
  │                                 ├─ start_warmup_timer → Firestore command (UI countdown)
  │                                 ├─ start_rep_capture → Firestore command
  │                                 ├─ stop_rep_capture → Firestore stop_capture command
  │                                 └─ analyze_rep → modelforpuckbuddy API
  │
  ├─ webcam JPEG every ~2.5s ──▶ /api/peek (Vercel) ──▶ Firebase Storage + Firestore
  │
  └─ rep clip on command ──────▶ /api/clips/upload (Vercel) ──▶ Storage + Firestore
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
| Recording | `RecordingTimer` — 60s REC countdown + Stop & upload; driven by `useRepCapture` |
| Warm-up timer | `WarmupTimerBridge` + `CountdownOverlay` — amber m:ss countdown per move; driven by `start_warmup_timer` command |
| Voice resilience | `CoachConversation` — auto-reconnect on ElevenLabs drop (resume message, not full re-onboarding) |
| Session phase | Sidebar label from Firestore `currentPhase` (`lib/phases.ts`) |
| Setup framing | Coach speaks fixes (`peek_camera`); sidebar `NextTurnCue` during `stance_check` |
| Errors | Retry connect (ElevenLabs) and retry camera permission |

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
