# Buddy Live

A real-time AI hockey coach. Talk to it, it watches your reps via webcam, and gives you feedback in real time. Built for the [Google Cloud / Devpost ADK hackathon](https://devpost.team/google-cloud-for-startups/hackathons/3197).

```
Browser ───── voice ─────▶  ElevenLabs Agent  ──── Custom LLM SSE ────▶  ADK Service (Cloud Run)
   │                            │                                            │
   │ webcam frames               │                                            ├── peek_camera     → Gemini Flash
   │  ↓                          │                                            ├── start_rep_capture → Firestore command
   │ /api/peek                   │                                            ├── analyze_rep    → modelforpuckbuddy
   │ /api/clips/upload           ▼                                            ├── get_rep_result → Firestore + jobs API
   ▼                          Firestore  ◀────  listener subscriptions  ────┤
Firebase Storage                                                              └── recommend_drill / end_session_recap
```

## What's in the box

| Path | What |
|---|---|
| [`apps/buddy-live/`](apps/buddy-live) | Next.js 16 web app (TS, App Router, Tailwind v4, `@elevenlabs/react`). Live session UI, ElevenLabs widget, MediaRecorder rep capture, periodic webcam-frame uploader, Firestore listeners. |
| [`services/buddy-live-adk/`](services/buddy-live-adk) | Python FastAPI + Google ADK 2.0 agent. OpenAI-compatible `/chat/completions` SSE endpoint hit by ElevenLabs' Custom LLM. 6 tools: `peek_camera`, `start_rep_capture`, `analyze_rep`, `get_rep_result`, `recommend_drill`, `end_session_recap`. |
| [`infra/`](infra) | Cloud Build, Firestore + Storage rules, Firebase config, deploy guide. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Hosting map (Vercel / Cloud Run / Firebase / ElevenLabs), data flow, env split. |
| [`docs/FIRESTORE_RULES.md`](docs/FIRESTORE_RULES.md) | Safe merge + deploy of `live_sessions/` into the existing `puck-buddy` database. |

## How it actually works

1. The player opens **/coach**. The app signs in anonymously to Firebase, creates a `live_sessions/{sessionId}` doc, and asks for camera + mic permission.
2. They hit **Start session** -- the ElevenLabs React widget opens a WebRTC connection to the ElevenLabs Agent.
3. The agent is configured with `llm: custom_llm` pointing at the ADK service. On every conversational turn, ElevenLabs POSTs OpenAI-style messages to `/chat/completions` with `customLlmExtraBody.arbitrary_identifier = sessionId`.
4. The ADK service routes that to the same persistent ADK `Session`, runs the LLM (Gemini Flash), and streams back SSE chunks. Tools run inside ADK with full session memory.
5. While connected, the web app uploads a small webcam JPEG to Firebase Storage every ~2.5s and mirrors the signed URL into the session doc. When the agent calls `peek_camera`, the tool fetches that latest frame and one-shot-asks Gemini Flash a grounding question. This sidesteps the 1-FPS / 2-min Gemini Live API limits entirely.
6. When the agent wants the player to shoot, it calls `start_rep_capture(drill_id, hint)`. That writes a Firestore command. The web client sees it, starts `MediaRecorder`, and uploads the resulting webm to `/api/clips/upload`.
7. Once the clip is up, the agent calls `analyze_rep(rep_id, drill_id)` which POSTs to the existing [modelforpuckbuddy](https://github.com/jakedibattista/modelforpuckbuddy) `/api/analyze-video` endpoint. That kicks the full MediaPipe + Roboflow + Coach Seth pipeline (30-90s). The tool returns *immediately* so the agent can keep coaching.
8. Whenever the player asks "how was that shot?" -- or the agent decides to surface results -- it calls `get_rep_result(rep_id)`. The score, weakest metric, and Coach Seth summary land in the side panel and the agent speaks the highlight.

## Quick start (local)

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

Hit **Start session** and start talking. If you want to record the demo video without depending on live network, use **/coach/demo** -- it replays a scripted session through the same UI.

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

## Architectural decisions

### Why hybrid (ElevenLabs + ADK + Gemini Flash on demand) instead of Gemini Live?

The [Gemini Live API caps video input at 1 FPS](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs) and explicitly warns it is "unsuitable for use cases that require analyzing fast-changing video, such as play-by-play in high-speed sports." A hockey wristshot release happens in ~150-300ms -- Live API would miss the shot. We use it only for ambient awareness (stance, grip, framing) via single-shot Gemini Flash calls, and route actual shot-mechanics analysis through the existing MediaPipe + Roboflow + Coach Seth pipeline at modelforpuckbuddy. Audio + voice + barge-in goes through ElevenLabs because their TTS latency and quality currently beats Gemini Live's native audio, and the [ElevenLabs Custom LLM SSE pattern](https://elevenlabs.io/blog/practical-guide-open-source-agent-frameworks-and-elevenagents) lets us slot in an ADK agent as the brain.

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
| With peek_camera (1 Gemini Flash image call) | +600–1200 ms |
| With analyze_rep (fire and forget) | ~0 |

## Devpost submission checklist

- [ ] 3-min demo video (use **/coach/demo** as scripted backup)
- [ ] Architecture diagram (see above)
- [ ] Built with: **Google ADK, Gemini Flash, Gemini Live (peek only), Firebase, Cloud Run, ElevenLabs, Next.js, Vercel**
- [ ] Public GitHub repo
- [ ] Live URL (`buddy-live.vercel.app`)
- [ ] 1-pager: how we use ADK specifically (`Agent` + `Runner` + `SessionService` + 6 tools + streaming SSE bridge to ElevenLabs)

## Credits

- Hockey coaching prompts + scoring rubric ported from [modelforpuckbuddy](https://github.com/jakedibattista/modelforpuckbuddy) (Coach Seth).
- ElevenLabs Custom LLM ↔ ADK SSE pattern from [their blog post](https://elevenlabs.io/blog/practical-guide-open-source-agent-frameworks-and-elevenagents).
- ADK streaming-tools pattern from the [official docs](https://google.github.io/adk-docs/streaming/streaming-tools/).
