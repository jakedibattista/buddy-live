# Track 2 — phase journal

Living log of what we ship, measure, and learn as we move through Track 2
phases. Use this for hackathon narrative and handoffs. Backlog:
[`TRACK2-TODOS.md`](TRACK2-TODOS.md). Technical plan:
[`TRACK2-PLAN.md`](TRACK2-PLAN.md).

---

## Sequencing (2026-05-30)

We agreed to front-load **architecture bets** before polish and demo assets:

1. Cheap **pre-refactor eval-failures baseline** (snapshot scores)
2. **Phase 5 multi-agent** splits (incremental sub-agents)
3. **Deploy** each slice → verify on Vercel production
4. **Post-split eval-failures** baseline (compare scores)
5. **GEPA optimize** once agent shape stabilizes (optional re-run)
6. Ops toggles (Cloud Trace, Vertex Search, Marcus seed) + hackathon submission

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

## What's next

- [x] Ops: Vertex Search data store, Marcus demo seed, Cloud Trace
- [x] **Pre-human eval gate:** `make eval` 6/6 passed (2026-05-30)
- [ ] **Your smoke:** see [`PRE-HUMAN-TEST-CHECKLIST.md`](PRE-HUMAN-TEST-CHECKLIST.md)
- [ ] Hackathon: demo video, 1-pager, architecture diagram (after smoke)
- [ ] Optional: GEPA re-run, Vertex ADC for safety_v1

---

## Ops shipped (2026-05-30, pre-human test)

| Item | Detail |
| --- | --- |
| **Vertex Search** | Data store `buddy-live-drills`, 9 docs via JSONL import; `lookup_drill_knowledge('wristshot')` → 3 results |
| **Cloud Run env** | `BUDDY_ENABLE_CLOUD_TRACE=1` + `BUDDY_VERTEX_SEARCH_DATA_STORE_ID` (rev `00053-2rw`+) |
| **Marcus seed** | Firestore `demo-prior-marcus-jake` (uid `UXNBj…`), `demo-prior-marcus-alt` (uid `PZGW…`) |
| **Eval baselines** | `make eval` 6/6 PASSED; `make eval-failures` 6/6 PASSED (2026-05-30) |
| **Scripts** | `infra/scripts/setup_vertex_search.py`, `infra/scripts/seed_demo_memory.py` |
- [ ] Deferred: durable `SessionService`, Workflow graph

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

**Still open:** voice-link churn (ElevenLabs reconnects mid-session) needs
browser-console drop reasons before we can act — logged in `CoachConversation`
`onDisconnect` warnings.

---

## How to update this doc

After each phase slice or significant eval run, add a dated subsection with:

1. **What shipped** (commit SHA, files touched)
2. **What we measured** (eval scores or deploy check)
3. **What we learned** (root cause, decision, trade-off)
4. **What's next** (one line)

Keep tables small; link to `evals/baselines/*.log` for raw output.
