# Buddy Live — ADK 1-pager (Devpost / judges)

**Live demo:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) (Vercel deployment protection — Buddy Tech login)

**Repo:** [github.com/jakedibattista/buddy-live](https://github.com/jakedibattista/buddy-live)

---

## What it is

Buddy Live is a **real-time AI hockey coach** for kids practicing off-ice. The player talks through a mic, the coach watches via webcam, guides warm-up and drill setup, captures **one scored rep**, runs biomechanics analysis on the clip, reviews the scorecard over voice, and wraps with homework.

Built for the **Google Cloud / Devpost ADK hackathon** — **Track 2 (Optimize)**.

---

## Why hybrid architecture (not Gemini Live end-to-end)

- **Voice:** ElevenLabs Agents — WebRTC duplex audio, turn detection, TTS quality/latency.
- **Brain:** Google ADK 2.0 on Cloud Run — Gemini Flash, tool calling, sub-agent orchestration.
- **Shot analysis:** Existing `modelforpuckbuddy` pipeline (MediaPipe + Roboflow + Coach Seth) — Gemini Live’s 1 FPS video cap cannot catch a ~150–300 ms wristshot release.

ElevenLabs hits our ADK service via **Custom LLM** using **OpenAI-compatible SSE** (`/chat/completions`). The model inside ADK is still Gemini Flash; only the wire format is OpenAI-shaped.

---

## How we use Google ADK

| ADK primitive | Buddy Live usage |
| --- | --- |
| **`Agent` + `sub_agents`** | Root `buddy_live_coach` delegates to `drill_coach`, `iq_coach` via `transfer_to_agent` |
| **`Runner` + `SessionService`** | `InMemorySessionService`; ElevenLabs `arbitrary_identifier` → ADK `session_id` |
| **Tools (16)** | Firestore commands, vision peeks, rep capture, analysis queue, IQ visuals, drill knowledge, memory |
| **`before_tool_callback`** | `phase_guard` — structural phase gates on root + all sub-agents (Firestore-backed) |
| **Streaming** | ADK SSE events → OpenAI-style chunks → ElevenLabs TTS |

### Sub-agent split

| Agent | Owns |
| --- | --- |
| **Root** | Opening, space check, drill pick, warm-up timers, `remember_player_profile` |
| **drill_coach** | One scored rep, analysis wait, scorecard review, grounded recap |
| **iq_coach** | Hockey IQ practice when the player has no space to shoot |

### Tools (15)

`lookup_warmup_moves`, `start_warmup_timer`, `set_focus_drill`, `start_rep_capture`, `stop_rep_capture`, `analyze_rep`, `get_rep_result`, `recommend_drill`, `end_session_recap`, `lookup_drill_knowledge`, `set_iq_question_goal`, `show_iq_visual`, `mark_iq_answer`, `remember_player_profile`, `load_player_memory`

> **Note:** `load_player_memory` (returning-player welcome-back) is wired but **not called** in the current opening prompt — production flow uses `remember_player_profile` only. Prior sessions are summarized in `session_summaries/` for analytics; voice welcome-back is deferred.

### Structural guardrails (`phase_guard`)

Code-enforced gates (not prompt-only): `set_focus_drill` once per session, `show_iq_visual` only in IQ mode, rep capture/analysis require verbal setup + drill, single-rep policy. No webcam vision tools — setup and warm-up are verbal. Tests: `services/buddy-live-adk/tests/test_phase_guard.py`.

---

## Track 2 — optimization workflow

| Phase | Shipped |
| --- | --- |
| **Eval + simulation** | Synthetic players + mocked tools (`make eval`, `make eval-failures`) |
| **Observability** | OpenTelemetry → Cloud Trace (`buddy_live.turn` spans) |
| **Grounding** | Vertex AI Search corpus + `lookup_drill_knowledge` |
| **Memory** | `session_summaries/` + `remember_player_profile` (per-browser `user_id`) |
| **Multi-agent** | Root + 3 specialists |
| **Optimizer** | GEPA run completed; seed prompt retained (sub-agent splits beat optimizer output) |

---

## Proof of real sessions

| Session | Date | Flow | Evidence |
| --- | --- | --- | --- |
| **`live-3oxrisz06vae`** | 2026-06-03 | Full shooting: wristshot → 1 rep → recap | `session_summaries/live-3oxrisz06vae` — `rep_count: 1`, scores populated, `weakest_metric: topHand` |
| **`live-c6vkymv41exc`** | 2026-06-07 | IQ practice path | `live_sessions` — `currentPhase: iq_practice`, `iq_question_goal: 8` |

(`live_sessions/` docs expire ~24h; `session_summaries/` persist for review.)

---

## Stack

Google ADK 2.0 · Gemini Flash · Firebase (Firestore + Storage) · Cloud Run · ElevenLabs · Next.js · Vercel · Vertex AI Search · Sentry · Cloud Trace
