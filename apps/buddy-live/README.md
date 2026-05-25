# Buddy Live web app

Next.js 16 frontend — live coaching UI, ElevenLabs voice, rep capture, and Firestore session state.

See the [root README](../../README.md) for setup, architecture, and deploy. Vercel **Root Directory** for this repo is `apps/buddy-live`.

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing — single **Talk to Coach Buddy** CTA |
| `/coach` | Live session (camera, voice, transcript, reps) |

## Key components (`src/components/`)

| Component | Role |
|---|---|
| `CoachConversation` | ElevenLabs WebRTC connect, **auto-reconnect** on drop, retry on failure |
| `CoachVoiceShell` | Wraps grid in `ConversationProvider` for SDK hooks |
| `TranscriptPanel` | User/coach bubbles, system pills, activity row |
| `CoachActivityIndicator` | Speaking / listening / thinking |
| `CoachPuckAvatar` | Talking puck mascot — baked-face PNG crossfade (neutral ↔ speak), volume-synced |
| `CoachAudioMuteButton` | Mute coach output volume |
| `CameraView` | Webcam preview |
| `CountdownOverlay` | Shared **m:ss** countdown UI (amber warm-up + red REC variants) |
| `RecordingTimer` | 60s REC countdown + Stop & upload |
| `WarmupTimerBridge` | Listens for `start_warmup_timer` commands; nudges agent when timer ends |
| `DrillChip` | Current drill + rep armed / capturing states |
| `RepScorecard` | Analysis results in sidebar |
| `NextTurnCue` | Contextual “your turn” copy (warm-up timer, setup, reps) |
| `VoiceQuickPrompts` | Chips: I'm ready, Wrap up, Repeat that, Next drill |

## Key hooks (`src/hooks/`)

| Hook | Role |
|---|---|
| `useLiveSession` | Anonymous auth, session doc, Firestore subscription |
| `usePeekFrameUploader` | JPEG every ~2.5s → `/api/peek` |
| `useWarmupTimer` | `start_warmup_timer` commands → on-screen countdown |
| `useRepCapture` | `start_capture` / `stop_capture` commands → MediaRecorder |
| `useRepResultsPolling` | Refreshes rep analysis jobs |

## Testing

**Vercel only** — do not use local dev for QA on this project.

- **URL:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) (Buddy Tech Vercel login required)
- Push to `main` to deploy; verify via Vercel dashboard or MCP logs

Conversation UI design: [docs/UI-CONVERSATION-UX-PLAN.md](../../docs/UI-CONVERSATION-UX-PLAN.md).
