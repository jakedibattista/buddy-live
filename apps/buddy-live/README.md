# Buddy Live web app

Next.js 16 frontend — live coaching UI, ElevenLabs voice, rep capture, and Firestore session state.

See the [root README](../../README.md) for setup, architecture, and deploy. Vercel **Root Directory** for this repo is `apps/buddy-live`.

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing — Coach Puck hero, **dual-path preview** (scorecard + Hockey IQ), **Start practice** CTA |
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
| `MicVUMeter` | Microphone level visualizer |

### `iq/`

| Component | Role |
|---|---|
| `IqVisualCard` | Hockey IQ practice visuals (diagrams, answer capture) |

### `landing/`

| Component | Role |
|---|---|
| `LandingSessionPreview` | Static mocks on `/`: scored-rep **RepScorecard**-style panel + **IqVisualCard**-style breakaway drill |

## Design system

Shared landing + coach styling lives in `src/app/globals.css`:

- **Brand:** `--brand-blue` (`#0066cc`), `--brand-blue-hover` (`#0071e3`)
- **Layouts:** `.landing-page`, `.coach-shell` (vignette background)
- **Surfaces:** `.panel-surface`, `.btn-primary`, `.text-brand`, `.badge-brand`

Hidden agent-side messages (camera re-check, voice-reconnect, warm-up timer done) live in `src/lib/hiddenAgentMessages.ts` and are filtered out of the visible transcript.

## Key hooks (`src/hooks/`)

| Hook | Role |
|---|---|
| `useLiveSession` | Anonymous auth, session doc, Firestore subscription |
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
