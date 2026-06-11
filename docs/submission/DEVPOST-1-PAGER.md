# Buddy Live — ADK 1-pager (Devpost / judges)

**Live demo:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) (Vercel deployment protection — Buddy Tech login)

**Repo:** [github.com/jakedibattista/buddy-live](https://github.com/jakedibattista/buddy-live)

---

## What it is

Buddy Live is a **real-time AI hockey coach** for kids practicing off-ice. The player talks through a mic, the coach watches via webcam, guides warm-up and drill setup, captures **one scored rep**, runs biomechanics analysis on the clip, reviews the scorecard over voice, and wraps with homework.

Built for the **Google Cloud / Devpost ADK hackathon** — **Track 2 (Optimize)**.

---

## The business case

**Thousands of kids already use the PuckBuddy app** — upload a clip, get a biomechanics scorecard. The #1 thing they asked for: **less reading, fewer button clicks, more coach**. Kids don't want to parse a report card; they want someone in the room saying "lower your knee, shoot again."

- **The market:** Youth hockey parents routinely pay **$80–150/hour** for private shooting coaches — when they can find one. Buddy Live delivers a guided, scored practice session in a basement for the marginal cost of Gemini Flash tokens and voice minutes (cents per session).
- **The wedge:** PuckBuddy's existing user base and analysis API. Buddy Live isn't a cold-start product — it's the interactive layer those users asked for, an obvious subscription upsell on an app families already trust.
- **The bigger bet — AI as a force for learning and health:** the same loop that gets a kid moving (talk → try → get scored → try again) is a learning loop. Hockey IQ mode already turns "no space to shoot" into a Socratic whiteboard session. Voice-first AI coaching makes deliberate practice — physical and cognitive — accessible to kids who'd otherwise get neither.

---

## Track 2 — the headline: eval-gated refactoring beat prompt optimization

Our agent worked in a sandbox and struggled with real kids. We treated that as an engineering problem, not a prompting problem:

1. **Built the harness first** — ADK User Simulation (synthetic players) + Environment Simulation (every tool mocked, failure injection) — `make eval`, `make eval-failures`.
2. **Baselined**, then refactored the monolithic agent into **root + specialist sub-agents** (`drill_coach`, `iq_coach`), re-running the eval suite after every slice.
3. **Measured the structural fix — then stress-tested our own measurement.** A single before/after run showed scores jumping on three scenarios and dipping on two. Instead of shipping that table, we re-ran the full failure-injection suite multiple times on the identical post-split agent and found per-scenario LLM-judge variance of ±0.15–0.28 (e.g. framing struggle scored 0.88, 0.60, 0.79 across three runs of the same code). The "regressions" recovered with zero code changes — they were judge noise. **The stable signal: every case-run across every suite execution passed the quality gate (hallucinations_v1), and traces confirm correct root → sub-agent transfers.** Full run-by-run table in [JUDGE-TOOLKIT.md](./JUDGE-TOOLKIT.md).
4. **Verified with the Agent Optimizer (GEPA)** that prompt rewriting could not beat the structural fix: a full GEPA run scored validation 1.0 with `best_idx=0` — the optimizer confirmed our post-split seed prompt was already the optimum. We kept the architecture, not a generated prompt.
5. **Closed the loop on real humans** — four live kid sessions observed via Cloud Trace, Cloud Run logs, and Firestore, each producing root-caused fixes (results-ready push, unscoreable-rep honesty, portrait-camera capture, never narrating chain-of-thought to a 5-year-old). All shipped, redeployed, re-measured.
6. **Safety evaluation for a kids' product** — `safety_v1` via the Vertex Gen AI Eval service: **a perfect 1.0 on all six scenarios** at the 0.8 threshold (2026-06-11). Routing the eval judge through Application Default Credentials (while the agent keeps its Gemini API key) required a small ADK patch — `evals/adk_patches.py`.

---

## How we use Google ADK

| ADK primitive | Buddy Live usage |
| --- | --- |
| **`Agent` + `sub_agents`** | Root `buddy_live_coach` delegates to `drill_coach`, `iq_coach` via `transfer_to_agent` |
| **`Runner` + `SessionService`** | `InMemorySessionService`; ElevenLabs `arbitrary_identifier` → ADK `session_id` |
| **Tools (15)** | Firestore commands, rep capture, analysis queue, IQ visuals, drill knowledge, memory |
| **`before_tool_callback`** | `phase_guard` — structural phase gates on root + all sub-agents (Firestore-backed) |
| **User + Environment Simulation** | Synthetic players, mocked tools, failure injection — the Track 2 eval harness |
| **Agent Optimizer (GEPA)** | Validation harness for the sub-agent refactor (seed prompt confirmed optimal) |
| **Streaming** | ADK SSE events → OpenAI-style chunks → ElevenLabs TTS |

### Sub-agent split

| Agent | Owns |
| --- | --- |
| **Root** | Opening, space check, drill pick, warm-up timers, `remember_player_profile` |
| **drill_coach** | One scored rep, analysis wait, scorecard review, grounded recap |
| **iq_coach** | Hockey IQ practice when the player has no space to shoot |

### Structural guardrails (`phase_guard`)

Code-enforced gates (not prompt-only): `set_focus_drill` once per session, `show_iq_visual` only in IQ mode, rep capture/analysis require verbal setup + drill, single-rep policy. Tests: `services/buddy-live-adk/tests/test_phase_guard.py`.

---

## Why hybrid architecture (a deliberate Gemini Live trade-off)

- **Brain: Google ADK 2.0 + Gemini Flash on Cloud Run** — all reasoning, tool calling, and sub-agent orchestration.
- **Voice: ElevenLabs Agents** — WebRTC duplex audio, turn detection, TTS latency. It POSTs every turn to our ADK service via OpenAI-compatible SSE (`/chat/completions`); only the wire format is OpenAI-shaped, the model inside is Gemini.
- **Shot analysis: existing `modelforpuckbuddy` pipeline** (MediaPipe + Roboflow + Gemini coach summaries) — Gemini Live's 1 FPS video cap cannot catch a ~150–300 ms wristshot release, so high-FPS clips go to a dedicated analyzer.

Grounding via **Vertex AI Search** (`buddy-live-drills` corpus, 19 docs), observability via **Cloud Trace** (`buddy_live.turn` spans) + **Sentry**, memory via Firestore `session_summaries/`.

---

## Proof of real sessions

| Session | Date | Flow | Evidence |
| --- | --- | --- | --- |
| **`live-3oxrisz06vae`** | 2026-06-03 | Full shooting: wristshot → 1 rep → recap | `session_summaries/live-3oxrisz06vae` — `rep_count: 1`, scores populated, `weakest_metric: topHand` |
| **`live-c6vkymv41exc`** | 2026-06-07 | IQ practice path | `live_sessions` — `currentPhase: iq_practice`, `iq_question_goal: 8` |

(`live_sessions/` docs expire ~24h; `session_summaries/` persist for review.)

---

## Stack

Google ADK 2.0 · Gemini Flash · Vertex AI Search · Cloud Run · Cloud Trace · Firebase (Firestore + Storage) · ElevenLabs · Next.js · Vercel · Sentry
