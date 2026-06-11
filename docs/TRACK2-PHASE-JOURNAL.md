# Track 2 — phase journal

Living log of what we ship, measure, and learn as we move through Track 2
phases. Use this for hackathon narrative and handoffs. Backlog:
[`TRACK2-TODOS.md`](TRACK2-TODOS.md). Technical plan:
[`TRACK2-PLAN.md`](TRACK2-PLAN.md).

---

## Sequencing (2026-05-30) — completed

Plan we followed before submission packaging (all steps done):

1. Cheap **pre-refactor eval-failures baseline** (snapshot scores)
2. **Phase 5 multi-agent** splits (incremental sub-agents)
3. **Deploy** each slice → verify on Vercel production
4. **Post-split eval-failures** baseline (compare scores)
5. **GEPA optimize** once agent shape stabilizes (optional re-run)
6. Ops toggles (Cloud Trace, Vertex Search) + hackathon submission → **done** (`submission/`)

**Why:** GEPA only optimizes the **root** instruction. Splitting sub-agents
after a prompt merge would throw away optimizer work. Eval baselines before/after
each split give a measurable “before / after” story for judges.

---

## Phase 6 — GEPA harness fix + full run

**Commits:** `dc1df1d` (harness + first vision split), `52f8652` (null-score patch)

### Problem

`make optimize` hung ~24h with zero log output (`evals/optimize_runs/run_log.txt`
empty). No wall-clock cap; eval loop never surfaced progress.

### Root causes (compounding)

| Issue | Effect |
| --- | --- |
| `evaluate_intermediate_nl_responses: true` | ~24 LLM judge calls **per scenario** (every turn) |
| GEPA reflection default `thinking_budget=10240` on `gemini-2.5-flash` | Slow reflection even when optimizer model is flash |
| `future.result()` with no timeout | Blocks forever if eval stalls |
| `safety_v1` via Vertex | 401 with API key only — slow failures, not the infinite loop |
| ADK bug: `_extract_eval_data` on `score=None` | Crash during GEPA reflection when `safety_v1` is NOT_EVALUATED |

### Fixes

- `evals/run_optimize.py` — in-process runner, 60m wall-clock default, logging,
  auto `BUDDY_EVAL_FAILURES=1`
- `evals/adk_patches.py` — null-score patch for `LocalEvalSampler._extract_eval_data`
- `optimize_config.json` — `thinking_budget: 0`, `max_metric_calls: 8`
- `optimize_sampler_config.json` — session-level hallucinations scoring, 16 turn cap
- Smoke configs + `make optimize-smoke` for quick harness checks

### Results (2026-05-30)

| Run | Duration | Outcome |
| --- | --- | --- |
| Smoke | ~6 min | Exit 0 |
| Full (`run_20260530_211059.log`) | ~13 min | Validation **1.0**, `best_idx=0` (seed prompt kept) |

**Decision:** Do **not** merge GEPA `best_prompt.txt` into `prompts.py` — seed
was best; merging would revert `vision_coach` / `drill_coach` prompt splits.

**Learnings for future runs:**

- Optimize config uses **hallucinations_v1 only** (sampler crashes on null safety scores).
- Full `make eval` still runs both criteria; `safety_v1` needs Vertex OAuth / ADC.
- Re-run GEPA after Phase 5 stabilizes if we want optimizer credit on the thinner root prompt.

---

## Eval baselines — `make eval-failures`

Snapshots live under `services/buddy-live-adk/evals/baselines/` (gitignored logs
— copy key numbers here when re-running).

### Pre–Phase 5 (before sub-agent splits)

Captured 2026-05-30 → `pre-phase5-eval-failures.log`

| Eval ID | Scenario | hallucinations_v1 |
| --- | --- | --- |
| `285f6d24` | IQ handoff (Sam, no space) | 0.70 |
| `9840778e` | Framing struggle (Riley) | 0.81 |
| `b12a9a4d` | Analysis timeout (Alex) | 0.89 |
| `27376a9d` | Eager / disorganized (Jordan) | 0.62 |
| `f8dd685a` | Happy path (Tyler) | 0.94 |

**5/5 passed** (threshold 0.5). `safety_v1`: NOT_EVALUATED (API key ≠ Vertex).

### Post–Phase 5 (`vision_coach` + `drill_coach`)

Captured 2026-05-30 → `post-phase5-drill-coach-eval-failures.log`
After commit `68c7c11`.

