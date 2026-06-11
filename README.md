# Buddy Live

A real-time AI hockey coach. Talk to it, it watches your reps via webcam, and gives you feedback in real time. Built for the [Google Cloud / Devpost ADK hackathon](https://devpost.team/google-cloud-for-startups/hackathons/3197).

```
Browser ───── voice ─────▶  ElevenLabs Agent  ──── Custom LLM SSE ────▶  ADK Service (Cloud Run)
   │                            │                                            │
   │ rep clip (MediaRecorder)    │                                            ├── start_warmup_timer / set_focus_drill
   │  ↓                          │                                            ├── start/stop_rep_capture
   │ /api/clips/upload           │                                            ├── analyze_rep → modelforpuckbuddy
   │ /api/reps/analyze            ▼                                            ├── get_rep_result
   │ /api/reps/refresh         Firestore  ◀────  listener subscriptions       └── recommend_drill / end_session_recap
   ▼
Firebase Storage
```

## What's in the box

| Path | What |
|---|---|
| [`apps/buddy-live/`](apps/buddy-live) | Next.js 16 web app (TS, App Router, Tailwind v4, `@elevenlabs/react`). Live session UI, ElevenLabs widget, MediaRecorder rep capture, Firestore listeners. |
| [`services/buddy-live-adk/`](services/buddy-live-adk) | Python FastAPI + Google ADK 2.0 agent. OpenAI-compatible `/chat/completions` SSE endpoint hit by ElevenLabs' Custom LLM. **15 tools** across root + sub-agents (see [ARCHITECTURE.md](docs/ARCHITECTURE.md)). |
| [`docs/UI-CONVERSATION-UX-PLAN.md`](docs/UI-CONVERSATION-UX-PLAN.md) | Conversation UI plan, applying lovable chatbot UX to voice coaching. Phases 1 to 3 are fully shipped; the interrupt button has been deferred. |
| [`infra/`](infra) | Cloud Build, Firestore + Storage rules, Firebase config, deploy guide, [`infra/scripts/`](infra/scripts) ops helpers. |
| [`docs/README.md`](docs/README.md) | Index of all documentation including product guidelines, Track 2 details, checklists, and audits. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Comprehensive hosting map detailing Vercel, Cloud Run, Firebase, ElevenLabs, data flows, and environment setups. |
| [`docs/FIRESTORE_RULES.md`](docs/FIRESTORE_RULES.md) | Safe merge + deploy of `live_sessions/` into the existing `puck-buddy` database. |

## How it actually works

1. The player opens **/coach**. The app signs in anonymously to Firebase, creates a `live_sessions/{sessionId}` doc, and asks for camera + mic permission.
2. They hit **Start session** and the ElevenLabs React widget opens a WebRTC connection to the ElevenLabs Agent.
3. The agent is configured with `llm: custom_llm` pointing at the ADK service. On every conversational turn, ElevenLabs POSTs OpenAI-style messages to `/chat/completions` with `customLlmExtraBody.arbitrary_identifier = sessionId`.
4. The ADK service routes that to the same persistent ADK `Session`, runs the LLM (Gemini Flash), and streams back SSE chunks. Tools run inside ADK with full session memory.
5. Coach Buddy drives the session using voice: a **timed warm-up** with on-screen countdowns, a **verbal setup** checking head-to-toes framing, a drill explanation or practice rep, and finally **one scored rep**. Hockey IQ questions fill the wait while video analysis runs in the background for about 30 to 90 seconds.
6. Warm-up calls `lookup_warmup_moves` twice to choose 3 general and 2 hockey-specific moves from the knowledge corpus. These are 30 seconds each, followed by a `start_warmup_timer` call. When each timer hits zero, Coach Buddy verbally asks how it felt and introduces the next move. This warm-up is completely verbal and does not require vision tools.
7. For the scored rep, the agent calls `start_rep_capture` (UI shows REC + 60s countdown), then `stop_rep_capture` when the player shoots. The browser mints a signed PUT URL from `/api/clips/upload-url` and uploads the clip **directly to Firebase Storage** (bypassing Vercel's 4.5 MB serverless body limit), then finalises via `/api/clips/upload`; `/api/reps/analyze` and `/api/reps/refresh` keep the scorecard pipeline moving even if the agent is mid-conversation.
8. The agent calls `analyze_rep` which POSTs to [modelforpuckbuddy](https://github.com/jakedibattista/modelforpuckbuddy) `/api/analyze-video`. When results land, the coach asks **"Want to walk through the scorecard together?"** then reviews weakest metric + fix cue, checks in, and assigns homework. Wrap-up uses `end_session_recap` + `recommend_drill`. Setup framing and warm-up form are confirmed verbally, without webcam vision tools.

If the ElevenLabs voice link drops mid-session, the web app **auto-reconnects** (up to 5 attempts) and resumes the Firebase session with a reconnect first message — it does not restart from “what’s your name?” unless the player ends the call manually.

The `/coach` UI follows voice-chat UX best practices (activity signals, system timeline, error recovery, next-turn cues, talking puck mascot). See [`docs/UI-CONVERSATION-UX-PLAN.md`](docs/UI-CONVERSATION-UX-PLAN.md).

## Quick start (local — reference only)

**Do not use local dev for QA.** Push to `main` and test on Vercel: [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach). The steps below are for backend hacking only.

You need Node 20+, Python 3.12+, and a Firebase project with Auth + Firestore + Storage enabled.

### The Fast Way (Root Orchestrator)

We provide a root-level `Makefile` to install and run both frontend and backend services concurrently.

```bash
# 1. Onboard your environment variables first (see "Setup" below)

# 2. Install all dependencies for both services at once
make install

# 3. Start Next.js, FastAPI, and ngrok concurrently
make dev
```

### The Manual Way (Step-by-Step)

If you prefer starting services individually, do the following:

```bash
# 1. ADK service
cd services/buddy-live-adk
make install
cp .env.example .env  # fill in GOOGLE_API_KEY
make run

# in a second terminal
ngrok http 8080       # ElevenLabs needs a public URL for the Custom LLM
```

Create an ElevenLabs Agent in their dashboard:

- LLM: **Custom LLM**, URL `<your-ngrok>/chat/completions`
- Voice: any conversational voice (we use Brian)
- Enable **speculative turn** for lowest latency
- Copy the Agent ID

```bash
# 2. Web app
cd apps/buddy-live
cp .env.example .env.local
# fill in NEXT_PUBLIC_FIREBASE_* and NEXT_PUBLIC_ELEVENLABS_AGENT_ID
# and (server-only) FIREBASE_ADMIN_* + GEMINI_API_KEY
npm install
npm run dev
# → http://localhost:3000
```

Hit **Start session** and start talking.

## Deploy

See [infra/README.md](infra/README.md) for full Cloud Build + Vercel instructions. Short version:

```bash
# ADK service → Cloud Run
gcloud builds submit --config infra/cloudbuild.yaml

# Firestore + Storage rules
firebase deploy --only firestore:rules,storage:rules --config infra/firebase.json

# Web app → Vercel
cd apps/buddy-live && vercel deploy --prod
```

ADK errors are tracked in **Sentry** (`SENTRY_DSN` env var on Cloud Run). For the
24h GCS + Firestore TTL cleanup and the per-session weekly-review summary, see
[`infra/storage-lifecycle.md`](infra/storage-lifecycle.md).

## Architectural decisions

### Why hybrid (ElevenLabs + ADK + Gemini Flash on demand) instead of Gemini Live?

The [Gemini Live API caps video input at 1 FPS](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs) and explicitly warns it is "unsuitable for use cases that require analyzing fast-changing video, such as play-by-play in high-speed sports." A hockey wristshot release happens in about 150 to 300 milliseconds, meaning the Live API would miss the shot entirely. We use Gemini Flash only for ambient awareness, such as checking player stance, grip, and framing. Actual shot-mechanics analysis is routed through our specialized MediaPipe, Roboflow, and Coach Seth pipeline. Audio, voice, and user interruptions are handled by ElevenLabs because their low voice latency and high audio quality beat other real-time options. The ADK agent plugs directly in as the system's brain.

### Why ADK as the brain?

The hackathon judging criterion. Beyond that, ADK gives us a clean `Agent` + `Runner` + `SessionService` + tool-calling primitive, with built-in support for `NON_BLOCKING` async function calls (lets the agent keep talking while `analyze_rep` runs in the background) and SSE streaming that maps 1:1 onto the ElevenLabs contract. Session state per conversation comes "for free" by mapping ElevenLabs' `arbitrary_identifier` to ADK's `session_id`.

### Latency budget

| Hop | Target ms |
|---|---|
| User mic → ElevenLabs ASR turn-end | 200–400 |
| ElevenLabs → ADK Cloud Run SSE TTFT | 150–300 |
| ADK Gemini Flash first token (no tool) | 400–700 |
| ElevenLabs first audio chunk | 100–200 |
| Total: voice in → voice out (no tool) | ~0.9–1.6 s |
| With analyze_rep (fire and forget) | ~0 |

## Devpost submission checklist

- [x] 3-minute demo video: [share.descript.com/view/w8U2RQQBIV4](https://share.descript.com/view/w8U2RQQBIV4)
- [x] Architecture diagram, available at [`docs/submission/ARCHITECTURE-DIAGRAM.md`](docs/submission/ARCHITECTURE-DIAGRAM.md)
- [x] Built with: **Google ADK, Gemini Flash, Firebase, Cloud Run, ElevenLabs, Next.js, Vercel**
- [x] Public GitHub repo, located at [github.com/jakedibattista/buddy-live](https://github.com/jakedibattista/buddy-live)
- [x] Live URL (protected): [buddy-live-indol.vercel.app](https://buddy-live-indol.vercel.app) (also `buddy-live-buddy-tech.vercel.app`; Buddy Tech login required)
- [x] 1-pager + judge toolkit, located at [`docs/submission/DEVPOST-1-PAGER.md`](docs/submission/DEVPOST-1-PAGER.md) and [`docs/submission/JUDGE-TOOLKIT.md`](docs/submission/JUDGE-TOOLKIT.md)

## Credits

- Hockey coaching prompts + scoring rubric ported from [modelforpuckbuddy](https://github.com/jakedibattista/modelforpuckbuddy) (Coach Seth).
- ElevenLabs Custom LLM ↔ ADK SSE pattern from [their blog post](https://elevenlabs.io/blog/practical-guide-open-source-agent-frameworks-and-elevenagents).
- ADK streaming-tools pattern from the [official docs](https://google.github.io/adk-docs/streaming/streaming-tools/).
