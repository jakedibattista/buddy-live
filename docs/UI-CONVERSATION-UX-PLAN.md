# Buddy Live · Conversation UI & Mascot Plan

**Created:** 2026-05-24  
**Source:** UI review against [Lovable’s chatbot UI guide](https://lovable.dev/guides/how-to-build-a-chatbot-ui), plus follow-up discussion on a live “talking puck” mascot.

This doc preserves recommendations from that conversation and turns them into an execution plan. Buddy Live is **voice-first coaching** — the transcript and mascot support the session; they are not a standalone text chat product.

---

## Goals

1. Make silence during coaching feel intentional (thinking, speaking, analyzing — not broken).
2. Make the session readable as one sequential story (transcript + system events + reps).
3. Give every coach turn a clear implied next action for the player.
4. Add a puck mascot that feels alive and synced with Coach Buddy’s voice.
5. Improve error recovery so failures never dead-end the session.

---

## Current state (baseline)

| Area | Today | Key files |
|------|--------|-----------|
| Voice | ElevenLabs WebRTC (primary) or WebSocket (signed URL) | `apps/buddy-live/src/components/CoachConversation.tsx` |
| Transcript | Read-only bubbles, user right / coach left, no timestamps | `apps/buddy-live/src/components/TranscriptPanel.tsx` |
| Drill context | `DrillChip` on camera overlay | `apps/buddy-live/src/components/DrillChip.tsx` |
| Rep progress | Named states on scorecards (“Analyzing”, etc.) | `apps/buddy-live/src/components/RepScorecard.tsx` |
| Errors | Inline red text, no retry | `CoachConversation.tsx`, `coach/page.tsx` |
| Mascot | None — no brand asset in repo yet | — |
| Session init | `live.loading` from hook not rendered | `apps/buddy-live/src/hooks/useLiveSession.ts`, `coach/page.tsx` |

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

Optional: voice quick-prompt chips (“I’m ready”, “Repeat that”, “Next drill”) — hints, not text input.

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
- [ ] `MAX_REP_RECORDING_MS = 60_000` shared constant
- [ ] `useRepCapture`: default 60s; handle `stop_capture` commands in commands listener
- [ ] `RecordingTimer.tsx`: countdown + stop button on camera overlay
- [ ] `coach/page.tsx`: wire `capture.stopRecording` to button
- [ ] (ADK) `stop_rep_capture` tool + prompt update for post-shot stop

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

### Phase 1 — Foundation (P0, no mascot asset required)

**Goal:** Conversation feels alive and recoverable without new art.

- [ ] Extend `TranscriptEntry` with `role: "system"` (+ optional `kind` for event type)
- [ ] Update `TranscriptPanel` — system pills, coach activity row (thinking/speaking/listening)
- [ ] Wire activity state from `useConversationMode()` in a small hook or child component
- [ ] Setup framing gate: peek returns `full_body_in_frame` + `facing_camera`; agent re-peeks until pass, then asks “ready to start?”
- [ ] Write `last_peek_result` to session doc; UI banner during setup until framing passes
- [ ] Error recovery UI in `CoachConversation` (retry connect) and permission overlay (retry media)
- [ ] Render `live.loading`; gate Start until session ready
- [ ] Next-turn cue copy tied to `coachStatus`, `capture.recording`, rep analyzing state
- [ ] **60s recording countdown** + **Stop & upload** button on camera during rep capture; align `maxRepMs` to 60_000; handle `stop_capture` commands

**Files likely touched:**

- `apps/buddy-live/src/lib/types.ts`
- `apps/buddy-live/src/components/TranscriptPanel.tsx`
- `apps/buddy-live/src/components/CoachConversation.tsx`
- `apps/buddy-live/src/app/coach/page.tsx`
- New: `apps/buddy-live/src/hooks/useCoachActivity.ts` (optional)
- New: `apps/buddy-live/src/components/CoachActivityIndicator.tsx` (optional)

### Phase 2 — Mascot v1 + v2

**Goal:** Talking puck on camera overlay, volume-synced mouth.

- [ ] Add mascot asset (see **Decisions & assets** below)
- [ ] New `CoachPuckAvatar.tsx` — SVG preferred for mouth animation
- [ ] Mount on camera column in `coach/page.tsx` with z-index / pointer-events rules
- [ ] v1: `isSpeaking` bounce
- [ ] v2: `getOutputByteFrequencyData()` → mouth open / scaleY squash
- [ ] Dim/hide during recording
- [ ] Optional: celebrate on rep `completed`

**Files likely touched:**

- New: `apps/buddy-live/src/components/CoachPuckAvatar.tsx`
- New: `apps/buddy-live/public/coach-puck.svg` (if not inline SVG)
- `apps/buddy-live/src/app/coach/page.tsx`

### Phase 3 — Polish (P1)

- [ ] Transcript timestamps
- [ ] Long message splitting
- [ ] First-connect AI + camera disclosure
- [ ] `currentPhase` in sidebar
- [ ] Voice quick-prompt chips (if approved)
- [ ] Interrupt button (if SDK supports on WebRTC)

---

## Decisions & assets — **need your input**

Loop back on these before or during implementation. Blockers marked **BLOCKER**.

### 1. Mascot art — **provided (needs transparency fix)**

**Chosen asset:** 3D rendered BUDDY puck (1024×1024 PNG).

| Path | Notes |
|------|--------|
| Cursor assets: `assets/image-3e27d5da-0069-42b9-94b1-fd33c18e59a3.png` | Best brand match; knurled side, tilted 3D look |
| Target in repo: `apps/buddy-live/public/mascot/coach-puck.png` | Copy on Phase 2 implementation |

**Important:** File is **RGB PNG (~990KB), not SVG** — the checkerboard is **baked into the pixels**, not a real alpha channel. Before overlay on camera, either:
- Re-export from source with **transparent background** (preferred), or
- We run a one-time background removal when copying into `public/mascot/`.

**Animation plan unchanged:** PNG body + inline SVG mouth/eyes overlay; volume-reactive squash via `getOutputByteFrequencyData()`.

### 2. Mascot placement

**Default:** bottom-left of camera — confirm or override.

### 3. Voice quick-prompt chips — **DECIDED: Include**

Phase 3. Drill-focused hints: “I’m ready”, “Repeat that”, “Next drill”.

### 4. Peek / setup framing — **DECIDED**

**Product gate (agent + live):** Before any rep recording, Coach Buddy must confirm the player is **facing the camera** and **fully in frame — head through legs visible**. Only after framing passes does the agent ask **“Ready to start?”** and move into the drill explainer / rep loop.

This replaces vague “I don’t see you” loops with a clear setup checklist.

#### Desired setup flow

```
Drill picked (set_focus_drill)
    → Agent: "Step back so I can see you head to toes, stick in hand, facing the camera."
    → peek_camera (repeat until pass OR player adjusts)
    → Pass: full_body_in_frame + facing_camera
    → Agent: brief form tip if needed, then "Ready to start?"
    → Player confirms → drill explainer → rep 1 (start_rep_capture)
```

#### What “pass” means (new validation criteria)

| Field | Pass condition |
|-------|----------------|
| `person_visible` | Human clearly present |
| `full_body_in_frame` | **Head and both legs/feet visible** in frame (not upper-body-only) |
| `facing_camera` | Torso/face generally toward camera (not turned away) |
| `stick_visible` | Nice-to-have for setup; coach can prompt if missing |

**Fail → coach gives one concrete adjustment** (“step back”, “tilt the laptop”, “show your feet”), re-peeks. **Do not** proceed to recording or say “let’s go anyway” while framing fails.

#### Code / prompt changes (execution)

| Layer | Change |
|-------|--------|
| `peek_camera.py` | Extend Gemini prompt + parser: `FULL_BODY`, `FACING`, write `last_peek_result` to Firestore session doc |
| `prompts.py` | Setup step: loop peek until pass; gate `start_rep_capture` on player “ready” after framing OK |
| `LiveSessionDoc` / types | `last_peek_result?: { person_visible, full_body_in_frame, facing_camera, stick_visible, setup, at }` |
| UI (Phase 1) | During setup only: camera banner — “Step back — head to toes in frame” until `full_body_in_frame && facing_camera`; transcript system lines on peek pass/fail |
| UI quick-prompt | “I’m ready” chip appears **after** framing pass |

#### What we are NOT doing

- Mid-drill persistent peek banner (framing is a **setup gate**, not ongoing nagging)
- Proceeding when peek fails (“but let’s go anyway”)
- Stick-required as hard blocker if body is framed (prompt can still ask for stick)

**Open engineering note:** `peek_camera` currently only returns `person_visible` / `stick_visible` and allows “sitting at a desk” as pass — too lenient for this gate. Tighten vision prompt + agent instructions together.

### 5. First-connect disclosure — **DECIDED: Skip**

### 6. Text input fallback — **DECIDED: Defer**

### 7. Transcript persistence — **DECIDED: In-memory only**

Rep scores, session metadata, clips, and analysis `results` remain in **Firestore** — only the voice transcript log is ephemeral.

---

## Success criteria (how we know it worked)

- [ ] During ADK/tool latency, user sees “thinking” — not a frozen UI
- [ ] User can recover from connection error without refreshing the page
- [ ] Transcript tells the story: said → recorded → uploaded → analyzed → scored
- [ ] During a drill, user knows whether to speak, perform, or wait
- [ ] While recording, user sees **60s countdown**, can tap **Stop & upload**, clip auto-stops at limit
- [ ] Puck visibly reacts while Coach Buddy speaks (v2: mouth moves with voice energy)
- [ ] Mascot does not obstruct camera framing during rep capture

---

## References

- [Lovable — How to Build a Chatbot UI](https://lovable.dev/guides/how-to-build-a-chatbot-ui) — sequential disclosure, turn-taking, typing indicators, error recovery, avatar trust
- [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react) — `isSpeaking`, `getOutputByteFrequencyData()`, hooks
- [ElevenLabs client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events) — WebRTC vs WebSocket audio event behavior
- Prior handoff: `2026-05-24-handoff.md` (peek visibility, drill flow)

---

## Next step

1. **You:** Confirm mascot **bottom-left** placement; optionally re-export puck PNG with real transparency.
2. **Implementation:** Say **“execute Phase 1”** or **“execute all”** to build against this doc.
