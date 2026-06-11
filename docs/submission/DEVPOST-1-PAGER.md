# Buddy Live: ADK 1-Pager (Devpost and Judges)

**Live demo:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) (Vercel deployment protection, requiring Buddy Tech login)

**Repo:** [github.com/jakedibattista/buddy-live](https://github.com/jakedibattista/buddy-live)

---

## What it is

Buddy Live is a **real-time AI hockey coach** for kids practicing off-ice. The player talks through a mic, the coach watches via webcam, guides warm-up and drill setup, captures **one scored rep**, runs biomechanics analysis on the clip, reviews the scorecard over voice, and wraps with homework.

Built for the **Google Cloud / Devpost ADK hackathon** as part of **Track 2 (Optimize)**.

---

## The business case

**Thousands of kids already use the PuckBuddy app** to upload a clip and get a biomechanics scorecard. The #1 thing they asked for: **less reading, fewer button clicks, more coach**. Kids do not want to parse a report card; they want someone in the room saying "lower your knee, shoot again."

- **The market:** Youth hockey parents routinely pay **$80–150/hour** for private shooting coaches when they can find one. Buddy Live delivers a guided, scored practice session in a basement for the marginal cost of Gemini Flash tokens and voice minutes (cents per session).
- **The wedge:** PuckBuddy's existing user base and analysis API. Buddy Live is not a cold-start product. It is the interactive layer those users asked for, representing an obvious subscription upsell on an app families already trust.
- **The bigger bet: AI as a force for learning and health.** The same loop that gets a kid moving (talk, try, get scored, try again) is an effective learning loop. Hockey IQ mode already turns "no space to shoot" into a Socratic whiteboard session. Voice-first AI coaching makes deliberate physical and cognitive practice accessible to kids who would otherwise get neither.

---

## Track 2 Headline: Eval-Gated Refactoring Beat Prompt Optimization

Our agent worked in a sandbox and struggled with real kids. We treated that as an engineering problem, not a prompting problem:

1. **Built the harness first.** This consists of ADK User Simulation (synthetic players) and Environment Simulation where every tool is mocked with failure injection. Run using `make eval` and `make eval-failures`.
2. **Baselined**, then refactored the monolithic agent into **root and specialist sub-agents** (`drill_coach` and `iq_coach`), re-running the eval suite after every slice.
3. **Measured the structural fix and stress-tested our own measurement.** A single before/after run showed scores jumping on three scenarios and dipping on two. Instead of shipping that table, we re-ran the full failure-injection suite multiple times on the identical post-split agent. We found per-scenario LLM-judge variance of ±0.15–0.28 (for example, the framing struggle scenario scored 0.88, 0.60, and 0.79 across three separate runs of the identical code). The "regressions" recovered with zero code changes since they were simply judge noise. **The stable signal: every case-run across every suite execution passed the quality gate (hallucinations_v1), and traces confirm correct root to sub-agent transfers.** Refer to the full run-by-run table in [JUDGE-TOOLKIT.md](./JUDGE-TOOLKIT.md).
4. **Verified with the Agent Optimizer (GEPA)** that prompt rewriting could not beat the structural fix: a full GEPA run scored validation 1.0 with `best_idx=0`. The optimizer confirmed our post-split seed prompt was already the optimum. We kept the architecture, not a generated prompt.
5. **Closed the loop on real humans.** We observed live sessions via Cloud Trace, Cloud Run logs, and Firestore (`live-3gh4vmj133s5`, `live-inibrtfoscyy`, `live-utn2frbv3uva`, and `live-fyg7c9kmng6g`), with each producing root-caused fixes. These included keeping the voice stream active during silence, inline `<thought>` stripping, and pacing the scorecard walkthrough (announce-then-review instead of dumping the scorecard in one breath). We also added an unscoreable-rep retake policy, unwired `load_player_memory` to ensure fresh greetings, and carried the player's name in the reconnect context after backend restarts. All of these fixes were shipped to production in commit `27a9491` on June 11, 2026.
6. **Safety evaluation for a kids' product** using the Vertex Gen AI Eval service: **a perfect 1.0 on all six scenarios** at the 0.8 threshold on June 11, 2026. Routing the eval judge through Application Default Credentials (while the agent keeps its Gemini API key) required a small ADK patch inside `evals/adk_patches.py`.

---

## How we use Google ADK

| ADK primitive | Buddy Live usage |
| --- | --- |
| **`Agent` + `sub_agents`** | Root `buddy_live_coach` delegates to `drill_coach` and `iq_coach` using `transfer_to_agent` |
| **`Runner` + `SessionService`** | `InMemorySessionService` maps ElevenLabs `arbitrary_identifier` to ADK `session_id` |
| **Tools (15)** | Firestore commands, rep capture, analysis queue, IQ visuals, drill knowledge, and player memory |
| **`before_tool_callback`** | `phase_guard` enforces structural phase gates on the root and all sub-agents (Firestore-backed) |
| **User + Environment Simulation** | Synthetic players, mocked tools, and failure injection for the Track 2 eval harness |
| **Agent Optimizer (GEPA)** | Validation harness for the sub-agent refactor (seed prompt confirmed optimal) |
| **Streaming** | ADK SSE events translate to OpenAI-style chunks and stream to ElevenLabs TTS |

### Sub-agent split

| Agent | Owns |
| --- | --- |
| **Root** | Opening, space check, drill pick, warm-up timers, and `remember_player_profile` (the `load_player_memory` tool is omitted to greet users freshly every session) |
| **drill_coach** | One scored rep, analysis wait, scorecard review (featuring announce-and-consent pacing), and a grounded recap |
| **iq_coach** | Hockey IQ practice when the player lacks physical space to shoot |

### Structural guardrails (`phase_guard`)

These are code-enforced gates rather than prompt-only constraints: `set_focus_drill` is restricted to once per session, `show_iq_visual` is allowed only in Hockey IQ mode, and rep capture or analysis require verbal setup, an active drill, and follow a strict single-rep policy. The unit tests are defined in [`services/buddy-live-adk/tests/test_phase_guard.py`](../services/buddy-live-adk/tests/test_phase_guard.py).

---

## Why We Choose a Hybrid Architecture: A Deliberate Gemini Live Trade-Off

- **Brain: Google ADK 2.0 + Gemini Flash on Cloud Run** to handle all reasoning, tool calling, and sub-agent orchestration.
- **Voice via ElevenLabs Agents** to manage WebRTC duplex audio, turn detection, and TTS latency. It POSTs every turn to our ADK service using OpenAI-compatible SSE (`/chat/completions`). Only the wire format is OpenAI-shaped; the underlying intelligence is entirely powered by Gemini.
- **Shot analysis: existing `modelforpuckbuddy` pipeline** (MediaPipe, Roboflow, and Gemini coach summaries). Gemini Live's 1 FPS video cap cannot catch a ~150 to 300 ms wristshot release, meaning high-FPS clips must go to a dedicated analyzer.

Grounding is driven by **Vertex AI Search** using our 19-document `buddy-live-drills` corpus. Observability is powered by **Cloud Trace** (capturing `buddy_live.turn` spans) and **Sentry**. Persistence is managed through Firestore collections under `session_summaries/`.

---

## Proof of Real Sessions

| Session | Date | Flow | Evidence |
| --- | --- | --- | --- |
| **`live-3oxrisz06vae`** | 2026-06-03 | Full shooting: wristshot, 1 rep, recap | Located at `session_summaries/live-3oxrisz06vae`, showing `rep_count: 1`, scores populated, and `weakest_metric: topHand` |
| **`live-c6vkymv41exc`** | 2026-06-07 | IQ practice path | Located at `live_sessions` collection, showing `currentPhase: iq_practice` and `iq_question_goal: 8` |
| **`live-3gh4vmj133s5`** | 2026-06-11 | IQ recap + Cloud Trace proof | Full session showing complete trace history |
| **`live-fyg7c9kmng6g`** | 2026-06-11 | Creator demo wristshot | Drove scorecard review UX fix on Rep `919c76d216` |

(Documents inside the `live_sessions/` collection expire in 24 hours, while `session_summaries/` records persist forever for reviews.)

---

## Technical Stack

Google ADK 2.0 • Gemini Flash • Vertex AI Search • Cloud Run • Cloud Trace • Firebase (Firestore and Storage) • ElevenLabs • Next.js • Vercel • Sentry
