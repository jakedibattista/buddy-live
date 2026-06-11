# Track 2 — remaining work

Phases 1–6 are **done**. Human smoke and iteration loops are **done**. This file
lists only what is still open — not a history of completed work (see
[`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md)).

**Hackathon submission:** [`submission/`](submission/) (1-pager, video script, judge toolkit, diagrams).

---

## Devpost (you)

- [x] **3-min demo video**: [share.descript.com/view/w8U2RQQBIV4](https://share.descript.com/view/w8U2RQQBIV4)
- [x] **Cloud Trace screenshot**: filter `buddy_live.turn`; proof session `live-3gh4vmj133s5` (2026-06-11) captured ([`submission/JUDGE-TOOLKIT.md`](submission/JUDGE-TOOLKIT.md))
- [x] Skim [`submission/DEMO-TALKING-POINTS.md`](submission/DEMO-TALKING-POINTS.md) before filming — **do not push to `main` during a live demo** (Cloud Run restart wipes in-memory ADK state)

**Production deploy (2026-06-11):** `27a9491` on Vercel + Cloud Run — includes voice hardening, fresh-greet policy, scorecard review flow.

---

## Optional (post-Devpost)

| Item | Notes |
| --- | --- |
| Live `lookup_drill_knowledge` verify in Trace during recap | Grounding works locally; screenshot optional |
| More IQ eval personas | Only if human testing surfaces gaps |
| GEPA re-run | Seed prompt was best on first full run |
| Knowledge corpus re-ingest | **19** `.md` files shipped (warm-ups, recovery, homework, IQ catalog, `sources.md`). Re-upload to GCS + Discovery Engine import after edits — see `services/buddy-live-adk/knowledge/README.md` |
| Voice welcome-back on connect | `load_player_memory` exists in `app.tools` but is unwired from the agent (it fired spontaneously via its docstring — `live-fyg7c9kmng6g`); re-wire + prompt rule when shipping welcome-back deliberately |
| Vertex Memory Bank / Agent Engine | Upgrade path; Firestore `session_summaries/` ships today |
| ADK Workflow graph | See deferred section in [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Interrupt / barge-in button | Deferred; `CoachAudioMuteButton` ships instead |
| `modelforpuckbuddy` shot detection | Owner: other repo; happy path proven (`live-3oxrisz06vae`) |
