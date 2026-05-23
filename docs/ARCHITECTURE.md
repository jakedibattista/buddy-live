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
│  • ElevenLabs React widget      │────▶│  • Gemini Flash + 6 tools        │
│  • /api/session, /api/peek,     │     │                                  │
│    /api/clips/upload            │     │  make deploy → gcloud builds     │
│                                 │     │  submit                          │
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
  peek_url, peek_updated_at

  reps/{repId}
    drill_id, status, storage_path, job_id, results

  commands/{cmdId}
    type: "start_capture", rep_id, drill_id, hint, handled

  coach_log/{logId}        (reserved; not fully wired yet)
  ambient_notes/{noteId}   (reserved)
```

**Conversation turns** (chat history) live in ADK `InMemorySessionService` on Cloud Run — not in Firestore today. The UI transcript is in browser state from ElevenLabs `onMessage` callbacks.

## Environment split (hackathon)

| Env | Web app | ADK service | analyze-video API |
|---|---|---|---|
| Local dev | `localhost:3000` | `localhost:8080` + ngrok | dev Cloud Run URL |
| Production | Vercel | Cloud Run `buddy-live-adk` | `https://api.buddysports.app` |

For heavy testing, point `MODELFORPUCKBUDDY_API_URL` at the **dev** API so you don't load prod workers:

```
https://puck-buddy-model-api-dev-22317830094.us-central1.run.app
```

See [FIRESTORE_RULES.md](./FIRESTORE_RULES.md) for safe rules deployment into the shared `puck-buddy` Firebase project.