| Eval ID | Scenario | Pre | Post | Δ |
| --- | --- | --- | --- | --- |
| `285f6d24` | IQ handoff | 0.70 | **0.84** | ↑ |
| `9840778e` | Framing struggle | 0.81 | **0.88** | ↑ |
| `b12a9a4d` | Analysis timeout | 0.89 | **0.75** | ↓ |
| `27376a9d` | Eager / disorganized | 0.62 | **0.72** | ↑ |
| `f8dd685a` | Happy path | 0.94 | **0.82** | ↓ |

**5/5 still passed.** Alex/Tyler dipped slightly — likely transfer-boundary
noise at root → `drill_coach` handoff, not a functional regression (happy-path
eval log shows correct `transfer_to_agent('drill_coach')` after setup).

---

## Phase 5 — multi-agent decomposition

**Status:** Core splits **done** (2026-05-30). Memory sub-agent and thin
orchestrator **skipped**.

### Agent tree (production + eval mirror)

```
buddy_live_coach (root)
  tools: start_warmup_timer, set_focus_drill,
         remember_player_profile, load_player_memory  (4 tools)
  ├─ vision_coach   — peek_camera, peek_warmup
  ├─ drill_coach    — rep capture, analyze, scorecard, recap, drill knowledge
  └─ iq_coach       — show_iq_visual, mark_iq_answer, lookup_drill_knowledge
```

**Commits:** `dc1df1d` (`vision_coach`), `68c7c11` (`drill_coach`)

### Slice 1 — `vision_coach`

**When root transfers:** Player asks for a camera check, or verbal setup fails
twice and vision is needed.

**Default path unchanged:** Verbal setup confirmation; `set_focus_drill` still
auto-sets `setup_framing_passed: true` (production behavior from May).

**Learning:** Vision tools belong in a specialist — root prompt shrank and
framing-struggle eval **improved** (0.81 → 0.88 post full split).

### Slice 2 — `drill_coach`

**When root transfers:** After setup / warm-up — drill readiness through
`end_session_recap`.

**Root prompt:** Sections 4–6 (drill readiness, scored rep, recap) moved to
`DRILL_COACH_PROMPT`. Reconnect rules updated: if session is in drill/recap
phase, transfer to `drill_coach`, not root-only recovery.

**Learning:** Keep `evals/agent_module/agent.py` in **lockstep** with
`app/agent.py` — evals import a parallel `root_agent`; drift causes false
pass/fail. Run `make test` after every split (43 tests, includes tool count).

### Intentionally skipped

| Item | Reason |
| --- | --- |
| **Memory sub-agent** | `remember_player_profile` / `load_player_memory` fire mid-opening; awkward transfer UX |
| **Thin orchestrator-only root** | Diminishing returns — root already 4 tools + 3 sub-agents |
| **Workflow graph rewrite** | High effort; needs staging Cloud Run — see [`ARCHITECTURE.md`](ARCHITECTURE.md) |

---

## Deploy verification

| Surface | How we verify |
| --- | --- |
| **Vercel frontend** | Push to `main` → [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) |
| **Cloud Run ADK** | GitHub Actions `Deploy ADK Backend` on push to `main` |
| **No local Next.js** | Firebase admin keys not configured locally — Vercel-only QA policy |

Post–`68c7c11`: Vercel READY; Cloud Run deploy ~3m18s success.

---

## Phase 4 fix — memory scoped to `user_id` (2026-05-30)

**Problem:** `load_player_memory` matched first name only — two kids named Alex
could get each other's welcome-back line.

**Fix:** Lookup requires Firebase anonymous `user_id` (from `live_sessions`) and
spoken name. `ensure_session` hydrates ADK state from Firestore. No valid
`user_id` → `has_prior_session: false`.

**Tests:** collision regression test added; 45/45 pass.

---

## What's next (2026-06-07)

Hackathon submission packet shipped in [`submission/`](submission/). Still open:
**demo video** + **Cloud Trace screenshot** — see [`TRACK2-TODOS.md`](TRACK2-TODOS.md).

Proof session for judges: `session_summaries/live-3oxrisz06vae` (wristshot, 1 rep, recap).

---

## Ops shipped (2026-05-30)

| Item | Detail |
| --- | --- |
| **Vertex Search** | Data store `buddy-live-drills`, 9 docs via JSONL import; `lookup_drill_knowledge('wristshot')` → 3 results |
| **Cloud Run env** | `BUDDY_ENABLE_CLOUD_TRACE=1` + `BUDDY_VERTEX_SEARCH_DATA_STORE_ID` (rev `00053-2rw`+) |
| **Eval baselines** | `make eval` 6/6 PASSED; `make eval-failures` 6/6 PASSED (2026-05-30) |
| **Scripts** | `infra/scripts/setup_vertex_search.py`, `infra/scripts/seed_demo_memory.py` |

