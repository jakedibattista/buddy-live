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
│  • ElevenLabs React widget      │────▶│  • Gemini Flash + 8 tools        │
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
  │                                 ├─ peek_camera → Gemini Flash (1 JPEG)
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
| Recording | `RecordingTimer` — 60s countdown + Stop & upload; driven by `useRepCapture` + `stop_capture` commands |
| Session phase | Sidebar label from Firestore `currentPhase` (`lib/phases.ts`) |
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
live_sessions/{sessionId}
  session_id, user_id, startedAt, currentPhase
  focus_drill, focus_drill_set_at
  peek_url, peek_updated_at
  last_peek_person_visible, peek_fail_streak, camera_hint
  setup_framing_passed, full_body_in_frame, facing_camera
  results_ready_at, ended_at

  reps/{repId}
    drill_id, status, storage_path, job_id, results

  commands/{cmdId}
    type: "start_capture" | "stop_capture", rep_id, drill_id, hint, handled

  coach_log/{logId}        (reserved; not fully wired yet)
  ambient_notes/{noteId}   (reserved)
```

**Conversation turns** (chat history) live in ADK `InMemorySessionService` on Cloud Run — not in Firestore today. The UI transcript is in browser state from ElevenLabs `onMessage` callbacks plus client-side system events (`lib/transcript.ts`).

## Environment split (hackathon)

| Env | Web app | ADK service | analyze-video API |
|---|---|---|---|
| Local dev | `localhost:3000` (needs full Firebase env) | `localhost:8080` + ngrok | dev Cloud Run URL |
| Production | Vercel — [buddy-live-indol.vercel.app](https://buddy-live-indol.vercel.app) (deployment protection on) | Cloud Run `buddy-live-adk` | `https://api.buddysports.app` |

For heavy testing, point `MODELFORPUCKBUDDY_API_URL` at the **dev** API so you don't load prod workers:

```
https://puck-buddy-model-api-dev-22317830094.us-central1.run.app
```

See [FIRESTORE_RULES.md](./FIRESTORE_RULES.md) for safe rules deployment into the shared `puck-buddy` Firebase project.
