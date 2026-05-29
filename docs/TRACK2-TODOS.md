# Track 2 — backlog / do later

Action items from the Track 2 build and Q&A. Not blocking day-to-day coach
use unless noted. Plain-language context:
[`TRACK2-LAYMAN.md`](TRACK2-LAYMAN.md). Technical plan:
[`TRACK2-PLAN.md`](TRACK2-PLAN.md).

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

- [ ] **One-time GCP:** grant `roles/cloudtrace.agent` to `buddy-live-adk@puck-buddy.iam.gserviceaccount.com`
- [ ] **Cloud Run env:** `BUDDY_ENABLE_CLOUD_TRACE=1` on `buddy-live-adk` (after deploy)
- [ ] **Verify:** live session on Vercel → Trace Explorer → `buddy_live.turn` spans

---

## Phase 3 — Vertex AI Search / knowledge corpus

- [ ] **One-time:** create Discovery Engine data store, upload `knowledge/*.md` to GCS, import, set `BUDDY_VERTEX_SEARCH_DATA_STORE_ID` on Cloud Run (steps in [`TRACK2-PLAN.md`](TRACK2-PLAN.md#deployment-1))
- [ ] **Verify:** Cloud Trace shows `tool.call [lookup_drill_knowledge]` with `available: true`
- [ ] **Optional content:** pull real copy from Puck Buddy app / curated YouTube curriculum into `knowledge/*.md`, re-ingest (not scraped today — see [layman doc](TRACK2-LAYMAN.md#phase-3--drill-knowledge-library-vertex-ai-search))

---

## Phase 4 — Returning-player memory

- [ ] **Demo seed:** add a `session_summaries` doc for “Marcus” in Firebase console (JSON in [`TRACK2-PLAN.md`](TRACK2-PLAN.md#demo-seed-a-returning-player))
- [ ] **Verify on Vercel:** new session, say name Marcus → welcome-back line
- [ ] **Understand limit:** memory keys on **first name only**, not device; new browser works if they say the same name ([layman doc](TRACK2-LAYMAN.md#phase-4--welcome-back-memory))
- [ ] **Optional improvement:** filter `load_player_memory` by `user_id` (anonymous Firebase `uid`) to avoid two “Alex” kids colliding
- [ ] **Optional upgrade:** Vertex AI Memory Bank + Agent Engine (see Phase 4 optional block in `TRACK2-PLAN.md`)

---

## Phase 6 — Agent Optimizer (GEPA)

- [ ] **Harness on `main`:** commit `5e91cb6`+ (PYTHONPATH, `google-adk[eval]`, optimize uses `hallucinations_v1` only)
- [ ] **Run:** `make install-dev` then `make optimize` (~10–15 min, uses `.env` `GOOGLE_API_KEY`)
- [ ] **If it fails:** check log for null `safety_v1` — optimize config should omit safety; full `make eval` still runs both criteria
- [ ] **On success:** copy best prompt from CLI / `evals/optimize_runs/` → merge into `app/prompts.py` (`COACH_SETH_LIVE_PROMPT`) per [`evals/OPTIMIZE.md`](../services/buddy-live-adk/evals/OPTIMIZE.md)
- [ ] **After merge:** `make eval` + `make eval-failures` — capture before/after scores for hackathon narrative

---

## Phase 5 — Multi-agent (not started)

- [ ] Implement orchestrator + specialist agents (vision / drill / IQ / memory) per [`TRACK2-PLAN.md`](TRACK2-PLAN.md#phase-5--multi-agent-decomposition)

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
- Phase 6 harness (`make optimize`, configs, `OPTIMIZE.md`)
- Vercel `cn` import fix; `IqVisualCard` null guard
- Pushed: Phase 4+6 code (`fdf2c8b`), optimize harness fix (`5e91cb6`)