Deferred (documented in [`ARCHITECTURE.md`](ARCHITECTURE.md)): durable `SessionService`, Workflow graph, voice welcome-back on connect.

---

## Phase 5 — first ADK 2.0 monitor → improve loop (2026-05-31)

First time we closed the loop: a real human session, observed end-to-end via
ADK 2.0 + Cloud Run + Firestore, then fixed in code. Session
`live-pmhtnko9t195` (user `rWQVTNV2gseow9slWw3fGZuxg4P2`) started clean but
degraded toward the end.

**What we observed (from Cloud Run logs + Firestore session state):**

| Symptom | Root cause |
| --- | --- |
| Coach went quiet, player said "all done / hello?" | After the scored rep landed, the agent had no signal results were ready — it relied on passive `get_rep_result` polling and drifted into small talk |
| Score was visible on screen but never reviewed over voice | Results-ready only triggered a *visible* transcript line; nothing was pushed to the ElevenLabs agent |
| Player expected a cool-down after the slap shot | Prompt had no cool-down framing — recap never positioned as the wind-down |
| Spoken "3, 2, 1" drifted from the on-screen count-in | Prompt told the coach to count out loud, racing the UI's 3 s lead-in overlay |
| `UserWarning` on every rep gate read | Firestore positional `.where("status","==",...)` is deprecated |

**What shipped:**

| Fix | Files |
| --- | --- |
| **Results-ready push** — the instant `results_ready_at` lands, the client sends the agent a hidden `(Scored rep results are ready …)` note so the coach immediately calls `get_rep_result`, announces the score, and moves to recap instead of stalling | `lib/hiddenAgentMessages.ts`, `components/coach/CoachConversation.tsx`, `app/coach/CoachPageClient.tsx` |
| **Cool-down framing** — recap now explicitly *is* the cool-down; if the player asks for one, coach gives one easy stretch then recaps | `app/prompts.py` (`DRILL_COACH_PROMPT` §3) |
| **No-go-silent during analysis** — explicit instruction to reassure + give a light stretch if the player asks "are we done?" while scoring | `app/prompts.py` (`DRILL_COACH_PROMPT` §2d/2g) |
| **Count-in sync** — coach no longer counts "3, 2, 1" out loud; the on-screen overlay owns the lead-in | `app/prompts.py` (main coach §2d) |
| **Firestore warning** — switched both rep-gate reads to `FieldFilter` keyword form | `app/callbacks.py` |

**What we learned:** structural pushes beat prompt hope. The agent can't react
to state it never sees — surfacing results-ready as an explicit system message
(same pattern as voice-reconnect / warm-up-done) is far more reliable than
telling the model to "keep polling." The reconnect path already carried an
`awaitingReview` clause, so a connected session was the gap.

**Still open (at the time):** voice-link churn (ElevenLabs reconnects
mid-session) — addressed across sessions 2–4 below.

---

## Phase 5 — monitor→improve loop, sessions 2–4 (2026-05-31)

Three more real human sessions, same loop: observe via Cloud Run logs +
Firestore + the actual uploaded clip, then fix in code and redeploy.

### Session `live-tc0ot4sklzju` — voice drops + blank scorecard (`890578b`)

| Symptom | Root cause | Fix |
| --- | --- | --- |
| ~8 voice reconnects in 8 min | ElevenLabs WebRTC churn | Keep WebRTC primary, raise reconnect attempts 5→8, longer backoff |
| Scored rep showed a blank card; coach faked a review | Analyzer returned a "completed" rep with all-null metrics | `get_rep_result` now returns `status=unscoreable`; scorecard shows a reshoot hint; `drill_coach` told to be honest, no invented numbers |
| Results-ready push lost during a drop | Push was gated on a live connection | Mark pending + flush on reconnect |

### Session `live-lp7g1qbep1s1` — silence drops (`759c7dc` + ElevenLabs settings)

| Symptom | Root cause | Fix |
| --- | --- | --- |
| "If I'm quiet ~10s you say 'quick glitch'" | Link idled out during silent warm-up / analysis windows | `sendUserActivity()` keepalive (pulse every 5s) while the warm-up timer runs or a rep is analyzing |
| Drop telemetry never recorded | `voice_events` subcollection denied by `firestore.rules` | Write drops to `coach_log` (already allowed), tagged `event: "voice_drop"` |
| — | ElevenLabs agent timeouts (owned by us, not code) | Raised "Max conversation duration" 600→1800s, "Take turn after silence" 7→~15s |

### Session `live-yvu3h1au2npn` — portrait win, three new issues (`237280b`, `34affb8`)

