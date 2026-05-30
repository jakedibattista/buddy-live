# Buddy Live web app

Next.js 16 frontend — live coaching UI, ElevenLabs voice, rep capture, and Firestore session state.

See the [root README](../../README.md) for setup, architecture, and deploy. Vercel **Root Directory** for this repo is `apps/buddy-live`.

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing — Coach Puck hero, session preview, **Start practice** CTA |
| `/coach` | Live session (camera, voice, transcript, reps) |

## Components (`src/components/`)

Grouped by feature area:

### `coach/`

| Component | Role |
|---|---|
| `CoachConversation` | ElevenLabs WebRTC connect, **auto-reconnect** on drop, retry on failure |
| `CoachVoiceShell` | Wraps grid in `ConversationProvider` for SDK hooks |
| `TranscriptPanel` | User/coach bubbles, system pills, activity row |
| `CoachActivityIndicator` | Speaking / listening / thinking |
| `CoachPuckAvatar` | Talking puck mascot — baked-face PNG crossfade (neutral ↔ speak), volume-synced |
| `CoachAudioMuteButton` | Mute coach output volume |
| `DrillChip` | Current drill + rep armed / capturing states |
| `RepScorecard` | Analysis results in sidebar |
| `NextTurnCue` | Contextual “your turn” copy (warm-up timer, setup, reps) |
| `VoiceQuickPrompts` | Chips: I'm ready, Wrap up, Repeat that |
| `WarmupTimerBridge` | Listens for `start_warmup_timer` commands; nudges agent when timer ends |

### `camera/`

| Component | Role |
|---|---|
| `CameraView` | Webcam preview |
| `CountdownOverlay` | Shared **m:ss** countdown UI (amber warm-up + red REC variants; pulses urgent ≤5s) |
| `RecordingTimer` | 60s REC countdown + Stop & upload |
| `CameraPeekNudge` | Fallback: re-pings `peek_camera` via `vision_coach` if verbal setup stalls > ~10s |
| `FramingIndicator` | Soft amber "out of frame" pill when a fallback peek fails after initial setup |
| `MicVUMeter` | Microphone level visualizer |

### `iq/`

| Component | Role |
|---|---|
| `IqVisualCard` | Hockey IQ practice visuals (diagrams, answer capture) |

### `landing/`

| Component | Role |
|---|---|
| `LandingSessionPreview` | Static coach-session mock on the landing page (REC timer, puck, score bars) |

Hidden agent-side messages (camera re-check, voice-reconnect, warm-up timer done) live in `src/lib/hiddenAgentMessages.ts` and are filtered out of the visible transcript.

## Key hooks (`src/hooks/`)

| Hook | Role |
|---|---|
| `useLiveSession` | Anonymous auth, session doc, Firestore subscription |
| `usePeekFrameUploader` | JPEG every ~2.5s → `/api/peek` (drops to 1.5s while a warm-up timer is active, to fill the ring buffer for `peek_warmup`) |
| `useWarmupTimer` | `start_warmup_timer` commands → on-screen countdown |
| `useRepCapture` | `start_capture` / `stop_capture` commands → MediaRecorder → signed-URL upload **direct to Firebase Storage** (avoids Vercel's 4.5 MB body limit), then finalises via `/api/clips/upload` |
| `useRepResultsPolling` | Refreshes rep analysis jobs |

## Shared lib

| File | Role |
|---|---|
| `lib/drills.ts` | Maps voice/UI drill names → canonical `DrillId` for analyze (sync with backend `rep_capture`) |
| `lib/types.ts` | Firestore/session TypeScript types |
| `lib/paths.ts` | Firestore doc paths and Storage layout |

## Testing

**Vercel only** — do not use local dev for QA on this project.

- **URL:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) (Buddy Tech Vercel login required)
- Push to `main` to deploy; verify via Vercel dashboard or MCP logs

Conversation UI design: [docs/UI-CONVERSATION-UX-PLAN.md](../../docs/UI-CONVERSATION-UX-PLAN.md).
