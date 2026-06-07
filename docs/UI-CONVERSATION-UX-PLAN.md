# Buddy Live · Conversation UI & Mascot Plan

**Created:** 2026-05-24  
**Updated:** 2026-05-25  
**Source:** UI review against [Lovable’s chatbot UI guide](https://lovable.dev/guides/how-to-build-a-chatbot-ui), plus follow-up discussion on a live “talking puck” mascot.

**Status:** Phases 1–3 **shipped** (`ee8e1b1`, prompt polish `4a78321`). **Deferred:** interrupt / barge-in button (SDK has mute duck only — `CoachAudioMuteButton`). Hackathon assets: [`submission/`](submission/).

This doc preserves recommendations from that conversation and turns them into an execution plan. Buddy Live is **voice-first coaching** — the transcript and mascot support the session; they are not a standalone text chat product.

---

## Goals

1. Make silence during coaching feel intentional (thinking, speaking, analyzing — not broken).
2. Make the session readable as one sequential story (transcript + system events + reps).
3. Give every coach turn a clear implied next action for the player.
4. Add a puck mascot that feels alive and synced with Coach Buddy’s voice.
5. Improve error recovery so failures never dead-end the session.

---

## Current state (2026-05-25)

| Area | Today | Key files |
|------|--------|-----------|
| Voice | ElevenLabs WebRTC (primary) or WebSocket (signed URL) | `CoachConversation.tsx` |
| Transcript | User/coach bubbles + **system pills**, timestamps, activity row | `TranscriptPanel.tsx`, `lib/transcript.ts` |
| Drill context | `DrillChip` with **Rep armed** / **Now capturing** states | `DrillChip.tsx` |
| Rep progress | Scorecards + system lines (upload → analyze → scored) | `RepScorecard.tsx`, `coach/page.tsx` |
| Recording | **60s countdown**, **Stop & upload**, `stop_rep_capture` | `RecordingTimer.tsx`, `useRepCapture.ts` |
| Session phases | Sidebar **Phase:** label (`warmup` → `drill_readiness` → scored → `recap`) | `lib/phases.ts`, Firestore `currentPhase` |
| Next-turn cues | Contextual copy + **I'm ready** / **Wrap up** chips | `NextTurnCue.tsx`, `VoiceQuickPrompts.tsx` |
| Coach mute | Mute coach **output** via `setVolume({ volume: 0 })` | `CoachAudioMuteButton.tsx` |
| Errors | Retry connect + retry camera permission | `CoachConversation.tsx`, `coach/page.tsx` |
| Mascot | **CoachPuckAvatar** — volume-reactive mouth, celebrate on score | `CoachPuckAvatar.tsx`, `public/mascot/` |
| Session init | Loading state on session card; Start gated on `sessionReady` | `coach/page.tsx`, `useLiveSession.ts` |

ElevenLabs SDK already exposes: `isSpeaking`, `isListening`, `mode`, `getOutputByteFrequencyData()`, `onModeChange`, `onAudio`, `onAudioAlignment`.  
**Note:** Raw `onAudio` / alignment events do **not** fire on WebRTC (LiveKit handles playback). Frequency data **does** work on WebRTC. See [ElevenLabs client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events).

---

## Recommendations (prioritized)

### P0 — High impact

#### 1. Coach activity signals (“social silence” fix)

When the coach is working, show visible activity — silence after a question reads as disengagement in conversational UI.

- **Speaking:** indicator in transcript area + mascot animates
- **Listening:** idle / attentive state
- **Thinking** (connected, not speaking/listening — e.g. ADK tool calls): named state like “Coach Buddy is thinking…”

**Wire to:** `useConversationMode()` or `isSpeaking` / `mode` from `useConversation`.

#### 2. System message tier

Add `role: "system"` to `TranscriptEntry` and render neutral centered pills for non-dialogue events:

- Recording started / stopped
- Clip uploaded / upload failed
- Analysis started / complete (“See rep below”)
- Connection lost / reconnected
- Peek / visibility warnings (see decision #4)

Keeps sidebar feeling like one timeline instead of three disconnected panels.

#### 3. Error states with recovery

Every error answers: **what happened**, **why (briefly)**, **what to do next**. Never blame the user.

| Error | Message tone | Action |
|-------|----------------|--------|
| ElevenLabs connect fail | “Couldn’t connect to Coach Buddy” | **Retry** (re-run start) |
| Camera/mic denied | “Camera and mic are needed for coaching” | Guidance + retry |
| Clip upload fail | “Clip didn’t upload” | Retry or skip (if supported) |
| Analysis fail | “Couldn’t analyze that rep” | Retry refresh / continue |

#### 4. Clear next-turn cues

Extend drill-state UX so the player always knows whose turn it is:

- **Idle + connected:** e.g. “Say ‘ready’ when you’re set up”
- **Recording:** emphasize `DrillChip` (pulse, “Perform your rep now”)
- **Analyzing:** transcript system line + scorecard pulse (already partially there)

Optional: voice quick-prompt chips (“I’m ready”, “Wrap up”, “Repeat that”) — hints, not text input.

#### 5. Rep recording countdown + stop cue — **DECIDED**

Any clip recorded for upload to **modelforpuckbuddy** must show a clear **60-second countdown** on camera while `MediaRecorder` is active, plus an explicit **cue to stop recording** so the player controls when the clip ends (within the 60s cap).

| Today | Target |
|-------|--------|
| Auto-stop at **12s** (`useRepCapture` default `maxRepMs = 12_000`) | Auto-stop at **60s** max |
| Red **REC** badge only, no time | **REC + countdown** (1:00 → 0:00) |
| `stopRecording()` exported from hook but **not in UI** | **Stop recording** button visible while recording |
| `stop_capture` in types but **never handled** | Client handles `stop_capture` commands; optional ADK tool later |
| No ADK `stop_rep_capture` tool | Agent can stop via tool **or** player taps Stop |

**UX spec — timer:**
- Visible on camera overlay whenever `capture.recording === true`
- Count **down** from 1:00 → 0:00
- Optional: warn pulse in last 10s
- At 0: auto-stop → upload → transcript system line: “Recording stopped — uploading”

**UX spec — stop cue (player-initiated):**
- Prominent **Stop recording** control on camera while REC active (e.g. square stop icon next to timer — distinct from “End session”)
- Tap → `capture.stopRecording()` → same upload path as auto-stop
- Label: **“Stop & upload”** so intent is clear
- Minimum clip length (e.g. 1s) to avoid empty uploads — optional guard

**Voice-aligned flow (agent-initiated stop):**
- After player shoots, agent calls `analyze_rep` — recording should stop when clip is ready
- Add ADK **`stop_rep_capture(rep_id)`** → writes `stop_capture` command to Firestore → client stops recorder (same as UI button)
- Update `prompts.py`: after shot, call `stop_rep_capture` then `analyze_rep` (or document that UI stop + analyze is player-driven)

**Implementation checklist:**
- [x] `MAX_REP_RECORDING_MS = 60_000` shared constant
- [x] `useRepCapture`: default 60s; handle `stop_capture` commands in commands listener
- [x] `RecordingTimer.tsx`: countdown + stop button on camera overlay
- [x] `coach/page.tsx`: wire `capture.stopRecording` to button
- [x] (ADK) `stop_rep_capture` tool + prompt update for post-shot stop

**Files:** `useRepCapture.ts`, `CameraView.tsx` or `RecordingTimer.tsx`, `rep_capture.py`, `prompts.py`, `coach/page.tsx`

---

### P1 — Medium impact, low–medium effort

#### 6. Timestamps on transcript

`TranscriptEntry.ts` exists but is not rendered. Show relative time or session elapsed (hover or for messages >30s old).

#### 7. Split long coach messages

Break monologues at sentence boundaries (~200 chars) or merge rapid coach chunks within ~2s into one bubble group.

#### 8. Session initialization loading

Render `live.loading` — skeleton/spinner on session card; disable **Start session** until `sessionId` is ready.

#### 9. Transparency / trust cues

- First-connect disclosure: “Coach Buddy is AI. It can see your camera during drills.”
- Show `LiveSessionDoc.currentPhase` in sidebar when available
- Link transcript moments to rep scorecards where useful

#### 10. Interrupt / barge-in control

If ElevenLabs exposes interrupt on WebRTC path: **Stop coach** (mid-speech) distinct from **End session**. Verify SDK support before building.

---

### P2 — Mascot: live talking puck

#### Design intent

- **Clippy-style presence**, not a human avatar — matches trust guidance from the Lovable article (abstract mascot > photorealistic coach).
- **Primary job:** make voice turns feel social; secondary: brand personality.
- **Placement:** camera overlay (corner), not transcript sidebar — keeps eyes on drill.

#### Implementation tiers

| Tier | Behavior | Effort | Target |
|------|----------|--------|--------|
| **v1** | Puck visible when connected; bounce on `isSpeaking`; idle on listen | ~0.5 day | Ship first |
| **v2** | Mouth / squash driven by `getOutputByteFrequencyData()` in `requestAnimationFrame` loop | ~1–2 days | **Recommended “live talking” feel** |
| **v3** | Syllable sync via `onAudioAlignment` (WebSocket path only) | Several days | Defer unless WS becomes primary |
| **v4** | Rive/phoneme lip-sync | 1–2+ weeks | Skip for now |

#### Mascot behavior map

| State | Animation |
|-------|-----------|
| Disconnected | Hidden or dim “sleeping” |
| Connecting | Subtle pulse |
| Speaking | Volume-reactive mouth + gentle bounce (v2) |
| Listening | Slow hover, closed mouth, attentive |
| Thinking | Wobble / “…” while connected but not speaking/listening |
| Recording drill | Shrink or dim — `DrillChip` owns the moment |
| Rep complete | Quick celebratory flip (optional v2+) |

#### Technical notes

- Component: `CoachPuckAvatar` under `ConversationProvider` (sibling to controls or overlay on camera).
- Use `useConversationMode()` for perf (granular hook vs full `useConversation`).
- WebRTC: use `getOutputByteFrequencyData()` — do **not** depend on `onAudio` for primary path.
- Hide or minimize during `capture.recording` so mascot doesn’t cover stick/body framing.

---

## Explicitly out of scope (for now)

| Item | Reason |
|------|--------|
| Text input + send box | Voice-first product; adds complexity unless accessibility requires it |
| Token streaming in transcript | User hears streamed TTS; lower value unless silent/read-only mode |
| Generic support-bot quick replies | Prefer drill-specific voice prompts |
| Persistent chat history in Firestore | Product decision — reps + session may be enough for v1 |
| Full-height chat layout | Camera-first layout is correct for this product |
| Photorealistic human coach avatar | Trust mismatch with AI capability |

---

## Execution phases

### Phase 1 — Foundation (P0, no mascot asset required) — **DONE**

**Goal:** Conversation feels alive and recoverable without new art.

- [x] Extend `TranscriptEntry` with `role: "system"` (+ optional `kind` for event type)
- [x] Update `TranscriptPanel` — system pills, coach activity row (thinking/speaking/listening)
- [x] Wire activity state from `useConversationMode()` in `CoachActivityIndicator`
- [x] Setup framing gate: peek returns `full_body_in_frame` + `facing_camera`; agent re-peeks until pass
- [x] Write peek status to session doc; UI banner during setup until framing passes
- [x] Error recovery UI in `CoachConversation` (retry connect) and permission overlay (retry media)
- [x] Render `live.loading`; gate Start until session ready
- [x] Next-turn cue copy tied to phase, recording, analyzing, `results_ready_at`
- [x] **60s recording countdown** + **Stop & upload** button; handle `stop_capture` commands

**Files likely touched:**

- `apps/buddy-live/src/lib/types.ts`
- `apps/buddy-live/src/components/TranscriptPanel.tsx`
- `apps/buddy-live/src/components/CoachConversation.tsx`
- `apps/buddy-live/src/app/coach/page.tsx`
- New: `apps/buddy-live/src/hooks/useCoachActivity.ts` (optional)
- New: `apps/buddy-live/src/components/CoachActivityIndicator.tsx` (optional)

### Phase 2 — Mascot v1 + v2 — **DONE**

**Goal:** Talking puck on camera overlay, volume-synced mouth.

- [x] Add mascot asset (`public/mascot/coach-puck.png`)
- [x] New `CoachPuckAvatar.tsx` — baked-face PNG crossfade (neutral ↔ speak)
- [x] Mount on camera column in `coach/page.tsx`
- [x] v1: `isSpeaking` bounce
- [x] v2: `getOutputByteFrequencyData()` → mouth open / scaleY squash
- [x] Dim during recording
- [x] Celebrate on rep `completed`

**Files likely touched:**

- New: `apps/buddy-live/src/components/CoachPuckAvatar.tsx`
- New: `apps/buddy-live/public/mascot/coach-puck-speak.png` (mouth-open frame)
- `apps/buddy-live/src/app/coach/page.tsx`

### Phase 3 — Polish (P1) — **DONE**

- [x] Transcript timestamps (clock + elapsed after 30s)
- [x] Long message splitting (`splitLongMessage` in `lib/transcript.ts`)
- [x] ~~First-connect AI + camera disclosure~~ — skipped by decision
- [x] `currentPhase` in sidebar
- [x] Voice quick-prompt chips (`I'm ready`, `Wrap up`, `Repeat that`)
- [x] Coach output mute button (`CoachAudioMuteButton`)
- Interrupt button — **deferred** (mute ships instead; see status above)

---

## Decisions & assets — **locked**

### 1. Mascot art — **DONE**

**Chosen asset:** 3D rendered BUDDY puck (1024×1024 source).

| Path | Notes |
|------|--------|
| `public/mascot/puck.png` | Source master (~926KB RGB) |
| `public/mascot/coach-puck.png` | **Neutral face** — charcoal eyes, subtle smirk; baked into 3D puck texture (RGBA, checkerboard keyed out) |
| `public/mascot/coach-puck-speak.png` | **Speak frame** — same puck, mouth slightly open |

**Animation:** Crossfade neutral ↔ speak PNGs driven by `getOutputByteFrequencyData()`; no SVG overlay (avoids emoji-sticker look on a photo-real puck). Optional `scaleY` squash while speaking.

### 2. Mascot placement — **DECIDED**

Bottom-left of camera overlay (inside `ConversationProvider` so ElevenLabs hooks work).

### 3. Voice quick-prompt chips — **DECIDED: Include**

Phase 3. Drill-focused hints: “I’m ready”, “Wrap up”, “Repeat that”.

### 4. Peek / setup framing — **DECIDED**

**Product gate (agent + live):** Before any rep recording, Coach Buddy must confirm the player is **facing the camera** and **fully in frame — head through legs visible**. Only after framing passes does the agent ask **“Ready to start?”** and move into the drill explainer / rep loop.

This replaces vague “I don’t see you” loops with a clear setup checklist.

#### Desired setup flow (updated 2026-05-25)

```
Drill picked (set_focus_drill)
    → Warm-up (~2 min, timed moves — see below)
    → Setup: peek_camera (repeat until pass) — coach SPEAKS fixes ("can't see your feet yet")
    → Pass: full_body_in_frame + facing_camera → phase: drill_readiness
    → Agent: "Explain the drill or practice rep first?"
    → Player ready → rep 1 (start_rep_capture + "Rep 1 of five — recording when you shoot")
    → … scored reps + IQ while analyzing …
    → results_ready_at → Wrap up → end_session_recap
```

#### Warm-up (timed moves + vision feedback) — **DONE (2026-05-25)**

Replaces jargon-heavy rep-count warm-up with **one move at a time**, plain language, and visible feedback.

| Move | Duration | On-screen label |
|------|----------|-----------------|
| Arm circles | 20s | Arm circles |
| High knees | 30s | High knees |
| Stick wipers | 20s | Stick wipers |
| Shadow shot (drill-specific) | 30s | Shadow wrist / slap / backhand |

**Loop per move:**
1. Coach **demos the move in plain words** (required for ages 10 and under — never label-only).
2. Agent calls **`start_warmup_timer(exercise, duration_seconds, label)`** → amber **m:ss** countdown on camera (`CountdownOverlay`).
3. Timer ends → client nudges agent → **`peek_warmup(exercise)`** → coach says "looks good" or one simple fix aloud.
4. Sidebar: `NextTurnCue` + system transcript ("Time's up — …", "Warm-up move looked good").

**Spoken demo example (stick wipers, ~9yo):** "Hold your stick out in front. Tap it left, then right, like wiping a windshield — twenty seconds." The label "Stick wipers" is for the timer only.

| Layer | Change |
|-------|--------|
| `warmup_timer.py` | `start_warmup_timer` → Firestore `start_warmup_timer` command |
| `peek_warmup.py` | Vision check per move; does not advance setup framing |
| `CountdownOverlay.tsx` | Shared m:ss UI (warm-up amber + REC red) |
| `WarmupTimerBridge.tsx` | Command listener + auto nudge to peek when timer hits 0 |
| `prompts.py` | Timed warm-up script + SPOKEN DEMO lines for ages ≤10 |

#### Setup framing — voice-led — **DONE (2026-05-25)**

- Fail → coach tells player out loud (e.g. "I can't see your feet yet — step back"). No reliance on a persistent camera overlay for the fix.
- `peek_camera` only after warm-up (unless player asks mid-session).
- `peek_camera` ignored for phase/framing while `currentPhase === warmup`.

#### Voice reconnect — **DONE (Updated 2026-05-27)**

ElevenLabs voice can drop while the Firebase session continues (e.g., due to automatic inactivity/silence timeout). `CoachConversation` auto-reconnects (backoff, up to 5 tries) seamlessly:
- **Authorization & Security Fix:** Removed unauthorized ElevenLabs client-side `overrides` (like custom `firstMessage`) that previously triggered instant WebSocket connection failures on client reconnect due to restricted dashboard permissions.
- **Backend Reconnect Detection:** When the client reconnects, the ADK backend (`main.py`) detects if the `session_id` already exists in `InMemorySessionService`. If it does, it suppresses the default welcome/greeting by sending a silent `"(voice connection restored - wait for user to speak)"` system prompt.
- **Seamless State Resume:** 500ms after connecting, the client sends a hidden reconnect context message containing `focusDrill`, `currentPhase`, `repCount`, and `setupFramingPassed` to let Coach Buddy continue the session exactly where it left off without starting over. Manual end (red phone) does not auto-reconnect.

#### Legacy setup flow note (2026-05-25 AM)

```
Drill picked (set_focus_drill)
    → Warm-up (3–5 min, no recording)
    → Agent: "Step back so I can see you head to toes…"
    → peek_camera (repeat until pass)
    ...
```

Superseded by timed warm-up + voice-led setup above.

#### What “pass” means (new validation criteria)

| Field | Pass condition |
|-------|----------------|
| `person_visible` | Human clearly present |
| `full_body_in_frame` | **Head and both legs/feet visible** in frame (not upper-body-only) |
| `facing_camera` | Torso/face generally toward camera (not turned away) |
| `stick_visible` | Nice-to-have for setup; coach can prompt if missing |

**Fail → coach gives one concrete adjustment** (“step back”, “tilt the laptop”, “show your feet”), re-peeks. **Do not** proceed to recording or say “let’s go anyway” while framing fails. Coach speaks the fix — player hears Coach Buddy, not only UI text.

#### Code / prompt changes — **DONE**

| Layer | Change |
|-------|--------|
| `peek_camera.py` | Structured vision prompt; `full_body_in_frame`, `facing_camera`, `setup_framing_passed`; phase → `drill_readiness` on pass |
| `prompts.py` | Full session arc: warm-up → setup → drill readiness → scored reps → IQ → recap |
| `LiveSessionDoc` / types | Peek fields, `currentPhase`, `results_ready_at`, `camera_hint` |
| UI | Phase label, next-turn cues, warm-up timer overlay, voice reconnect, quick prompts |

#### What we are NOT doing

- Mid-drill persistent peek banner (framing is a **setup gate**, not ongoing nagging)
- Proceeding when peek fails (“but let’s go anyway”)
- Stick-required as hard blocker if body is framed (prompt can still ask for stick)

**Engineering note (resolved):** peek gate tightened in `e08cf9b` / `ee8e1b1`. Agent no longer proceeds when framing fails.

### 5. First-connect disclosure — **DECIDED: Skip**

### 6. Text input fallback — **DECIDED: Defer**

### 7. Transcript persistence — **DECIDED: In-memory only**

Rep scores, session metadata, clips, and analysis `results` remain in **Firestore** — only the voice transcript log is ephemeral.

---

## Success criteria (how we know it worked)

- [x] During ADK/tool latency, user sees “thinking” — not a frozen UI
- [x] User can recover from connection error without refreshing the page
- [x] Voice auto-reconnects on unexpected ElevenLabs drop (resume session, not re-onboarding)
- [x] Warm-up uses on-screen timer + verbal peek feedback per move
- [x] Transcript tells the story: said → recorded → uploaded → analyzed → scored
- [x] During a drill, user knows whether to speak, perform, or wait
- [x] While recording, user sees **60s countdown**, can tap **Stop & upload**, clip auto-stops at limit
- [x] Puck visibly reacts while Coach Buddy speaks (volume-reactive mouth)
- [x] Mascot does not obstruct camera framing during rep capture
- Interrupt mid-speech — **deferred** (mute button ships instead)

---

## References

- [Lovable — How to Build a Chatbot UI](https://lovable.dev/guides/how-to-build-a-chatbot-ui) — sequential disclosure, turn-taking, typing indicators, error recovery, avatar trust
- [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react) — `isSpeaking`, `getOutputByteFrequencyData()`, hooks
- [ElevenLabs client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events) — WebRTC vs WebSocket audio event behavior
- Prior handoff: [`handoffs/2026-05-24-handoff.md`](handoffs/2026-05-24-handoff.md) (peek visibility, drill flow)