We pulled the actual clips from Storage and probed them. **Root cause of the
earlier "unscoreable" reps was orientation:** the clip that scored was
**portrait 720×1280** with the player large in frame; the failing ones were
**landscape 1280×720**, player small. The analyzer only scores portrait,
fill-the-frame clips.

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Clips came back unscoreable | Camera requested **landscape** (`1280×720`) | Request **portrait** (`720×1280`, 9:16). Verified: next clip recorded `748×1328`. |
| Wanted to skip the warm-up | No skip path | "Skip to shooting" quick prompt + root-coach prompt rule (still needs a drill + framing) |
| Coach **spoke its scratchpad** to a 5yo (`_thought … (21 words) Let's call get_rep_result…`) | `_clean_coach_text` only stripped `(thought)` parens | Skip Gemini `thought` parts at the source + backstop that strips `_thought` blocks (keeps quoted reply) + prompt rule "never narrate reasoning". Regression-tested. |
| Open-ended balance holds with no end ("keep holding… other foot…") stranded a young kid; IQ too advanced | `drill_coach` wait-time behavior + no age floor | One short self-terminating recovery cue, no piling on, skip hockey jargon for ages ≤7 |
| Unscoreable message blamed framing when the player *was* fully in frame | Copy assumed framing was the only failure mode | Reworded card + coach hint to "couldn't lock onto a clear shot — take one big full shot" |

### The real analysis failure (handed to `modelforpuckbuddy`)

The portrait clip was clean and the player *did* take a backhand at ~15.8s —
Gemini's own `coach_summary` says so. But:

- MediaPipe proposed only 4 candidates, all **walking/setup** (`0.07s`,
  `4.3s`, `6.4s`, `21.4s`); Gemini correctly killed all 4 as false detections.
- The **real shot at 15.8s was never a candidate**, so `structured_shots`
  came back empty → null metrics.
- `review_validator` also stripped the coaching metrics as "hallucinated"
  because the labels (`'Clean Blade Contact'` …) don't match the canonical
  backhand keys.

**This is a `modelforpuckbuddy` (model-worker) bug, not Buddy Live.** Handoff:
(1) scan the full clip and detect the *shot release*, not locomotion;
(2) score the LLM-named shot timestamp when MediaPipe misses it;
(3) pin coaching output to canonical metric keys; (4) ignore dead time at both
ends but keep the middle. Owner: Jake. Optional bridge from this repo — pass a
`shot_hint_seconds` (from `stop_rep_capture` or the player saying "shot!") into
`/api/analyze-video`.

**What we learned:** pull the real artifact, don't guess. Probing the clip
(`ffprobe` + a mid-frame) turned "analysis is broken" into three distinct,
separately-owned root causes (client orientation, our coach behavior, their
shot detector).

---

## Phase guard expansion (2026-06-06)

**What shipped:** Extended `phase_guard` beyond the original rep/recap/vision
gates so high-risk tools are blocked in code, not just in prompts.

| Guard | Why |
| --- | --- |
| `set_focus_drill` once per session | Stops duplicate drill writes and blocks re-entry during `iq_practice` |
| `show_iq_visual` shooting-flow block | Keeps IQ visual cards in `iq_coach` — shooting sessions use verbal inline IQ only |
| `analyze_rep` framing gate | Same prerequisites as `start_rep_capture` (`focus_drill` + `setup_framing_passed`) |

**Files:** `app/callbacks.py`, `tests/test_phase_guard.py`

**What we measured:** `make test` — 59 passed (11 new phase-guard cases).

**What we learned:** prompt-only flow control was the main weakness in the
sub-agent split; structural gates on the ~7 highest-risk tools close the gap
without needing a full ADK Workflow graph rewrite.

**What's next:** deploy ADK to Cloud Run so production picks up the new guards.

---

## Submission-day hardening (2026-06-11)

**What shipped:**

- `evals/adk_patches.py` — `apply_vertex_safety_adc_fix()`: ADK's
  `_VertexAiEvalFacade` prefers `GOOGLE_API_KEY` and builds
  `vertexai.Client(api_key=...)`, which 401s against the Vertex Gen AI Eval
  service. The patch (opt-in `BUDDY_SAFETY_VERTEX_ADC=1`) hides the API key
  only while the facade constructs its client, so the safety judge uses ADC
  (`puck-buddy` / `us-central1`) while the agent and user simulator keep the
  Gemini API key. Applied at import in `evals/agent_module/agent.py`.

**What we measured:**

1. **safety_v1 first-ever run** (`BUDDY_SAFETY_VERTEX_ADC=1 make eval`):
   **1.0 on all 6 scenarios** at threshold 0.8; hallucinations_v1 also 6/6.
   Log: `evals/baselines/2026-06-11-safety-adc-eval-happy.log`.
