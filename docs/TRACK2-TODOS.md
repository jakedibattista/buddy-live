# Track 2 — backlog / do later

Action items from the Track 2 build and Q&A. Not blocking day-to-day coach
use unless noted. Plain-language context:
[`TRACK2-LAYMAN.md`](TRACK2-LAYMAN.md). Technical plan:
[`TRACK2-PLAN.md`](TRACK2-PLAN.md).

**Phase-by-phase learnings and eval baselines:**
[`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md) — update this as each
phase lands.

**Before human testing:** [`PRE-HUMAN-TEST-CHECKLIST.md`](PRE-HUMAN-TEST-CHECKLIST.md)

---

## Docs (quick)

- [x] **Commit and push** Track 2 docs to `main`
- [ ] Skim [`TRACK2-LAYMAN.md`](TRACK2-LAYMAN.md) before demos so talking points match what shipped

---

## Phase 1 — Evals & Hockey IQ testing

- [x] **Prereqs:** `cd services/buddy-live-adk`, `make install`, `GOOGLE_API_KEY` in `.env`
- [x] **Baseline:** `make eval` — 6 scenarios (incl. Marcus returning player `5f36f631`)
- [x] **Edge cases:** `make eval-failures` — logs in `evals/baselines/pre-human-*.log`
- [x] **IQ-only run:** eval id `285f6d24` (Sam / no space → `iq_coach`)
- [x] **Marcus returning scenario** in eval set (`coaching_scenarios.evalset.json` / `conversation_scenarios.json`)
- [ ] **Add IQ scenarios:** only if new personas needed post-human-test

**Budget:** ~$0.05–0.20 per scenario (agent + user sim + judges).

---

## Phase 2 — Cloud Trace (production demo)

- [x] **One-time GCP:** grant `roles/cloudtrace.agent` to `buddy-live-adk@puck-buddy.iam.gserviceaccount.com`
- [x] **Cloud Run env:** `BUDDY_ENABLE_CLOUD_TRACE=1` on `buddy-live-adk`
- [ ] **Verify:** live session on Vercel → Trace Explorer → `buddy_live.turn` spans (during your smoke)

---

## Phase 3 — Vertex AI Search / knowledge corpus

- [x] **One-time:** data store `buddy-live-drills`, JSONL ingest, IAM, Cloud Run env var
- [x] **Verify (local):** `lookup_drill_knowledge('wristshot')` → `available: true`, 3 results
- [ ] **Verify (live):** Cloud Trace shows `lookup_drill_knowledge` with `available: true` during recap
- [ ] **Optional content:** Puck Buddy / YouTube copy into `knowledge/*.md`, re-run `infra/scripts/setup_vertex_search.py`

Setup script: [`infra/scripts/setup_vertex_search.py`](../infra/scripts/setup_vertex_search.py)

---

## Phase 4 — Returning-player memory

- [x] **Demo seed:** `session_summaries/demo-prior-marcus-jake` + `demo-prior-marcus-alt` (Jake uids)
- [ ] **Verify on Vercel:** same browser, say "Marcus" → welcome-back (your smoke)
- [x] **Memory scoped to `user_id`** — no first-name collision across devices
- [ ] **Optional upgrade:** Vertex AI Memory Bank + Agent Engine

Seed helper: `python3 infra/scripts/seed_demo_memory.py <user_id>`

---

## Phase 6 — Agent Optimizer (GEPA)

- [x] **Harness fixed** — timeout, null-score patch, session-level scoring
- [x] **Full run** — validation 1.0, seed retained; see journal
- [ ] **Optional re-run** after human smoke (likely keeps seed)
- [x] **Do not merge** optimizer output blindly — reverts sub-agent prompts
- [ ] **Optional:** Vertex ADC for `safety_v1` in local evals

---

## Phase 5 — Multi-agent

- [x] **`vision_coach`**, **`drill_coach`**, **`iq_coach`**, eval baselines
- [x] **Skipped (by design):** memory sub-agent
- [x] **Deferred:** thin orchestrator, Workflow graph

---

## Hackathon / demo narrative (after human smoke passes)

- [x] **Before:** eval-failures baselines captured for framing + analysis-timeout
- [ ] **Toolkit:** Cloud Trace screenshot + eval output table from journal
- [ ] **After:** returning-player demo on production + optional GEPA narrative
- [ ] **Assets:** demo video, 1-pager, architecture diagram

---

## Done (reference — no action)

- Phase 1–6 core harness and production wiring
- Phase 5 sub-agents (`68c7c11`), memory user_id fix (`ff8083c`)
- Cloud Trace + Vertex Search enabled on Cloud Run (2026-05-30)
- Eval baselines in [`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md)
