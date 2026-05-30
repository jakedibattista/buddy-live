# Track 2 — backlog / do later

Action items from the Track 2 build and Q&A. Not blocking day-to-day coach
use unless noted. Plain-language context:
[`TRACK2-LAYMAN.md`](TRACK2-LAYMAN.md). Technical plan:
[`TRACK2-PLAN.md`](TRACK2-PLAN.md).

**Phase-by-phase learnings and eval baselines:**
[`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md) — update this as each
phase lands.

---

## Docs (quick)

- [ ] **Commit and push** `docs/TRACK2-LAYMAN.md` (and this file if new) to `main`
- [ ] Skim [`TRACK2-LAYMAN.md`](TRACK2-LAYMAN.md) before demos so talking points match what shipped

---

## Phase 1 — Evals & Hockey IQ testing

- [ ] **Prereqs:** `cd services/buddy-live-adk`, `make install`, `GOOGLE_API_KEY` in `.env`
- [ ] **Baseline:** `make eval` (all scenarios, happy-path mocks)
- [ ] **Edge cases:** `make eval-failures` (framing loop, analysis timeout injections)
- [ ] **IQ-only run:** see [Hockey IQ testing](TRACK2-LAYMAN.md#hockey-iq-testing-synthetic-player) — usually eval id `285f6d24` (Sam / no space → `iq_coach`)
- [ ] **Add IQ scenarios:** edit `evals/conversation_scenarios.json` → refresh eval set (`make eval-setup` or `adk eval_set add_eval_case`) → re-run
- [ ] **Refresh eval set** if Marcus “returning player” scenario (6th entry) is missing from `coaching_scenarios.evalset.json`

**Budget:** ~$0.05–0.20 per scenario (agent + user sim + judges).

---

## Phase 2 — Cloud Trace (production demo)

- [x] **One-time GCP:** grant `roles/cloudtrace.agent` to `buddy-live-adk@puck-buddy.iam.gserviceaccount.com`
- [x] **Cloud Run env:** `BUDDY_ENABLE_CLOUD_TRACE=1` on `buddy-live-adk` (rev `00051-9gr`, 2026-05-30)
- [ ] **Verify:** live session on Vercel → Trace Explorer → `buddy_live.turn` spans

---

## Phase 3 — Vertex AI Search / knowledge corpus

- [ ] **One-time:** create Discovery Engine data store, upload `knowledge/*.md` to GCS, import, set `BUDDY_VERTEX_SEARCH_DATA_STORE_ID` on Cloud Run (steps in [`TRACK2-PLAN.md`](TRACK2-PLAN.md#deployment-1))
- [ ] **Verify:** Cloud Trace shows `tool.call [lookup_drill_knowledge]` with `available: true`
- [ ] **Optional content:** pull real copy from Puck Buddy app / curated YouTube curriculum into `knowledge/*.md`, re-ingest (not scraped today — see [layman doc](TRACK2-LAYMAN.md#phase-3--drill-knowledge-library-vertex-ai-search))

---

## Phase 4 — Returning-player memory

- [ ] **Demo seed:** add a `session_summaries` doc with **your** Firebase `user_id` (JSON in [`TRACK2-PLAN.md`](TRACK2-PLAN.md#demo-seed-a-returning-player))
- [ ] **Verify on Vercel:** same browser, say seeded name → welcome-back line
- [x] **Memory scoped to `user_id`** — no first-name collision across devices
- [ ] **Optional upgrade:** Vertex AI Memory Bank + Agent Engine (see Phase 4 optional block in `TRACK2-PLAN.md`)

---

## Phase 6 — Agent Optimizer (GEPA)

- [x] **Harness fixed** — `52f8652`+ (timeout, thinking_budget 0, null-score patch, session-level scoring)
- [x] **Full run** — ~13 min, validation 1.0, seed retained (`best_idx=0`); see journal
- [ ] **Optional re-run** after Phase 5 root prompt stabilizes (may still keep seed)
- [ ] **Merge prompt only if** GEPA beats seed on post-split `make eval-failures` — do not merge blindly (prior merge would revert sub-agent prompts)
- [ ] **Vertex ADC** if you want `safety_v1` during optimize (API key alone → NOT_EVALUATED)

Details: [`evals/OPTIMIZE.md`](../services/buddy-live-adk/evals/OPTIMIZE.md), [`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md#phase-6--gepa-harness-fix--full-run).

---

## Phase 5 — Multi-agent

- [x] **`vision_coach`** — `peek_camera`, `peek_warmup` (`dc1df1d`)
- [x] **`drill_coach`** — scored rep, analysis wait, scorecard, recap (`68c7c11`)
- [x] **`iq_coach`** — pre-existing
- [x] **Eval baselines** — pre/post snapshots in journal + `evals/baselines/`
- [ ] **Skipped (by design):** memory sub-agent (mid-opening transfer awkward)
- [ ] **Deferred:** thin orchestrator-only root, Workflow graph — see [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Hackathon / demo narrative (when ready)

- [ ] **Before:** `make eval-failures` on framing + analysis-timeout cases; screenshot low scores
- [ ] **Toolkit:** Cloud Trace stall example + eval output
- [ ] **After:** improved prompt (from Phase 6 or manual) + re-run evals; returning-player demo on production

---

## Done (reference — no action)

- Phase 1 harness, scenarios, environment simulation
- Phase 2 telemetry code (`BUDDY_ENABLE_CLOUD_TRACE` wiring)
- Phase 3 corpus + `lookup_drill_knowledge` + fallbacks
- Phase 4 `remember_player_profile` / `load_player_memory` + eval mocks
- Phase 5 core sub-agents (`vision_coach`, `drill_coach`, `iq_coach`) — `68c7c11`
- Phase 6 harness + full GEPA run (seed kept) — `52f8652`
- Eval baselines documented in [`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md)
- Vercel `cn` import fix; `IqVisualCard` null guard