2. **Regression investigation** — two fresh `make eval-failures` runs on the
   unchanged post-split agent
   (`2026-06-11-rerun{1,2}-eval-failures.log`):

   | Scenario | Post 05-30 | 06-11 R1 | 06-11 R2 |
   | --- | --- | --- | --- |
   | IQ handoff | 0.84 | 0.65 | 0.78 |
   | Framing struggle | 0.88 | 0.60 | 0.79 |
   | Analysis timeout | 0.75 | 0.87 | 0.71 |
   | Eager / disorganized | 0.72 | 0.67 | 0.83 |
   | Happy path | 0.82 | 0.90 | 0.76 |
   | Returning (Marcus) | — | 0.90 | 1.00 |

**What we learned:** the suspected post-split "regressions" (Alex 0.89→0.75,
Tyler 0.94→0.82) recovered with zero code changes, while Riley swung
0.88→0.60→0.79 on identical code — per-scenario judge variance is
±0.15–0.28. Single-run deltas inside that band are noise in *either*
direction; the reproducible signal is the 100% pass rate on every suite
execution. Submission docs updated to claim only that.

**What's next:** demo video + Cloud Trace screenshot (last open items).

---

## Submission-day live triage (2026-06-11 PM)

**What shipped** (commits `8872c08` → `a4761a3` → `27a9491`, all deployed to
Vercel + Cloud Run):

| Area | Fix | Session / trigger |
| --- | --- | --- |
| Voice resilience | Full-session `sendUserActivity()` keepalive (5s), tab-visibility reconnect, richer `voice_drop` telemetry in `coach_log` | `live-inibrtfoscyy` — drops during silence |
| ElevenLabs agent | User updated dashboard: `turn_timeout` 60s, `turn_v3`, `max_duration_seconds` 1800, `silence_end_call_timeout` -1 | Same |
| Turn sanitization | Inline `<thought>` tags stripped anywhere in coach text | `live-3gh4vmj133s5` — coach spoke its reasoning |
| Turn dedupe | Extending utterances with real new content no longer dropped; results-ready pushes deduped 10 min | `live-3gh4vmj133s5`, `live-inibrtfoscyy` |
| Post-shot UX | Mandatory cool-down announcement after rep stop; unscoreable rep gets one retake (`phase_guard`) | `live-utn2frbv3uva` |
| IQ scorecard UI | Study recommendations above breakdown; scroll fix; hide camera PiP on IQ recap | `live-3gh4vmj133s5` |
| IQ diagrams | 2-on-1 defender scenario shows both attackers | `live-3gh4vmj133s5` |
| Fresh greet | `load_player_memory` **unwired** from root agent — tool docstring caused spontaneous "welcome back" | `live-fyg7c9kmng6g` |
| Scorecard review | Announce + consent ("scorecard's ready — walk through it?"), paced 2-step review, goodbye gated | `live-fyg7c9kmng6g` — player spelled out desired flow |
| Reconnect context | `player_name` from Firestore re-sent on voice reconnect (backend restart had dropped "Jake" → "buddy") | `live-fyg7c9kmng6g` — deploy mid-session |

**What we measured:**

- `make test` — **67 passed** after all slices.
- Production health: `buddy-live-adk` `/health` OK; Vercel `/coach` 200 on SHA `27a9491`.
- Cloud Trace: session `live-3gh4vmj133s5` (full IQ recap flow) — suitable for screenshot.

**What we learned:**

- Tool docstrings are implicit instructions — `load_player_memory` fired despite the
  prompt not calling it. Structural fix (unwire) beats prompt hope.
- A prior rule ("do not ask ready to review?") fixed end-of-session stalls but caused
  the opposite failure: dumping the full scorecard in one breath. Replaced with
  announce → wait → paced walkthrough.
- Cloud Run deploy mid-session wipes `InMemorySessionService` — reconnect context must
  carry player name, not just drill/phase/rep state. **Do not push to `main` while filming.**

**What's next:** user films 3-min Devpost video using
[`submission/DEMO-TALKING-POINTS.md`](submission/DEMO-TALKING-POINTS.md); grab Cloud
Trace screenshot from `live-3gh4vmj133s5` or a fresh turn.

---

## How to update this doc

After each phase slice or significant eval run, add a dated subsection with:

1. **What shipped** (commit SHA, files touched)
2. **What we measured** (eval scores or deploy check)
3. **What we learned** (root cause, decision, trade-off)
4. **What's next** (one line)

Keep tables small; link to `evals/baselines/*.log` for raw output.
