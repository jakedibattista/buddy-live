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
| `CoachConversation` | ElevenLabs WebRTC connect, retry on failure |
| `CoachVoiceShell` | Wraps grid in `ConversationProvider` for SDK hooks |
| `TranscriptPanel` | User/coach bubbles, system pills, activity row |
| `CoachActivityIndicator` | Speaking / listening / thinking |
| `CoachPuckAvatar` | Talking puck mascot — baked-face PNG crossfade (neutral ↔ speak), volume-synced |
| `CoachAudioMuteButton` | Mute coach output volume |
| `CameraView` | Webcam preview, REC overlay, setup banner |
| `RecordingTimer` | 60s countdown + Stop & upload |
| `DrillChip` | Current drill + rep armed / capturing states |
| `RepScorecard` | Analysis results in sidebar |
| `NextTurnCue` | Contextual “your turn” copy |
| `VoiceQuickPrompts` | Chips: I'm ready, Wrap up, Repeat that, Next drill |

## Key hooks (`src/hooks/`)

| Hook | Role |
|---|---|
| `useLiveSession` | Anonymous auth, session doc, Firestore subscription |
| `usePeekFrameUploader` | JPEG every ~2.5s → `/api/peek` |
| `useRepCapture` | `start_capture` / `stop_capture` commands → MediaRecorder |
| `useRepResultsPolling` | Refreshes rep analysis jobs |

## Testing

- **Vercel (recommended):** Firebase env vars are configured on the project. URL: [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) (Buddy Tech login required).
- **Local:** Copy env from Vercel or fill `apps/buddy-live/.env.local` — needs both `NEXT_PUBLIC_FIREBASE_*` and server `FIREBASE_ADMIN_*`.

Conversation UI design: [docs/UI-CONVERSATION-UX-PLAN.md](../../docs/UI-CONVERSATION-UX-PLAN.md).
